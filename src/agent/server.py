from __future__ import annotations

import asyncio
import os
import signal
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI
from contextlib import asynccontextmanager
import socket
import uuid
from typing import Dict
from pydantic import BaseModel

from dashboard.db import SessionLocal, init_db
from dashboard import models
from common.config import TrainConfig
from common import runner as train_runner


class StatusOut(BaseModel):
    state: str  # idle|running
    run_id: Optional[str] = None
    name: Optional[str] = None
    epoch: Optional[int] = None
    total_epochs: Optional[int] = None
    started_at: Optional[str] = None
    elapsed_seconds: Optional[float] = None
    eta_seconds: Optional[float] = None


def _discover_gpu(index: int | None = None) -> Dict:
    info: Dict = {
        "index": index if index is not None else 0,
        "uuid": None,
        "name": None,
        "total_mem_mb": None,
        "compute_capability": None,
    }
    try:
        import torch
        if torch.cuda.is_available():
            device_count = torch.cuda.device_count()
            idx = info["index"]
            if idx < 0 or idx >= device_count:
                idx = 0
            props = torch.cuda.get_device_properties(idx)
            info["index"] = idx
            info["name"] = getattr(props, "name", None)
            # total_memory is in bytes
            total = getattr(props, "total_memory", None)
            if total is not None:
                info["total_mem_mb"] = int(total // (1024 * 1024))
            major = getattr(props, "major", None)
            minor = getattr(props, "minor", None)
            if major is not None and minor is not None:
                info["compute_capability"] = f"{major}.{minor}"
            # Try to get a stable hardware UUID
            # PyTorch exposes uuid in newer versions
            u = getattr(props, "uuid", None)
            if u:
                info["uuid"] = str(u)
            else:
                # Fallback to nvidia-smi query
                import subprocess
                try:
                    out = subprocess.check_output([
                        "nvidia-smi",
                        "--query-gpu=uuid",
                        "--format=csv,noheader",
                        f"-i={idx}",
                    ], stderr=subprocess.DEVNULL, text=True, timeout=2.0)
                    uu = out.strip().splitlines()[0].strip()
                    info["uuid"] = uu if uu else None
                except Exception:
                    # As a last resort, build something deterministic from name+cc+mem
                    if info["name"] and info["compute_capability"] and info["total_mem_mb"]:
                        raw = f"{info['name']}|{info['compute_capability']}|{info['total_mem_mb']}"
                        info["uuid"] = f"FAKEGPU-{uuid.uuid5(uuid.NAMESPACE_DNS, raw)}"
    except Exception:
        # No torch or no cuda; leave defaults
        pass
    return info


class RunnerAgent:
    def __init__(self, agent_id: str, poll_interval: float = 3.0):
        self.agent_id = agent_id
        self.poll_interval = poll_interval
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._halt_requested = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._current_run_id: Optional[str] = None
        self._current_run_name: Optional[str] = None
        self._current_epoch: Optional[int] = None
        self._total_epochs: Optional[int] = None
        self._avg_epoch_time: Optional[float] = None
        self._started_at_ts: Optional[float] = None

    def status(self) -> StatusOut:
        with self._lock:
            if self._current_run_id is None:
                return StatusOut(state="idle")
            elapsed = time.time() - (self._started_at_ts or time.time())
            remaining_epochs = 0
            if self._current_epoch is not None and self._total_epochs is not None:
                remaining_epochs = max(0, self._total_epochs - max(0, self._current_epoch + 1))
            eta = None
            if self._avg_epoch_time is not None:
                eta = remaining_epochs * self._avg_epoch_time
            return StatusOut(
                state="running",
                run_id=self._current_run_id,
                name=self._current_run_name,
                epoch=self._current_epoch,
                total_epochs=self._total_epochs,
                started_at=datetime.fromtimestamp(self._started_at_ts or time.time(), tz=timezone.utc).isoformat(),
                elapsed_seconds=elapsed,
                eta_seconds=eta,
            )

    def request_halt(self):
        self._halt_requested.set()

    def _progress_cb(self, epoch: int, total: int, epoch_dur: float, _tb: Optional[str]):
        with self._lock:
            self._current_epoch = int(epoch)
            self._total_epochs = int(total)
            if self._avg_epoch_time is None:
                self._avg_epoch_time = float(epoch_dur)
            else:
                # simple moving average with weight 0.3 new, 0.7 old
                self._avg_epoch_time = 0.7 * self._avg_epoch_time + 0.3 * float(epoch_dur)
        # Persist epoch to DB for visibility
        db = SessionLocal()
        try:
            run = db.get(models.Run, self._current_run_id)
            if run:
                run.epoch = int(epoch) + 1  # human-friendly
                db.add(run)
                db.commit()
        finally:
            db.close()

    def _should_stop(self) -> bool:
        return self._halt_requested.is_set() or self._stop_event.is_set()

    def _select_next_run(self) -> Optional[models.Run]:
        db = SessionLocal()
        try:
            # Find the next queued run for this agent by priority/enqueue time
            q = (
                db.query(models.Job, models.Run)
                .join(models.Run, models.Job.run_id == models.Run.id)
                .filter(models.Run.state == "queued", models.Run.agent_id == self.agent_id)
                .order_by(models.Job.priority.desc(), models.Job.enqueued_at.asc())
            )
            row = q.first()
            if not row:
                return None
            job, run = row
            # Mark dequeued/running
            run.state = "running"
            run.started_at = datetime.utcnow()
            job.dequeued_at = datetime.utcnow()
            db.add(run)
            db.add(job)
            db.commit()
            db.expunge(run)
            return run
        finally:
            db.close()

    def _release_gpus(self, db, run: models.Run):
        if run.agent_id and run.gpu_indices:
            for idx in run.gpu_indices:
                gpu = (
                    db.query(models.GPU)
                    .filter(models.GPU.agent_id == run.agent_id, models.GPU.index == idx)
                    .first()
                )
                if gpu:
                    gpu.is_allocated = False
                    db.add(gpu)

    def _train_run(self, run: models.Run):
        # Build TrainConfig from stored config
        db = SessionLocal()
        try:
            cfg_row = db.get(models.TrainConfigModel, run.config_id)
            if not cfg_row:
                raise RuntimeError("Train config not found")
            cfg_dict = dict(cfg_row.config_json)
            # Convert autocast dtype string to torch dtype if needed
            try:
                import torch
                ac = cfg_dict.get("autocast_dtype")
                if isinstance(ac, str) and ac.startswith("torch."):
                    cfg_dict["autocast_dtype"] = getattr(torch, ac.split(".", 1)[1])
            except Exception:
                pass
            # Enforce run-specific fields
            cfg_dict["run_name"] = run.name
            if run.log_dir:
                cfg_dict["tb_root"] = run.log_dir
            if run.ckpt_dir:
                cfg_dict["ckpt_dir"] = run.ckpt_dir
            cfg = TrainConfig(**cfg_dict)

            # Restrict visible GPUs if indices specified
            if run.gpu_indices:
                os.environ["CUDA_VISIBLE_DEVICES"] = ",".join(str(i) for i in run.gpu_indices)

            self._halt_requested.clear()
            with self._lock:
                self._current_run_id = str(run.id)
                self._current_run_name = run.name
                self._current_epoch = 0
                self._total_epochs = cfg.epochs
                self._avg_epoch_time = None
                self._started_at_ts = time.time()

            _ = train_runner.run_experiment(
                cfg,
                progress_cb=self._progress_cb,
                should_stop=self._should_stop,
            )

            # Set final state based on halt flag
            db2 = SessionLocal()
            try:
                r = db2.get(models.Run, run.id)
                if r:
                    if self._halt_requested.is_set():
                        r.state = "canceled"
                    else:
                        r.state = "succeeded"
                    r.finished_at = datetime.utcnow()
                    db2.add(r)
                    # Release GPUs
                    self._release_gpus(db2, r)
                    db2.commit()
            finally:
                db2.close()
        except Exception as e:
            db3 = SessionLocal()
            try:
                r = db3.get(models.Run, run.id)
                if r:
                    r.state = "failed"
                    r.finished_at = datetime.utcnow()
                    # Update job error
                    job = db3.query(models.Job).filter(models.Job.run_id == run.id).first()
                    if job:
                        job.last_error = str(e)
                        db3.add(job)
                    # Release GPUs
                    self._release_gpus(db3, r)
                    db3.add(r)
                    db3.commit()
            finally:
                db3.close()
        finally:
            with self._lock:
                self._current_run_id = None
                self._current_run_name = None
                self._current_epoch = None
                self._total_epochs = None
                self._avg_epoch_time = None
                self._started_at_ts = None

    def _loop_once(self):
        run = self._select_next_run()
        if not run:
            return False
        self._train_run(run)
        return True

    async def run_forever(self):
        init_db()
        while not self._stop_event.is_set():
            did_work = await asyncio.get_event_loop().run_in_executor(None, self._loop_once)
            if not did_work:
                await asyncio.sleep(self.poll_interval)

    def stop(self):
        self._stop_event.set()


def create_app(agent_id: Optional[str] = None, gpu_index: Optional[int] = None) -> FastAPI:

    # Discover GPU and determine a stable agent id
    gpu = _discover_gpu(gpu_index)
    host = socket.gethostname()
    # Derive a stable UUID from the GPU hardware UUID when available
    derived_uuid = None
    if gpu.get("uuid"):
        derived_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"gpu:{gpu['uuid']}")
    else:
        derived_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"host:{host}:gpu-idx:{gpu.get('index', 0)}")

    # Prefer provided agent_id; otherwise use derived
    effective_agent_id = agent_id or str(derived_uuid)
    agent = RunnerAgent(agent_id=effective_agent_id)
    # Constrain this process to its GPU to keep agents atomic
    try:
        os.environ["CUDA_VISIBLE_DEVICES"] = str(int(gpu.get("index", 0)))
    except Exception:
        pass

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Startup: Ensure DB is initialized and self-register this agent and its GPU
        init_db()
        db = SessionLocal()
        try:
            agent_uuid = uuid.UUID(effective_agent_id)
            row = db.get(models.Agent, agent_uuid)
            if not row:
                row = models.Agent(
                    id=agent_uuid,
                    name=f"gpu:{gpu.get('uuid') or 'idx-'+str(gpu.get('index',0))}",
                    host=host,
                    labels={
                        "gpu_index": gpu.get("index"),
                        "gpu_uuid": gpu.get("uuid"),
                        "gpu_name": gpu.get("name"),
                        "compute_capability": gpu.get("compute_capability"),
                    },
                )
            else:
                # Update host/labels if changed
                labels = row.labels or {}
                labels.update({
                    "gpu_index": gpu.get("index"),
                    "gpu_uuid": gpu.get("uuid"),
                    "gpu_name": gpu.get("name"),
                    "compute_capability": gpu.get("compute_capability"),
                })
                row.name = row.name or f"gpu:{gpu.get('uuid') or 'idx-'+str(gpu.get('index',0))}"
                row.host = host
                row.labels = labels
            row.last_heartbeat_at = datetime.utcnow()
            db.add(row)
            db.commit()
            print(f"[agent] Registered agent id={row.id} name={row.name} host={row.host}")

            # Upsert GPU entry for this agent
            gpu_row = (
                db.query(models.GPU)
                .filter(models.GPU.agent_id == row.id, models.GPU.index == int(gpu.get("index", 0)))
                .first()
            )
            if not gpu_row:
                gpu_row = models.GPU(
                    agent_id=row.id,
                    index=int(gpu.get("index", 0)),
                )
            gpu_row.uuid = gpu.get("uuid")
            gpu_row.name = gpu.get("name")
            gpu_row.total_mem_mb = gpu.get("total_mem_mb")
            gpu_row.compute_capability = gpu.get("compute_capability")
            gpu_row.last_seen_at = datetime.utcnow()
            db.add(gpu_row)
            db.commit()
            print(
                f"[agent] Upserted GPU index={gpu_row.index} uuid={gpu_row.uuid} name={gpu_row.name} mem={gpu_row.total_mem_mb}MB"
            )
        finally:
            db.close()

        # Start worker loop and heartbeat task
        app.state.worker = asyncio.create_task(agent.run_forever())

        async def _heartbeat():
            try:
                while True:
                    await asyncio.sleep(15)
                    db_hb = SessionLocal()
                    try:
                        a = db_hb.get(models.Agent, uuid.UUID(effective_agent_id))
                        if a:
                            a.last_heartbeat_at = datetime.utcnow()
                            db_hb.add(a)
                        g = (
                            db_hb.query(models.GPU)
                            .filter(
                                models.GPU.agent_id == uuid.UUID(effective_agent_id),
                                models.GPU.index == int(gpu.get("index", 0)),
                            )
                            .first()
                        )
                        if g:
                            g.last_seen_at = datetime.utcnow()
                            db_hb.add(g)
                        db_hb.commit()
                    finally:
                        db_hb.close()
            except asyncio.CancelledError:
                pass

        app.state.heartbeat = asyncio.create_task(_heartbeat())

        # Yield control to application
        try:
            yield
        finally:
            # Shutdown: stop agent and cancel tasks
            agent.stop()
            task = getattr(app.state, "worker", None)
            if task:
                task.cancel()
                try:
                    await task
                except Exception:
                    pass
            hb = getattr(app.state, "heartbeat", None)
            if hb:
                hb.cancel()
                try:
                    await hb
                except Exception:
                    pass

    # Build FastAPI app with lifespan handler
    app = FastAPI(title="Training Agent", version="0.1.0", lifespan=lifespan)

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.get("/status", response_model=StatusOut)
    def status():
        return agent.status()

    @app.post("/halt")
    def halt():
        agent.request_halt()
        return {"ok": True}

    return app


if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Training agent server")
    parser.add_argument("--agent-id", required=False, help="Agent UUID to serve jobs for (defaults to GPU-derived)")
    parser.add_argument("--gpu-index", type=int, default=None, help="GPU index this agent is bound to")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=7070)
    args = parser.parse_args()

    # Allow overriding DB via env var DASHBOARD_DB_URL
    uvicorn.run(create_app(args.agent_id, args.gpu_index), host=args.host, port=args.port)
