from __future__ import annotations

import asyncio
import os
import signal
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

from dashboard_api.db import SessionLocal, init_db
from dashboard_api import models
from utils.config import TrainConfig
from utils import runner as train_runner


class StatusOut(BaseModel):
    state: str  # idle|running
    run_id: Optional[str] = None
    name: Optional[str] = None
    epoch: Optional[int] = None
    total_epochs: Optional[int] = None
    started_at: Optional[str] = None
    elapsed_seconds: Optional[float] = None
    eta_seconds: Optional[float] = None


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
            run = db.query(models.Run).get(self._current_run_id)
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
            cfg_row = db.query(models.TrainConfigModel).get(run.config_id)
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
                r = db2.query(models.Run).get(run.id)
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
                r = db3.query(models.Run).get(run.id)
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


def create_app(agent_id: str) -> FastAPI:
    app = FastAPI(title="Training Agent", version="0.1.0")
    agent = RunnerAgent(agent_id=agent_id)

    @app.on_event("startup")
    async def _startup():
        app.state.worker = asyncio.create_task(agent.run_forever())

    @app.on_event("shutdown")
    async def _shutdown():
        agent.stop()
        task = getattr(app.state, "worker", None)
        if task:
            task.cancel()

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
    parser.add_argument("--agent-id", required=True, help="Agent UUID to serve jobs for")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=7070)
    args = parser.parse_args()

    # Allow overriding DB via env var DASHBOARD_DB_URL
    uvicorn.run(create_app(args.agent_id), host=args.host, port=args.port)

