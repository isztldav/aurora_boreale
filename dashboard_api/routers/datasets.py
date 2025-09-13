from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models as orm
from ..schemas import DatasetCreate, DatasetOut

router = APIRouter(prefix="/projects", tags=["datasets"])


@router.get("/{project_id}/datasets", response_model=list[DatasetOut])
def list_datasets(project_id: str, db: Session = Depends(get_db)):
    return db.query(orm.Dataset).filter(orm.Dataset.project_id == project_id).order_by(orm.Dataset.created_at.desc()).all()


@router.post("/{project_id}/datasets", response_model=DatasetOut)
def create_dataset(project_id: str, payload: DatasetCreate, db: Session = Depends(get_db)):
    proj = db.query(orm.Project).get(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    exists = (
        db.query(orm.Dataset)
        .filter(orm.Dataset.project_id == project_id, orm.Dataset.name == payload.name)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Dataset with this name exists")
    row = orm.Dataset(
        project_id=project_id,
        name=payload.name,
        root_path=payload.root_path,
        split_layout=payload.split_layout,
        class_map=payload.class_map,
        sample_stats=payload.sample_stats,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    row = db.query(orm.Dataset).get(dataset_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}

