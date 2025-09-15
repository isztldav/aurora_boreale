from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models as orm
from ..schemas import ModelCreate, ModelOut

router = APIRouter(prefix="/projects", tags=["models"])


@router.get("/{project_id}/models", response_model=list[ModelOut])
def list_models(project_id: str, db: Session = Depends(get_db)):
    return db.query(orm.ModelRegistry).filter(orm.ModelRegistry.project_id == project_id).order_by(orm.ModelRegistry.created_at.desc()).all()


@router.post("/{project_id}/models", response_model=ModelOut)
def create_model(project_id: str, payload: ModelCreate, db: Session = Depends(get_db)):
    proj = db.query(orm.Project).get(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    label_exists = (
        db.query(orm.ModelRegistry)
        .filter(orm.ModelRegistry.project_id == project_id, orm.ModelRegistry.label == payload.label)
        .first()
    )
    if label_exists:
        raise HTTPException(status_code=400, detail="Model label already exists")

    hf_checkpoint_exists = (
        db.query(orm.ModelRegistry)
        .filter(orm.ModelRegistry.project_id == project_id, orm.ModelRegistry.hf_checkpoint_id == payload.hf_checkpoint_id)
        .first()
    )
    if hf_checkpoint_exists:
        raise HTTPException(status_code=400, detail="Model checkpoint already exists in this project")
    row = orm.ModelRegistry(
        project_id=project_id,
        label=payload.label,
        hf_checkpoint_id=payload.hf_checkpoint_id,
        notes=payload.notes,
        default_pretrained=payload.default_pretrained,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/models/{model_id}")
def delete_model(model_id: str, db: Session = Depends(get_db)):
    row = db.query(orm.ModelRegistry).get(model_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}

