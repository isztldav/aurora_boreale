from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum

from pydantic import BaseModel


class RunState(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"


class AgentStatus(BaseModel):
    state: str  # idle|running
    run_id: Optional[str] = None
    name: Optional[str] = None
    epoch: Optional[int] = None
    total_epochs: Optional[int] = None
    started_at: Optional[str] = None
    elapsed_seconds: Optional[float] = None
    eta_seconds: Optional[float] = None


@dataclass
class GPUInfo:
    index: int
    uuid: Optional[str]
    name: Optional[str]
    total_mem_mb: Optional[int]
    compute_capability: Optional[str]

    @classmethod
    def empty(cls, index: int = 0) -> GPUInfo:
        return cls(
            index=index,
            uuid=None,
            name=None,
            total_mem_mb=None,
            compute_capability=None,
        )


@dataclass
class TrainingProgress:
    epoch: int
    total_epochs: int
    epoch_duration: float
    avg_epoch_time: Optional[float] = None
    eta_seconds: Optional[float] = None


@dataclass
class AgentConfig:
    agent_id: str
    poll_interval: float = 3.0
    idle_log_interval: float = 15.0
    heartbeat_interval: float = 15.0


@dataclass
class RunContext:
    run_id: str
    run_name: str
    config_id: str
    gpu_indices: list[int]
    log_dir: str
    ckpt_dir: str