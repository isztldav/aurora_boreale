import os
import random
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..db import get_db
from .. import models as orm
from ..schemas import DatasetCreate, DatasetOut

router = APIRouter(prefix="/projects", tags=["datasets"])
browse_router = APIRouter(prefix="/datasets", tags=["datasets-browse"])


# Pydantic models for file browsing
class FileItem(BaseModel):
    name: str
    path: str
    is_directory: bool
    size: Optional[int] = None
    modified: Optional[str] = None


class DirectoryContents(BaseModel):
    current_path: str
    parent_path: Optional[str]
    items: List[FileItem]


class DatasetStructure(BaseModel):
    path: str
    is_valid: bool
    splits: List[str]
    classes: List[str]
    class_counts: dict[str, dict[str, int]]
    total_samples: int
    sample_images: List[str]  # paths to sample images for preview


class ImageSample(BaseModel):
    path: str
    class_name: str
    split: str
    size: Optional[tuple[int, int]] = None


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


# File browsing endpoints
@browse_router.get("/browse", response_model=DirectoryContents)
def browse_datasets(path: str = Query("/app/datasets", description="Directory path to browse")):
    """Browse filesystem to help users select dataset paths."""
    try:
        # Security: only allow browsing within datasets directory
        datasets_root = Path(os.getenv("DATASETS_DIR", "/app/datasets"))
        browse_path = Path(path)

        # Resolve and validate path is within datasets directory
        try:
            resolved_path = browse_path.resolve()
            datasets_root.resolve().relative_to(datasets_root.resolve())  # Check datasets_root exists
            if not str(resolved_path).startswith(str(datasets_root.resolve())):
                resolved_path = datasets_root
        except (ValueError, OSError):
            resolved_path = datasets_root

        if not resolved_path.exists():
            raise HTTPException(status_code=404, detail="Directory not found")

        if not resolved_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is not a directory")

        # Get parent path (null if at datasets root)
        parent_path = None
        if resolved_path != datasets_root:
            parent_path = str(resolved_path.parent)

        # List directory contents
        items = []
        try:
            for item in sorted(resolved_path.iterdir()):
                if item.name.startswith('.'):  # Skip hidden files
                    continue

                stat = item.stat()
                file_item = FileItem(
                    name=item.name,
                    path=str(item),
                    is_directory=item.is_dir(),
                    size=stat.st_size if item.is_file() else None,
                    modified=str(stat.st_mtime)
                )
                items.append(file_item)
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")

        return DirectoryContents(
            current_path=str(resolved_path),
            parent_path=parent_path,
            items=items
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error browsing directory: {str(e)}")


@browse_router.get("/analyze", response_model=DatasetStructure)
def analyze_dataset_structure(path: str = Query(..., description="Dataset root path to analyze")):
    """Analyze dataset structure and return metadata for ImageFolder format."""
    try:
        datasets_root = Path(os.getenv("DATASETS_DIR", "/app/datasets"))
        dataset_path = Path(path)

        # Security: ensure path is within datasets directory
        try:
            resolved_path = dataset_path.resolve()
            if not str(resolved_path).startswith(str(datasets_root.resolve())):
                raise HTTPException(status_code=403, detail="Path outside allowed directory")
        except (ValueError, OSError):
            raise HTTPException(status_code=400, detail="Invalid path")

        if not resolved_path.exists() or not resolved_path.is_dir():
            raise HTTPException(status_code=404, detail="Dataset directory not found")

        # Analyze ImageFolder structure
        splits = []
        all_classes = set()
        class_counts = {}
        total_samples = 0
        sample_images = []

        # Check for common split directories
        for split_name in ["train", "val", "test", "validation"]:
            split_dir = resolved_path / split_name
            if split_dir.exists() and split_dir.is_dir():
                splits.append(split_name)
                split_classes = []
                split_counts = {}

                # Check for class directories within split
                for class_dir in split_dir.iterdir():
                    if class_dir.is_dir() and not class_dir.name.startswith('.'):
                        class_name = class_dir.name
                        all_classes.add(class_name)
                        split_classes.append(class_name)

                        # Count images in class directory
                        image_files = [f for f in class_dir.iterdir()
                                     if f.is_file() and f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']]
                        count = len(image_files)
                        split_counts[class_name] = count
                        total_samples += count

                        # Collect sample images (max 3 per class)
                        sample_files = random.sample(image_files, min(3, len(image_files)))
                        sample_images.extend([str(f) for f in sample_files])

                class_counts[split_name] = split_counts

        # If no standard splits found, check if root contains class directories
        if not splits:
            class_dirs = [d for d in resolved_path.iterdir()
                         if d.is_dir() and not d.name.startswith('.')]
            if class_dirs:
                splits = ["root"]
                split_counts = {}
                for class_dir in class_dirs:
                    class_name = class_dir.name
                    all_classes.add(class_name)

                    image_files = [f for f in class_dir.iterdir()
                                 if f.is_file() and f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']]
                    count = len(image_files)
                    split_counts[class_name] = count
                    total_samples += count

                    sample_files = random.sample(image_files, min(3, len(image_files)))
                    sample_images.extend([str(f) for f in sample_files])

                class_counts["root"] = split_counts

        is_valid = len(splits) > 0 and len(all_classes) > 0

        return DatasetStructure(
            path=str(resolved_path),
            is_valid=is_valid,
            splits=splits,
            classes=sorted(list(all_classes)),
            class_counts=class_counts,
            total_samples=total_samples,
            sample_images=sample_images[:15]  # Limit to 15 sample images
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing dataset: {str(e)}")


@browse_router.get("/sample-images")
def get_sample_images(paths: List[str] = Query(..., description="List of image paths to sample")):
    """Get metadata for sample images."""
    try:
        from PIL import Image
        samples = []
        datasets_root = Path(os.getenv("DATASETS_DIR", "/app/datasets"))

        for path_str in paths[:10]:  # Limit to 10 images
            try:
                img_path = Path(path_str)
                # Security check
                if not str(img_path.resolve()).startswith(str(datasets_root.resolve())):
                    continue

                if not img_path.exists():
                    continue

                # Extract class and split from path structure
                parts = img_path.relative_to(datasets_root).parts
                if len(parts) >= 3:  # datasets/split/class/image.jpg
                    split = parts[-3]
                    class_name = parts[-2]
                else:
                    split = "unknown"
                    class_name = "unknown"

                # Get image dimensions
                size = None
                try:
                    with Image.open(img_path) as img:
                        size = img.size
                except Exception:
                    pass

                samples.append(ImageSample(
                    path=str(img_path),
                    class_name=class_name,
                    split=split,
                    size=size
                ))
            except Exception:
                continue  # Skip problematic files

        return samples

    except ImportError:
        raise HTTPException(status_code=500, detail="PIL not available for image analysis")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing sample images: {str(e)}")


@browse_router.get("/serve-image")
def serve_image(path: str = Query(..., description="Image path to serve")):
    """Serve an image file from the datasets directory."""
    try:
        datasets_root = Path(os.getenv("DATASETS_DIR", "/app/datasets"))
        image_path = Path(path)

        # Security: ensure path is within datasets directory
        try:
            resolved_path = image_path.resolve()
            if not str(resolved_path).startswith(str(datasets_root.resolve())):
                raise HTTPException(status_code=403, detail="Path outside allowed directory")
        except (ValueError, OSError):
            raise HTTPException(status_code=400, detail="Invalid path")

        if not resolved_path.exists():
            raise HTTPException(status_code=404, detail="Image not found")

        if not resolved_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Check if it's an image file
        allowed_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
        if resolved_path.suffix.lower() not in allowed_extensions:
            raise HTTPException(status_code=400, detail="File is not a supported image format")

        # Return the image file
        return FileResponse(
            path=str(resolved_path),
            media_type=f"image/{resolved_path.suffix[1:]}",
            filename=resolved_path.name
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error serving image: {str(e)}")

