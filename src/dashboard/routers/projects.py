from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models
from ..schemas import ProjectCreate, ProjectUpdate, ProjectOut

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).order_by(models.Project.created_at.desc()).all()


@router.post("", response_model=ProjectOut)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    exists = db.query(models.Project).filter(models.Project.name == payload.name).first()
    if exists:
        raise HTTPException(status_code=400, detail="Project with this name already exists")
    proj = models.Project(name=payload.name, description=payload.description)
    db.add(proj)
    db.commit()
    db.refresh(proj)
    return proj


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db)):
    proj = db.query(models.Project).get(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Not found")
    return proj


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, payload: ProjectUpdate, db: Session = Depends(get_db)):
    proj = db.query(models.Project).get(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Not found")

    # Check if name is being updated and already exists
    if payload.name and payload.name != proj.name:
        existing = db.query(models.Project).filter(
            models.Project.name == payload.name,
            models.Project.id != project_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Project with this name already exists")

    # Update fields if provided
    if payload.name is not None:
        proj.name = payload.name
    if payload.description is not None:
        proj.description = payload.description

    db.commit()
    db.refresh(proj)
    return proj


@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    proj = db.query(models.Project).get(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(proj)
    db.commit()
    return {"ok": True}

