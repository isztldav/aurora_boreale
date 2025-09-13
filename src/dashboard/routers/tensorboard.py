from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..tensorboard import record_heartbeat, get_embedded_url_path


router = APIRouter(prefix="/tensorboard", tags=["tensorboard"])


class HeartbeatIn(BaseModel):
    run_id: str


@router.post("/heartbeat")
def heartbeat(payload: HeartbeatIn):
    if not payload.run_id:
        raise HTTPException(status_code=400, detail="run_id required")
    return record_heartbeat(payload.run_id)


@router.get("/embed/{run_id}")
def embed_url(run_id: str):
    # Convenience endpoint; mirrors /runs/{run_id}/tensorboard
    return {"url": get_embedded_url_path(run_id)}

