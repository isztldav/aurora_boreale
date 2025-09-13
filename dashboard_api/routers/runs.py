from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models
from ..schemas import RunCreate, RunOut
from ..utils import resolve_run_name

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

    # Resolve run name using training repo logic-like placeholders
    run_name = resolve_run_name(cfg.config_json)
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
        log_dir=cfg.config_json.get("tb_root"),
        ckpt_dir=cfg.config_json.get("ckpt_dir"),
        gpu_indices=payload.gpu_indices or [],
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Enqueue a job row (no real worker yet)
    job = models.Job(run_id=run.id, priority=payload.priority)
    db.add(job)
    db.commit()

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
    return {"ok": True, "state": run.state}


@router.get("/{run_id}/logs")
def get_logs(run_id: str, tail: int = 200):
    # Placeholder: logs not implemented yet
    return {"lines": ["[stub] logs are not implemented in MVP"], "truncated": False}
