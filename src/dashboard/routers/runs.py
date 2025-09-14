from datetime import datetime
import os
from fastapi import APIRouter, Depends, HTTPException, Query
from urllib import request as _urlreq
import json as _json
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models
from ..schemas import RunCreate, RunOut
from .ws import ws_manager
from ..utils import resolve_run_name
from common.experiments import unique_run_name
from ..tensorboard import get_embedded_url_path

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("", response_model=list[RunOut])
def list_runs(
    project_id: str | None = Query(default=None),
    state: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(models.Run)
    if project_id:
        q = q.filter(models.Run.project_id == project_id)
    if state:
        q = q.filter(models.Run.state == state)
    return q.order_by(models.Run.created_at.desc()).all()


@router.get("/{run_id}", response_model=RunOut)
def get_run(run_id: str, db: Session = Depends(get_db)):
    row = db.query(models.Run).get(run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row


@router.post("/from-config/{config_id}", response_model=RunOut)
def create_run_from_config(config_id: str, payload: RunCreate, db: Session = Depends(get_db)):
    cfg = db.query(models.TrainConfigModel).get(config_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Config not found")

    # Resolve base run name and ensure uniqueness under the effective TB root
    base_name = resolve_run_name(cfg.config_json)
    # Validate GPU availability if requested
    if payload.gpu_indices and not payload.agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required when specifying gpu_indices")
    if payload.agent_id and payload.gpu_indices:
        for idx in payload.gpu_indices:
            gpu = (
                db.query(models.GPU)
                .filter(models.GPU.agent_id == payload.agent_id, models.GPU.index == idx)
                .first()
            )
            if not gpu:
                raise HTTPException(status_code=400, detail=f"GPU index {idx} not found on agent")
            if gpu.is_allocated:
                raise HTTPException(status_code=409, detail=f"GPU {idx} already allocated")
            gpu.is_allocated = True
            db.add(gpu)

    # Place logs/checkpoints under the shared Docker mount but respect the
    # path structure configured in the dashboard (prefix under shared root).
    shared_root = os.environ.get("SHARED_LOGS_DIR", "/app/runs")
    def _under_shared(p: str | None, default: str) -> str:
        raw = (p or default).lstrip("/\\")
        # Normalize and eliminate parent traversal to keep within shared_root
        parts: list[str] = []
        for seg in raw.replace("\\", "/").split("/"):
            if seg in ("", "."):
                continue
            if seg == "..":
                if parts:
                    parts.pop()
                continue
            parts.append(seg)
        safe_rel = "/".join(parts)
        return os.path.join(shared_root, safe_rel)
    desired_tb_root = cfg.config_json.get("tb_root")
    desired_ckpt_root = cfg.config_json.get("ckpt_dir")
    # Compute the effective logging/checkpoint roots under shared mount
    effective_log_root = _under_shared(desired_tb_root, "runs")
    effective_ckpt_root = _under_shared(desired_ckpt_root, "checkpoints")

    # Make the run name unique by probing the log root on disk
    run_name = unique_run_name(effective_log_root, base_name)

    run = models.Run(
        project_id=cfg.project_id,
        config_id=cfg.id,
        group_id=cfg.group_id,
        name=run_name,
        state="queued",
        monitor_metric=cfg.config_json.get("monitor_metric", "val_acc@1"),
        monitor_mode=cfg.config_json.get("monitor_mode", "max"),
        agent_id=payload.agent_id,
        docker_image=payload.docker_image,
        seed=cfg.config_json.get("seed"),
        log_dir=effective_log_root,
        ckpt_dir=effective_ckpt_root,
        gpu_indices=payload.gpu_indices or [],
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Enqueue a job row (no real worker yet)
    job = models.Job(run_id=run.id, priority=payload.priority)
    db.add(job)
    db.commit()

    # Broadcast creation event
    try:
        payload = {
            "type": "run.created",
            "run": _serialize_run(run),
        }
        import anyio
        anyio.from_thread.run(ws_manager.broadcast_json, payload, topic="runs")
    except Exception:
        pass

    return run


@router.post("/{run_id}/cancel")
def cancel_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(models.Run).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Not found")
    if run.state in {"succeeded", "failed", "canceled"}:
        return {"ok": True, "state": run.state}
    run.state = "canceled"
    run.finished_at = datetime.utcnow()
    # Release GPUs if any
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
    db.add(run)
    db.commit()
    # Broadcast update
    try:
        payload = {
            "type": "run.updated",
            "run": _serialize_run(run),
        }
        import anyio
        anyio.from_thread.run(ws_manager.broadcast_json, payload, topic="runs")
    except Exception:
        pass
    return {"ok": True, "state": run.state}


@router.post("/{run_id}/start")
def start_run(run_id: str, db: Session = Depends(get_db)):
    # Manual control for MVP (no scheduler)
    run = db.query(models.Run).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Not found")
    run.state = "running"
    run.started_at = datetime.utcnow()
    db.add(run)
    db.commit()
    # Broadcast update
    try:
        payload = {
            "type": "run.updated",
            "run": _serialize_run(run),
        }
        import anyio
        anyio.from_thread.run(ws_manager.broadcast_json, payload, topic="runs")
    except Exception:
        pass
    return {"ok": True, "state": run.state}


@router.post("/{run_id}/finish")
def finish_run(run_id: str, success: bool = True, db: Session = Depends(get_db)):
    run = db.query(models.Run).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Not found")
    run.state = "succeeded" if success else "failed"
    run.finished_at = datetime.utcnow()
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
    db.add(run)
    db.commit()
    # Broadcast update
    try:
        payload = {
            "type": "run.updated",
            "run": _serialize_run(run),
        }
        import anyio
        anyio.from_thread.run(ws_manager.broadcast_json, payload, topic="runs")
    except Exception:
        pass
    return {"ok": True, "state": run.state}


@router.get("/{run_id}/logs")
def get_logs(run_id: str, tail: int = 200):
    # Placeholder: logs not implemented yet
    return {"lines": ["[stub] logs are not implemented in MVP"], "truncated": False}


@router.get("/{run_id}/tensorboard")
def tensorboard_url(run_id: str, db: Session = Depends(get_db)):
    """Return the embedded TensorBoard URL path for this run.

    Served by the app itself under ``/tb/<run_id>``.
    """
    run = db.query(models.Run).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Not found")
    url = get_embedded_url_path(str(run.id))
    return {"url": url}


def _serialize_run(run: models.Run) -> dict:
    return {
        "id": str(run.id),
        "project_id": str(run.project_id) if run.project_id else None,
        "config_id": str(run.config_id) if run.config_id else None,
        "group_id": str(run.group_id) if run.group_id else None,
        "name": run.name,
        "state": run.state,
        "monitor_metric": run.monitor_metric,
        "monitor_mode": run.monitor_mode,
        "best_value": run.best_value,
        "epoch": run.epoch,
        "step": run.step,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "agent_id": str(run.agent_id) if run.agent_id else None,
        "docker_image": run.docker_image,
        "seed": run.seed,
        "log_dir": run.log_dir,
        "ckpt_dir": run.ckpt_dir,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "updated_at": run.updated_at.isoformat() if run.updated_at else None,
        "gpu_indices": run.gpu_indices or [],
    }


def _agent_base_url(db: Session, run: models.Run) -> str:
    if not run.agent_id:
        raise HTTPException(status_code=400, detail="Run has no assigned agent")
    agent = db.query(models.Agent).get(run.agent_id)
    if not agent or not agent.host:
        raise HTTPException(status_code=400, detail="Agent host unknown")
    host = agent.host
    # Default agent server port 7070 unless host already includes port
    if ":" in host:
        base = f"http://{host}"
    else:
        base = f"http://{host}:7070"
    return base


@router.get("/{run_id}/status")
def run_agent_status(run_id: str, db: Session = Depends(get_db)):
    run = db.query(models.Run).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Not found")
    base = _agent_base_url(db, run)
    url = f"{base}/status"
    try:
        with _urlreq.urlopen(url, timeout=2.0) as resp:
            data = resp.read().decode("utf-8")
            return _json.loads(data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Agent unreachable: {e}")


@router.post("/{run_id}/halt")
def run_agent_halt(run_id: str, db: Session = Depends(get_db)):
    run = db.query(models.Run).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Not found")
    base = _agent_base_url(db, run)
    url = f"{base}/halt"
    try:
        req = _urlreq.Request(url, method="POST")
        with _urlreq.urlopen(req, timeout=2.0) as resp:
            data = resp.read().decode("utf-8")
            return _json.loads(data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Agent unreachable: {e}")
