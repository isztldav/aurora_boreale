from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from uuid import UUID


class ProjectCreate(BaseModel):
    name: str
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


class TrainConfigIn(BaseModel):
    # Flat TrainConfig fields (mirror utils.config.TrainConfig)
    root: str
    model_flavour: str
    loss_name: str
    batch_size: int = 256
    num_workers: int = 4
    prefetch_factor: int = 4
    persistent_workers: bool = False
    epochs: int = 10
    optimizer: str = "adam"
    lr: float = 1e-3
    weight_decay: float = 0.05
    max_grad_norm: float = 1.0
    warmup_ratio: float = 0.05
    grad_accum_steps: int = 1
    seed: int = 42
    autocast_dtype: str = "torch.bfloat16"
    load_pretrained: bool = True
    run_name: Optional[str] = None
    tb_root: str = "runs"
    eval_topk: list[int] = [3, 5]
    model_suffix: str = ""
    freeze_backbone: bool = False
    ckpt_dir: str = "checkpoints"
    monitor_metric: str = "val_acc@1"
    monitor_mode: str = "max"
    save_per_epoch_checkpoint: bool = False
    max_datapoints_per_class: int | list[int] = 10_000


class TrainConfigCreate(BaseModel):
    project_id: str
    group_id: Optional[str] = None
    name: str
    config_json: TrainConfigIn


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
    notes: str | None = None
    default_pretrained: bool = True


class ModelOut(BaseModel):
    id: UUID
    project_id: UUID
    label: str
    hf_checkpoint_id: str
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
