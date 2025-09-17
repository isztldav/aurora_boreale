from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from shared.database.connection import SessionLocal
from shared.database import models

from ..domain import GPUInfo


class AgentRepository:
    """Repository for agent-related database operations."""

    def __init__(self):
        self._db_factory = SessionLocal

    def upsert_agent(
        self,
        agent_id: uuid.UUID,
        name: str,
        host: str,
        gpu_info: GPUInfo
    ) -> models.Agent:
        """Create or update an agent record."""
        with self._db_factory() as db:
            agent = db.get(models.Agent, agent_id)

            if not agent:
                agent = models.Agent(
                    id=agent_id,
                    name=name,
                    host=host,
                    labels=self._build_gpu_labels(gpu_info),
                )
            else:
                # Update existing agent
                labels = agent.labels or {}
                labels.update(self._build_gpu_labels(gpu_info))

                agent.name = agent.name or name
                agent.host = host
                agent.labels = labels

            agent.last_heartbeat_at = datetime.now(timezone.utc)

            db.add(agent)
            db.commit()
            db.refresh(agent)

            return agent

    def update_heartbeat(self, agent_id: uuid.UUID) -> bool:
        """Update agent heartbeat timestamp."""
        with self._db_factory() as db:
            agent = db.get(models.Agent, agent_id)
            if not agent:
                return False

            agent.last_heartbeat_at = datetime.now(timezone.utc)
            db.add(agent)
            db.commit()

            return True

    def upsert_gpu(self, agent_id: uuid.UUID, gpu_info: GPUInfo) -> models.GPU:
        """Create or update a GPU record for an agent."""
        with self._db_factory() as db:
            gpu = (
                db.query(models.GPU)
                .filter(
                    models.GPU.agent_id == agent_id,
                    models.GPU.index == gpu_info.index
                )
                .first()
            )

            if not gpu:
                gpu = models.GPU(
                    agent_id=agent_id,
                    index=gpu_info.index,
                )

            # Update GPU information
            gpu.uuid = gpu_info.uuid
            gpu.name = gpu_info.name
            gpu.total_mem_mb = gpu_info.total_mem_mb
            gpu.compute_capability = gpu_info.compute_capability
            gpu.last_seen_at = datetime.now(timezone.utc)

            db.add(gpu)
            db.commit()
            db.refresh(gpu)

            return gpu

    def update_gpu_heartbeat(self, agent_id: uuid.UUID, gpu_index: int) -> bool:
        """Update GPU heartbeat timestamp."""
        with self._db_factory() as db:
            gpu = (
                db.query(models.GPU)
                .filter(
                    models.GPU.agent_id == agent_id,
                    models.GPU.index == gpu_index
                )
                .first()
            )

            if not gpu:
                return False

            gpu.last_seen_at = datetime.now(timezone.utc)
            db.add(gpu)
            db.commit()

            return True

    def _build_gpu_labels(self, gpu_info: GPUInfo) -> dict:
        """Build GPU labels dictionary from GPU info."""
        return {
            "gpu_index": gpu_info.index,
            "gpu_uuid": gpu_info.uuid,
            "gpu_name": gpu_info.name,
            "compute_capability": gpu_info.compute_capability,
        }