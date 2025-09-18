from __future__ import annotations

from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import String, Integer, Boolean, ForeignKey, Text, JSON, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .connection import Base, GUID, TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    auth_provider: Mapped[Optional[str]] = mapped_column(String(50), default="local")
    role: Mapped[str] = mapped_column(String(20), default="admin")


class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

    groups: Mapped[list[ExperimentGroup]] = relationship(back_populates="project", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("name", name="uq_projects_name"),)


class ExperimentGroup(TimestampMixin, Base):
    __tablename__ = "experiment_groups"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    tags: Mapped[Optional[list[str]]] = mapped_column(JSON, default=list)

    project: Mapped[Project] = relationship(back_populates="groups")

    __table_args__ = (
        Index("ix_groups_project_name", "project_id", "name", unique=True),
    )


class TrainConfigModel(TimestampMixin, Base):
    __tablename__ = "train_configs"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("projects.id", ondelete="CASCADE"))
    group_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID(), ForeignKey("experiment_groups.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    config_json: Mapped[dict] = mapped_column(JSON)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="ready")
    hash: Mapped[Optional[str]] = mapped_column(String(64))

    __table_args__ = (
        Index("ix_configs_project_name", "project_id", "name"),
    )


class Run(TimestampMixin, Base):
    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("projects.id", ondelete="CASCADE"))
    config_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("train_configs.id", ondelete="SET NULL"))
    group_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID(), ForeignKey("experiment_groups.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    state: Mapped[str] = mapped_column(String(20), default="queued")
    monitor_metric: Mapped[Optional[str]] = mapped_column(String(50))
    monitor_mode: Mapped[Optional[str]] = mapped_column(String(10))
    best_value: Mapped[Optional[float]] = mapped_column()
    epoch: Mapped[Optional[int]] = mapped_column(Integer)
    step: Mapped[Optional[int]] = mapped_column(Integer)
    started_at: Mapped[Optional[datetime]] = mapped_column()
    finished_at: Mapped[Optional[datetime]] = mapped_column()
    agent_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID(), ForeignKey("agents.id", ondelete="SET NULL"))
    docker_image: Mapped[Optional[str]] = mapped_column(String(255))
    seed: Mapped[Optional[int]] = mapped_column(Integer)
    log_dir: Mapped[Optional[str]] = mapped_column(String(512))
    ckpt_dir: Mapped[Optional[str]] = mapped_column(String(512))
    gpu_indices: Mapped[Optional[list[int]]] = mapped_column(JSON)

    # Many-to-many relationship with tags
    tags: Mapped[list["Tag"]] = relationship("Tag", secondary="training_run_tags", back_populates="runs")


class Job(TimestampMixin, Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("runs.id", ondelete="CASCADE"))
    queue_id: Mapped[Optional[str]] = mapped_column(String(64))
    enqueued_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    dequeued_at: Mapped[Optional[datetime]] = mapped_column()
    retries: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[Optional[str]] = mapped_column(Text)
    priority: Mapped[int] = mapped_column(Integer, default=0)


class Agent(TimestampMixin, Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    host: Mapped[Optional[str]] = mapped_column(String(255))
    labels: Mapped[Optional[dict]] = mapped_column(JSON)
    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column()
    api_version: Mapped[Optional[str]] = mapped_column(String(50))
    runner_version: Mapped[Optional[str]] = mapped_column(String(50))

    gpus: Mapped[list[GPU]] = relationship(back_populates="agent", cascade="all, delete-orphan")


class GPU(TimestampMixin, Base):
    __tablename__ = "gpus"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("agents.id", ondelete="CASCADE"))
    index: Mapped[int] = mapped_column(Integer)
    uuid: Mapped[Optional[str]] = mapped_column(String(64))
    name: Mapped[Optional[str]] = mapped_column(String(255))
    total_mem_mb: Mapped[Optional[int]] = mapped_column(Integer)
    compute_capability: Mapped[Optional[str]] = mapped_column(String(32))
    is_allocated: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column()

    agent: Mapped[Agent] = relationship(back_populates="gpus")

    __table_args__ = (
        Index("ix_gpu_agent_index", "agent_id", "index", unique=True),
    )


class Dataset(TimestampMixin, Base):
    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    root_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    split_layout: Mapped[dict | None] = mapped_column(JSON)
    class_map: Mapped[dict | None] = mapped_column(JSON)
    sample_stats: Mapped[dict | None] = mapped_column(JSON)

    __table_args__ = (
        Index("ix_dataset_project_name", "project_id", "name", unique=True),
    )


class ModelRegistry(TimestampMixin, Base):
    __tablename__ = "models"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("projects.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    hf_checkpoint_id: Mapped[str] = mapped_column(String(512), nullable=False)
    hf_token: Mapped[str | None] = mapped_column(String(256))  # HuggingFace token for private models
    notes: Mapped[str | None] = mapped_column(Text)
    default_pretrained: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        Index("ix_models_project_label", "project_id", "label", unique=True),
        Index("ix_models_project_hf_checkpoint", "project_id", "hf_checkpoint_id", unique=True),
    )


class Augmentation(TimestampMixin, Base):
    __tablename__ = "augmentations"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(10), default="cpu")  # cpu|gpu
    params: Mapped[dict | None] = mapped_column(JSON)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)

    __table_args__ = (
        Index("ix_aug_project_name", "project_id", "name", unique=True),
    )


class RunLog(TimestampMixin, Base):
    __tablename__ = "run_logs"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("runs.id", ondelete="CASCADE"))
    timestamp: Mapped[datetime] = mapped_column(nullable=False)
    level: Mapped[str] = mapped_column(String(10), default="info")  # debug, info, warning, error
    source: Mapped[str] = mapped_column(String(20), default="agent")  # agent, executor, training
    message: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        Index("ix_run_logs_run_timestamp", "run_id", "timestamp"),
    )


class Tag(TimestampMixin, Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID(), ForeignKey("tags.id", ondelete="CASCADE"))
    path: Mapped[str] = mapped_column(String(2048), nullable=False)  # Materialized path for efficient queries
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Self-referential relationship for hierarchy
    parent: Mapped[Optional[Tag]] = relationship("Tag", remote_side=[id], back_populates="children")
    children: Mapped[list[Tag]] = relationship("Tag", back_populates="parent", cascade="all, delete-orphan")

    # Many-to-many relationship with training runs
    runs: Mapped[list[Run]] = relationship("Run", secondary="training_run_tags", back_populates="tags")

    __table_args__ = (
        Index("ix_tags_parent_id", "parent_id"),
        Index("ix_tags_path", "path"),
        Index("ix_tags_level", "level"),
        Index("ix_tags_name", "name"),
        UniqueConstraint("name", "parent_id", name="uq_tags_name_parent"),  # Unique name within parent
    )


class TrainingRunTag(Base):
    __tablename__ = "training_run_tags"

    training_run_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("runs.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    __table_args__ = (
        Index("ix_training_run_tags_run_id", "training_run_id"),
        Index("ix_training_run_tags_tag_id", "tag_id"),
    )
