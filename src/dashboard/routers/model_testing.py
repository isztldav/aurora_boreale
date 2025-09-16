"""API endpoints for model testing functionality."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from dashboard.db import get_db
from dashboard import models
from agent.services.model_tester import ModelTester

router = APIRouter(prefix="/model-testing", tags=["model-testing"])


@router.get("/{run_id}/info")
def get_run_testing_info(run_id: str, db: Session = Depends(get_db)):
    """Get information about a run for testing purposes."""
    try:
        tester = ModelTester()
        info = tester.get_run_info(run_id)
        return info
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get run info: {str(e)}")


@router.post("/{run_id}/test")
async def test_image(
    run_id: str,
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Test an uploaded image against a trained model."""

    # Validate file type
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Check file size (limit to 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    if image.size and image.size > max_size:
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")

    try:
        # Read image data
        image_data = await image.read()

        # Run model testing
        tester = ModelTester()
        result = tester.test_image(run_id, image_data)

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Model testing failed: {str(e)}")


@router.get("/{run_id}/classes")
def get_model_classes(run_id: str, db: Session = Depends(get_db)):
    """Get the class labels for a trained model."""
    try:
        tester = ModelTester()
        info = tester.get_run_info(run_id)

        return {
            "run_id": run_id,
            "run_name": info["run_name"],
            "num_classes": info["num_classes"],
            "class_labels": info["class_labels"]
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get classes: {str(e)}")


@router.get("/")
def list_testable_runs(db: Session = Depends(get_db)):
    """List all runs that have available checkpoints for testing."""
    try:
        # Get all completed runs
        runs = db.query(models.Run).filter(
            models.Run.state.in_(["succeeded", "finished"])
        ).order_by(models.Run.created_at.desc()).limit(50).all()

        tester = ModelTester()
        testable_runs = []

        for run in runs:
            try:
                info = tester.get_run_info(run.id)
                if info["can_test"]:
                    testable_runs.append({
                        "run_id": run.id,
                        "run_name": run.name,
                        "project_id": run.project_id,
                        "state": run.state,
                        "num_classes": info["num_classes"],
                        "epoch": run.epoch,
                        "best_value": run.best_value,
                        "monitor_metric": run.monitor_metric,
                        "finished_at": run.finished_at.isoformat() if run.finished_at else None
                    })
            except Exception:
                # Skip runs that can't be tested
                continue

        return {"runs": testable_runs}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list testable runs: {str(e)}")