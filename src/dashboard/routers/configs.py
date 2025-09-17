from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import hashlib

from shared.database.connection import get_db
from shared.database import models
from shared.database.schemas import TrainConfigCreate, TrainConfigOut, TrainConfigUpdate

router = APIRouter(prefix="/configs", tags=["configs"])


@router.get("/project/{project_id}", response_model=list[TrainConfigOut])
def list_configs(project_id: str, db: Session = Depends(get_db)):
    return db.query(models.TrainConfigModel).filter(models.TrainConfigModel.project_id == project_id).order_by(models.TrainConfigModel.created_at.desc()).all()


@router.post("", response_model=TrainConfigOut)
def create_config(payload: TrainConfigCreate, db: Session = Depends(get_db)):
    proj = db.query(models.Project).get(payload.project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    cfg_json = payload.config_json.model_dump()
    # versioning per name
    latest = (
        db.query(models.TrainConfigModel)
        .filter(models.TrainConfigModel.project_id == payload.project_id, models.TrainConfigModel.name == payload.name)
        .order_by(models.TrainConfigModel.version.desc())
        .first()
    )
    version = (latest.version + 1) if latest else 1
    hash_val = hashlib.sha256(str(cfg_json).encode("utf-8")).hexdigest()
    row = models.TrainConfigModel(
        project_id=payload.project_id,
        group_id=payload.group_id,
        name=payload.name,
        config_json=cfg_json,
        version=version,
        status="ready",
        hash=hash_val,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/{config_id}", response_model=TrainConfigOut)
def get_config(config_id: str, db: Session = Depends(get_db)):
    row = db.query(models.TrainConfigModel).get(config_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row


@router.put("/{config_id}", response_model=TrainConfigOut)
def update_config(config_id: str, payload: TrainConfigUpdate, db: Session = Depends(get_db)):
    row = db.query(models.TrainConfigModel).get(config_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")

    # Update fields that are provided
    if payload.name is not None:
        # If name is changing, we need to create a new version
        if payload.name != row.name:
            latest = (
                db.query(models.TrainConfigModel)
                .filter(models.TrainConfigModel.project_id == row.project_id, models.TrainConfigModel.name == payload.name)
                .order_by(models.TrainConfigModel.version.desc())
                .first()
            )
            row.version = (latest.version + 1) if latest else 1
        row.name = payload.name

    if payload.group_id is not None:
        row.group_id = payload.group_id

    if payload.config_json is not None:
        cfg_json = payload.config_json.model_dump()
        row.config_json = cfg_json
        # Update hash when config changes
        row.hash = hashlib.sha256(str(cfg_json).encode("utf-8")).hexdigest()

    db.commit()
    db.refresh(row)
    return row


@router.delete("/{config_id}")
def delete_config(config_id: str, db: Session = Depends(get_db)):
    row = db.query(models.TrainConfigModel).get(config_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")

    # Check if there are any runs using this config
    runs = db.query(models.Run).filter(models.Run.config_id == config_id).count()
    if runs > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete config: {runs} run(s) are using this configuration")

    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/{config_id}/validate")
def validate_config(config_id: str, db: Session = Depends(get_db)):
    row = db.query(models.TrainConfigModel).get(config_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    # Minimal validation: ensure monitor metric and epochs sane
    warnings = []
    cfg = row.config_json
    if cfg.get("epochs", 1) <= 0:
        warnings.append("epochs <= 0; defaulting to 1")
    if cfg.get("monitor_metric") not in {"val_acc@1", "val_loss"}:
        warnings.append("monitor_metric not recognized; UI expects val_acc@1 or val_loss")
    return {"ok": True, "warnings": warnings, "config": cfg}

