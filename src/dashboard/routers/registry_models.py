from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models as orm
from ..schemas import ModelCreate, ModelUpdate, ModelOut, ModelOutSafe

router = APIRouter(prefix="/projects", tags=["models"])


@router.get("/{project_id}/models", response_model=list[ModelOutSafe])
def list_models(project_id: str, db: Session = Depends(get_db)):
    models = db.query(orm.ModelRegistry).filter(orm.ModelRegistry.project_id == project_id).order_by(orm.ModelRegistry.created_at.desc()).all()
    return [
        ModelOutSafe(
            id=m.id,
            project_id=m.project_id,
            label=m.label,
            hf_checkpoint_id=m.hf_checkpoint_id,
            has_token=bool(m.hf_token),
            notes=m.notes,
            default_pretrained=m.default_pretrained,
            created_at=m.created_at,
            updated_at=m.updated_at
        )
        for m in models
    ]


@router.get("/models/{model_id}", response_model=ModelOut)
def get_model(model_id: str, db: Session = Depends(get_db)):
    """Get model with HF token for backend use only"""
    model = db.query(orm.ModelRegistry).get(model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return model


@router.post("/{project_id}/models", response_model=ModelOutSafe)
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
        hf_token=payload.hf_token,
        notes=payload.notes,
        default_pretrained=payload.default_pretrained,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ModelOutSafe(
        id=row.id,
        project_id=row.project_id,
        label=row.label,
        hf_checkpoint_id=row.hf_checkpoint_id,
        has_token=bool(row.hf_token),
        notes=row.notes,
        default_pretrained=row.default_pretrained,
        created_at=row.created_at,
        updated_at=row.updated_at
    )


@router.put("/models/{model_id}", response_model=ModelOutSafe)
def update_model(model_id: str, payload: ModelUpdate, db: Session = Depends(get_db)):
    row = db.query(orm.ModelRegistry).get(model_id)
    if not row:
        raise HTTPException(status_code=404, detail="Model not found")

    # Check for label conflicts if updating label
    if payload.label and payload.label != row.label:
        label_exists = (
            db.query(orm.ModelRegistry)
            .filter(
                orm.ModelRegistry.project_id == row.project_id,
                orm.ModelRegistry.label == payload.label,
                orm.ModelRegistry.id != model_id
            )
            .first()
        )
        if label_exists:
            raise HTTPException(status_code=400, detail="Model label already exists")

    # Check for checkpoint conflicts if updating checkpoint
    if payload.hf_checkpoint_id and payload.hf_checkpoint_id != row.hf_checkpoint_id:
        checkpoint_exists = (
            db.query(orm.ModelRegistry)
            .filter(
                orm.ModelRegistry.project_id == row.project_id,
                orm.ModelRegistry.hf_checkpoint_id == payload.hf_checkpoint_id,
                orm.ModelRegistry.id != model_id
            )
            .first()
        )
        if checkpoint_exists:
            raise HTTPException(status_code=400, detail="Model checkpoint already exists in this project")

    # Update fields
    if payload.label is not None:
        row.label = payload.label
    if payload.hf_checkpoint_id is not None:
        row.hf_checkpoint_id = payload.hf_checkpoint_id
    if payload.hf_token is not None:
        row.hf_token = payload.hf_token
    if payload.notes is not None:
        row.notes = payload.notes
    if payload.default_pretrained is not None:
        row.default_pretrained = payload.default_pretrained

    db.commit()
    db.refresh(row)

    return ModelOutSafe(
        id=row.id,
        project_id=row.project_id,
        label=row.label,
        hf_checkpoint_id=row.hf_checkpoint_id,
        has_token=bool(row.hf_token),
        notes=row.notes,
        default_pretrained=row.default_pretrained,
        created_at=row.created_at,
        updated_at=row.updated_at
    )


@router.delete("/models/{model_id}")
def delete_model(model_id: str, db: Session = Depends(get_db)):
    row = db.query(orm.ModelRegistry).get(model_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}

