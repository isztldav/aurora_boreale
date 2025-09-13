from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models
from ..schemas import AgentCreate, AgentOut, GPUCreate, GPUOut

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentOut])
def list_agents(db: Session = Depends(get_db)):
    return db.query(models.Agent).order_by(models.Agent.created_at.desc()).all()


@router.post("", response_model=AgentOut)
def create_agent(payload: AgentCreate, db: Session = Depends(get_db)):
    exists = db.query(models.Agent).filter(models.Agent.name == payload.name).first()
    if exists:
        raise HTTPException(status_code=400, detail="Agent with this name exists")
    agent = models.Agent(name=payload.name, host=payload.host, labels=payload.labels or {})
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@router.post("/refresh")
def refresh_agents():
    # Placeholder for GPU rediscovery
    return {"ok": True}


@router.get("/{agent_id}/gpus", response_model=list[GPUOut])
def list_gpus(agent_id: str, db: Session = Depends(get_db)):
    return db.query(models.GPU).filter(models.GPU.agent_id == agent_id).order_by(models.GPU.index.asc()).all()


@router.post("/gpus", response_model=GPUOut)
def add_gpu(payload: GPUCreate, db: Session = Depends(get_db)):
    agent = db.query(models.Agent).get(payload.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    gpu = models.GPU(
        agent_id=payload.agent_id,
        index=payload.index,
        uuid=payload.uuid,
        name=payload.name,
        total_mem_mb=payload.total_mem_mb,
        compute_capability=payload.compute_capability,
        last_seen_at=datetime.utcnow(),
    )
    db.add(gpu)
    db.commit()
    db.refresh(gpu)
    return gpu


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

