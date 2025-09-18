from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from uuid import UUID

# Import TrainConfig from core
from core.config import TrainConfig


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GroupCreate(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None
    tags: Optional[List[str]] = Field(default_factory=list)


class GroupOut(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    description: Optional[str]
    tags: Optional[List[str]]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# TrainConfigIn removed - using core.config.TrainConfig directly


class TrainConfigCreate(BaseModel):
    project_id: str
    group_id: Optional[str] = None
    name: str
    config_json: TrainConfig


class TrainConfigUpdate(BaseModel):
    name: Optional[str] = None
    group_id: Optional[str] = None
    config_json: Optional[TrainConfig] = None


class TrainConfigOut(BaseModel):
    id: UUID
    project_id: UUID
    group_id: Optional[UUID]
    name: str
    config_json: dict
    version: int
    status: str
    hash: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RunCreate(BaseModel):
    agent_id: Optional[str] = None
    gpu_indices: List[int] = Field(default_factory=list)
    docker_image: Optional[str] = None
    env: Optional[dict] = None
    priority: int = 0


class RunOut(BaseModel):
    id: UUID
    project_id: UUID
    config_id: UUID
    group_id: Optional[UUID]
    name: str
    state: str
    monitor_metric: Optional[str]
    monitor_mode: Optional[str]
    best_value: Optional[float]
    epoch: Optional[int]
    step: Optional[int]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    agent_id: Optional[UUID]
    docker_image: Optional[str]
    seed: Optional[int]
    log_dir: Optional[str]
    ckpt_dir: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentCreate(BaseModel):
    name: str
    host: Optional[str] = None
    labels: Optional[dict] = None


class AgentOut(BaseModel):
    id: UUID
    name: str
    host: Optional[str]
    labels: Optional[dict]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GPUCreate(BaseModel):
    agent_id: str
    index: int
    uuid: Optional[str] = None
    name: Optional[str] = None
    total_mem_mb: Optional[int] = None
    compute_capability: Optional[str] = None


class GPUOut(BaseModel):
    id: UUID
    agent_id: UUID
    index: int
    uuid: Optional[str]
    name: Optional[str]
    total_mem_mb: Optional[int]
    compute_capability: Optional[str]
    is_allocated: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Datasets
class DatasetCreate(BaseModel):
    name: str
    root_path: str
    split_layout: dict | None = None
    class_map: dict | None = None
    sample_stats: dict | None = None


class DatasetOut(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    root_path: str
    split_layout: dict | None
    class_map: dict | None
    sample_stats: dict | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Models registry
class ModelCreate(BaseModel):
    label: str
    hf_checkpoint_id: str
    hf_token: str | None = None
    notes: str | None = None
    default_pretrained: bool = True


class ModelUpdate(BaseModel):
    label: str | None = None
    hf_checkpoint_id: str | None = None
    hf_token: str | None = None
    notes: str | None = None
    default_pretrained: bool | None = None


class ModelOut(BaseModel):
    id: UUID
    project_id: UUID
    label: str
    hf_checkpoint_id: str
    hf_token: str | None
    notes: str | None
    default_pretrained: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ModelOutSafe(BaseModel):
    """Model output without sensitive HF token for frontend"""
    id: UUID
    project_id: UUID
    label: str
    hf_checkpoint_id: str
    has_token: bool  # Indicates if model has a token without exposing it
    notes: str | None
    default_pretrained: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Augmentations
class AugmentationCreate(BaseModel):
    name: str
    type: str = "cpu"  # cpu|gpu
    params: dict | None = None
    enabled: bool = True
    version: int = 1


class AugmentationOut(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    type: str
    params: dict | None
    enabled: bool
    version: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Tags
class TagCreate(BaseModel):
    project_id: UUID
    name: str
    parent_id: Optional[UUID] = None


class TagUpdate(BaseModel):
    name: Optional[str] = None


class TagMove(BaseModel):
    new_parent_id: Optional[UUID] = None


class TagOut(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    parent_id: Optional[UUID]
    path: str
    level: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TagWithChildren(TagOut):
    children: List["TagWithChildren"] = []

# Update forward references
TagWithChildren.model_rebuild()


class TagAncestry(BaseModel):
    tags: List[TagOut]


class TagStats(BaseModel):
    tag_id: UUID
    tag_name: str
    direct_runs: int
    total_runs: int  # including descendant tags


# Training Run Tags
class RunTagAssignment(BaseModel):
    tag_ids: List[UUID]


class RunWithTags(RunOut):
    tags: List[TagOut] = []
