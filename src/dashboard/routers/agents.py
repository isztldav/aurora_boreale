from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from shared.database.connection import get_db
from shared.database import models
from shared.database.schemas import AgentCreate, AgentOut, GPUCreate, GPUOut

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentOut])
def list_agents(db: Session = Depends(get_db)):
    return db.query(models.Agent).order_by(models.Agent.created_at.desc()).all()


@router.post("", response_model=AgentOut)
def create_agent(payload: AgentCreate, db: Session = Depends(get_db)):
    # Manual creation disabled: agents auto-register via the agent process
    raise HTTPException(status_code=405, detail="Manual agent creation is disabled; agents auto-register.")


@router.post("/refresh")
def refresh_agents():
    # Placeholder for GPU rediscovery
    return {"ok": True}


@router.get("/{agent_id}/gpus", response_model=list[GPUOut])
def list_gpus(agent_id: str, db: Session = Depends(get_db)):
    return db.query(models.GPU).filter(models.GPU.agent_id == agent_id).order_by(models.GPU.index.asc()).all()


@router.post("/gpus", response_model=GPUOut)
def add_gpu(payload: GPUCreate, db: Session = Depends(get_db)):
    # Manual GPU management disabled: agents manage GPUs automatically
    raise HTTPException(status_code=405, detail="Manual GPU management is disabled; agents manage GPUs automatically.")


@router.post("/{agent_id}/gpus/{index}/reserve")
def reserve_gpu(agent_id: str, index: int, db: Session = Depends(get_db)):
    gpu = (
        db.query(models.GPU)
        .filter(models.GPU.agent_id == agent_id, models.GPU.index == index)
        .first()
    )
    if not gpu:
        raise HTTPException(status_code=404, detail="GPU not found")
    if gpu.is_allocated:
        return {"ok": True, "already": True}
    gpu.is_allocated = True
    db.add(gpu)
    db.commit()
    return {"ok": True}


@router.post("/{agent_id}/gpus/{index}/release")
def release_gpu(agent_id: str, index: int, db: Session = Depends(get_db)):
    gpu = (
        db.query(models.GPU)
        .filter(models.GPU.agent_id == agent_id, models.GPU.index == index)
        .first()
    )
    if not gpu:
        raise HTTPException(status_code=404, detail="GPU not found")
    gpu.is_allocated = False
    db.add(gpu)
    db.commit()
    return {"ok": True}
