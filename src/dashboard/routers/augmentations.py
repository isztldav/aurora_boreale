from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models as orm
from ..schemas import AugmentationCreate, AugmentationOut

router = APIRouter(prefix="/projects", tags=["augmentations"])


@router.get("/{project_id}/augmentations", response_model=list[AugmentationOut])
def list_augmentations(project_id: str, db: Session = Depends(get_db)):
    return db.query(orm.Augmentation).filter(orm.Augmentation.project_id == project_id).order_by(orm.Augmentation.created_at.desc()).all()


@router.post("/{project_id}/augmentations", response_model=AugmentationOut)
def create_augmentation(project_id: str, payload: AugmentationCreate, db: Session = Depends(get_db)):
    proj = db.query(orm.Project).get(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    exists = (
        db.query(orm.Augmentation)
        .filter(orm.Augmentation.project_id == project_id, orm.Augmentation.name == payload.name)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Augmentation with this name exists")
    row = orm.Augmentation(
        project_id=project_id,
        name=payload.name,
        type=payload.type,
        params=payload.params,
        enabled=payload.enabled,
        version=payload.version,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/augmentations/{aug_id}/toggle")
def toggle_augmentation(aug_id: str, enabled: bool, db: Session = Depends(get_db)):
    row = db.query(orm.Augmentation).get(aug_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    row.enabled = enabled
    db.add(row)
    db.commit()
    return {"ok": True, "enabled": row.enabled}


@router.delete("/augmentations/{aug_id}")
def delete_augmentation(aug_id: str, db: Session = Depends(get_db)):
    row = db.query(orm.Augmentation).get(aug_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}

