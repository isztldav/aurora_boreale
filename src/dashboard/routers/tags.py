from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import and_, or_, text
from typing import List, Optional
from uuid import UUID

from shared.database.connection import get_db
from shared.database import models
from shared.database.schemas import (
    TagCreate, TagUpdate, TagMove, TagOut, TagWithChildren,
    TagAncestry, TagStats, RunTagAssignment, RunWithTags
)
from .ws import ws_manager

router = APIRouter(prefix="/tags", tags=["tags"])


def _calculate_materialized_path(parent: Optional[models.Tag], name: str) -> str:
    """Calculate materialized path for a tag"""
    if parent is None:
        return f"/{name}"
    return f"{parent.path}/{name}"


def _calculate_level(parent: Optional[models.Tag]) -> int:
    """Calculate level for a tag"""
    if parent is None:
        return 0
    return parent.level + 1


def _update_descendants_paths(db: Session, tag: models.Tag, old_path: str) -> None:
    """Update materialized paths for all descendants when a tag is moved"""
    # Find all descendants with paths starting with the old path
    descendants = db.query(models.Tag).filter(
        models.Tag.path.like(f"{old_path}/%")
    ).all()

    for descendant in descendants:
        # Replace the old path prefix with the new one
        new_path = descendant.path.replace(old_path, tag.path, 1)
        # Calculate new level based on path depth
        new_level = new_path.count("/") - 1

        descendant.path = new_path
        descendant.level = new_level

    db.flush()


def _check_circular_reference(db: Session, tag_id: UUID, new_parent_id: UUID) -> bool:
    """Check if moving tag would create a circular reference"""
    # Get the tag that would become the new parent
    potential_parent = db.query(models.Tag).filter(models.Tag.id == new_parent_id).first()
    if not potential_parent:
        return True  # Parent doesn't exist

    # Check if the new parent is a descendant of the tag being moved
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        return True  # Tag doesn't exist

    # If potential parent's path starts with tag's path, it's a descendant
    return potential_parent.path.startswith(f"{tag.path}/")


@router.post("", response_model=TagOut)
async def create_tag(tag_data: TagCreate, db: Session = Depends(get_db)):
    """Create a new tag"""
    parent = None
    if tag_data.parent_id:
        parent = db.query(models.Tag).filter(models.Tag.id == tag_data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent tag not found")

    # Check for duplicate name under same parent
    existing = db.query(models.Tag).filter(
        and_(
            models.Tag.name == tag_data.name,
            models.Tag.parent_id == tag_data.parent_id
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag name already exists under this parent")

    # Create new tag
    tag = models.Tag(
        name=tag_data.name,
        parent_id=tag_data.parent_id,
        path=_calculate_materialized_path(parent, tag_data.name),
        level=_calculate_level(parent)
    )

    db.add(tag)
    db.commit()
    db.refresh(tag)

    # Broadcast tag creation via WebSocket
    await ws_manager.broadcast({"type": "tag_created", "tag": TagOut.model_validate(tag).model_dump()})

    return tag


@router.get("/tree", response_model=List[TagWithChildren])
def get_tag_tree(db: Session = Depends(get_db)):
    """Get the complete tag hierarchy as a tree"""
    # Get all tags ordered by path for proper tree building
    all_tags = db.query(models.Tag).order_by(models.Tag.path).all()

    # Build tree structure
    tag_map = {}
    root_tags = []

    for tag in all_tags:
        tag_dict = TagWithChildren.model_validate(tag).model_dump()
        tag_dict["children"] = []
        tag_map[tag.id] = tag_dict

        if tag.parent_id is None:
            root_tags.append(tag_dict)
        else:
            if tag.parent_id in tag_map:
                tag_map[tag.parent_id]["children"].append(tag_dict)

    return root_tags


@router.get("/{tag_id}", response_model=TagOut)
def get_tag(tag_id: UUID, db: Session = Depends(get_db)):
    """Get a specific tag"""
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.get("/{tag_id}/ancestry", response_model=TagAncestry)
def get_tag_ancestry(tag_id: UUID, db: Session = Depends(get_db)):
    """Get the path from root to the specified tag"""
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Parse the path to get ancestor names
    path_parts = [part for part in tag.path.split("/") if part]

    # Get all ancestors by reconstructing paths
    ancestor_paths = []
    for i in range(len(path_parts)):
        ancestor_paths.append("/" + "/".join(path_parts[:i+1]))

    # Query ancestors in correct order
    ancestors = db.query(models.Tag).filter(
        models.Tag.path.in_(ancestor_paths)
    ).order_by(models.Tag.level).all()

    return TagAncestry(tags=ancestors)


@router.get("/{tag_id}/descendants", response_model=List[TagOut])
def get_tag_descendants(tag_id: UUID, db: Session = Depends(get_db)):
    """Get all descendants of a tag recursively"""
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Get all descendants using materialized path
    descendants = db.query(models.Tag).filter(
        models.Tag.path.like(f"{tag.path}/%")
    ).order_by(models.Tag.path).all()

    return descendants


@router.put("/{tag_id}", response_model=TagOut)
async def update_tag(tag_id: UUID, tag_data: TagUpdate, db: Session = Depends(get_db)):
    """Update a tag's name"""
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    if tag_data.name:
        # Check for duplicate name under same parent
        existing = db.query(models.Tag).filter(
            and_(
                models.Tag.name == tag_data.name,
                models.Tag.parent_id == tag.parent_id,
                models.Tag.id != tag_id
            )
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Tag name already exists under this parent")

        # Store old path for updating descendants
        old_path = tag.path

        # Update tag name and recalculate path
        tag.name = tag_data.name
        parent = db.query(models.Tag).filter(models.Tag.id == tag.parent_id).first() if tag.parent_id else None
        tag.path = _calculate_materialized_path(parent, tag.name)

        # Update all descendant paths
        _update_descendants_paths(db, tag, old_path)

    db.commit()
    db.refresh(tag)

    # Broadcast tag update via WebSocket
    await ws_manager.broadcast({"type": "tag_updated", "tag": TagOut.model_validate(tag).model_dump()})

    return tag


@router.put("/{tag_id}/promote", response_model=TagOut)
async def promote_tag_to_root(tag_id: UUID, db: Session = Depends(get_db)):
    """Promote a tag to root level (remove parent)"""
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    if tag.parent_id is None:
        raise HTTPException(status_code=400, detail="Tag is already at root level")

    # Check for duplicate name at root level
    existing = db.query(models.Tag).filter(
        and_(
            models.Tag.name == tag.name,
            models.Tag.parent_id.is_(None),
            models.Tag.id != tag_id
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag name already exists at root level")

    # Store old path for updating descendants
    old_path = tag.path

    # Update tag to root level
    tag.parent_id = None
    tag.path = _calculate_materialized_path(None, tag.name)
    tag.level = 0

    # Update all descendant paths
    _update_descendants_paths(db, tag, old_path)

    db.commit()
    db.refresh(tag)

    # Broadcast tag promotion via WebSocket
    await ws_manager.broadcast({"type": "tag_promoted", "tag": TagOut.model_validate(tag).model_dump()})

    return tag


@router.put("/{tag_id}/move", response_model=TagOut)
async def move_tag(tag_id: UUID, move_data: TagMove, db: Session = Depends(get_db)):
    """Move a tag to a new parent"""
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Check for circular reference
    if move_data.new_parent_id and _check_circular_reference(db, tag_id, move_data.new_parent_id):
        raise HTTPException(status_code=400, detail="Cannot move tag: would create circular reference")

    # Get new parent if specified
    new_parent = None
    if move_data.new_parent_id:
        new_parent = db.query(models.Tag).filter(models.Tag.id == move_data.new_parent_id).first()
        if not new_parent:
            raise HTTPException(status_code=404, detail="New parent tag not found")

    # Check for duplicate name under new parent
    existing = db.query(models.Tag).filter(
        and_(
            models.Tag.name == tag.name,
            models.Tag.parent_id == move_data.new_parent_id,
            models.Tag.id != tag_id
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag name already exists under new parent")

    # Store old path for updating descendants
    old_path = tag.path

    # Update tag parent and recalculate path/level
    tag.parent_id = move_data.new_parent_id
    tag.path = _calculate_materialized_path(new_parent, tag.name)
    tag.level = _calculate_level(new_parent)

    # Update all descendant paths
    _update_descendants_paths(db, tag, old_path)

    db.commit()
    db.refresh(tag)

    # Broadcast tag move via WebSocket
    await ws_manager.broadcast({"type": "tag_moved", "tag": TagOut.model_validate(tag).model_dump()})

    return tag


@router.delete("/{tag_id}")
async def delete_tag(
    tag_id: UUID,
    preserve_children: bool = Query(default=False),
    db: Session = Depends(get_db)
):
    """Delete a tag, optionally preserving children by promoting them"""
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Get children
    children = db.query(models.Tag).filter(models.Tag.parent_id == tag_id).all()

    if preserve_children and children:
        # Promote children to tag's parent level
        for child in children:
            old_path = child.path

            child.parent_id = tag.parent_id
            child.path = _calculate_materialized_path(
                db.query(models.Tag).filter(models.Tag.id == tag.parent_id).first() if tag.parent_id else None,
                child.name
            )
            child.level = _calculate_level(
                db.query(models.Tag).filter(models.Tag.id == tag.parent_id).first() if tag.parent_id else None
            )

            # Update descendant paths for this child
            _update_descendants_paths(db, child, old_path)

    # Delete the tag (cascade will handle descendants if not preserving)
    db.delete(tag)
    db.commit()

    # Broadcast tag deletion via WebSocket
    await ws_manager.broadcast({
        "type": "tag_deleted",
        "tag_id": str(tag_id),
        "preserve_children": preserve_children
    })

    return {"message": "Tag deleted successfully"}


@router.get("/{tag_id}/stats", response_model=TagStats)
def get_tag_stats(tag_id: UUID, db: Session = Depends(get_db)):
    """Get statistics for a tag (direct and total run counts)"""
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Count direct runs assigned to this tag
    direct_count = db.query(models.TrainingRunTag).filter(
        models.TrainingRunTag.tag_id == tag_id
    ).count()

    # Count total runs including descendants
    descendant_ids = [tag_id]
    descendants = db.query(models.Tag).filter(
        models.Tag.path.like(f"{tag.path}/%")
    ).all()
    descendant_ids.extend([d.id for d in descendants])

    total_count = db.query(models.TrainingRunTag).filter(
        models.TrainingRunTag.tag_id.in_(descendant_ids)
    ).count()

    return TagStats(
        tag_id=tag_id,
        tag_name=tag.name,
        direct_runs=direct_count,
        total_runs=total_count
    )


# Training Run Tag Management
@router.put("/training-runs/{run_id}/tags", response_model=RunWithTags)
async def assign_tags_to_run(
    run_id: UUID,
    assignment: RunTagAssignment,
    db: Session = Depends(get_db)
):
    """Assign tags to a training run"""
    # Check if run exists
    run = db.query(models.Run).filter(models.Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Training run not found")

    # Validate all tag IDs exist
    existing_tags = db.query(models.Tag).filter(
        models.Tag.id.in_(assignment.tag_ids)
    ).all()
    if len(existing_tags) != len(assignment.tag_ids):
        raise HTTPException(status_code=400, detail="One or more tag IDs are invalid")

    # Remove existing tag assignments
    db.query(models.TrainingRunTag).filter(
        models.TrainingRunTag.training_run_id == run_id
    ).delete()

    # Add new tag assignments
    for tag_id in assignment.tag_ids:
        tag_assignment = models.TrainingRunTag(
            training_run_id=run_id,
            tag_id=tag_id
        )
        db.add(tag_assignment)

    db.commit()

    # Fetch run with tags for response
    run_with_tags = db.query(models.Run).options(
        selectinload(models.Run.tags)
    ).filter(models.Run.id == run_id).first()

    # Broadcast tag assignment via WebSocket
    await ws_manager.broadcast({
        "type": "run_tags_updated",
        "run_id": str(run_id),
        "tag_ids": [str(tid) for tid in assignment.tag_ids]
    })

    return run_with_tags


@router.get("/training-runs/{run_id}/tags", response_model=List[TagOut])
def get_run_tags(run_id: UUID, db: Session = Depends(get_db)):
    """Get all tags assigned to a training run"""
    run = db.query(models.Run).options(
        selectinload(models.Run.tags)
    ).filter(models.Run.id == run_id).first()

    if not run:
        raise HTTPException(status_code=404, detail="Training run not found")

    return run.tags


@router.get("/runs-by-tag/{tag_id}")
def get_runs_by_tag(
    tag_id: UUID,
    include_descendants: bool = Query(default=True),
    db: Session = Depends(get_db)
):
    """Get all training runs associated with a tag, optionally including descendant tags"""
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    tag_ids = [tag_id]

    if include_descendants:
        # Include all descendant tags
        descendants = db.query(models.Tag).filter(
            models.Tag.path.like(f"{tag.path}/%")
        ).all()
        tag_ids.extend([d.id for d in descendants])

    # Get runs associated with these tags
    runs = db.query(models.Run).join(
        models.TrainingRunTag,
        models.Run.id == models.TrainingRunTag.training_run_id
    ).filter(
        models.TrainingRunTag.tag_id.in_(tag_ids)
    ).distinct().order_by(models.Run.created_at.desc()).all()

    return runs