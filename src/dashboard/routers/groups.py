from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from shared.database.connection import get_db
from shared.database import models
from shared.database.schemas import GroupCreate, GroupOut

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("/project/{project_id}", response_model=list[GroupOut])
def list_groups(project_id: str, db: Session = Depends(get_db)):
    return db.query(models.ExperimentGroup).filter(models.ExperimentGroup.project_id == project_id).all()


@router.post("", response_model=GroupOut)
def create_group(payload: GroupCreate, db: Session = Depends(get_db)):
    proj = db.query(models.Project).get(payload.project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    grp = models.ExperimentGroup(
        project_id=payload.project_id,
        name=payload.name,
        description=payload.description,
        tags=payload.tags or [],
    )
    db.add(grp)
    db.commit()
    db.refresh(grp)
    return grp


@router.delete("/{group_id}")
def delete_group(group_id: str, db: Session = Depends(get_db)):
    grp = db.query(models.ExperimentGroup).get(group_id)
    if not grp:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(grp)
    db.commit()
    return {"ok": True}

