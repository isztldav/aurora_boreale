from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from shared.database.connection import SessionLocal
from shared.database import models

from ..domain import RunContext

# Import WebSocket manager for real-time updates (optional)
try:
    from dashboard.routers.ws import ws_manager
except ImportError:
    ws_manager = None


class RunRepository:
    """Repository for run-related database operations."""

    def __init__(self):
        self._db_factory = SessionLocal

    def get_next_queued_run(self, agent_id: str) -> Optional[RunContext]:
        """
        Get the next queued run for the specified agent.

        Returns:
            RunContext if a run is available, None otherwise
        """
        with self._db_factory() as db:
            # Find next queued run by priority and enqueue time
            result = (
                db.query(models.Job, models.Run)
                .join(models.Run, models.Job.run_id == models.Run.id)
                .filter(
                    models.Run.state == "queued",
                    models.Run.agent_id == agent_id
                )
                .order_by(
                    models.Job.priority.desc(),
                    models.Job.enqueued_at.asc()
                )
                .first()
            )

            if not result:
                return None

            job, run = result

            # Mark as running and dequeued
            run.state = "running"
            run.started_at = datetime.now(timezone.utc)
            job.dequeued_at = datetime.now(timezone.utc)

            db.add(run)
            db.add(job)
            db.commit()

            print(
                f"[repository] Dequeued run id={run.id} name={run.name} "
                f"priority={job.priority} queued_at={job.enqueued_at}"
            )

            return RunContext(
                run_id=str(run.id),
                run_name=run.name,
                config_id=str(run.config_id),
                gpu_indices=run.gpu_indices or [],
                log_dir=run.log_dir,
                ckpt_dir=run.ckpt_dir,
            )

    def update_run_epoch(self, run_id: str, epoch: int) -> bool:
        """Update the current epoch for a run."""
        with self._db_factory() as db:
            run = db.get(models.Run, run_id)
            if not run:
                return False

            run.epoch = epoch
            db.add(run)
            db.commit()

            return True

    def mark_run_canceled(self, run_id: str) -> bool:
        """Mark a run as canceled."""
        return self._update_run_state(run_id, "canceled")

    def mark_run_succeeded(self, run_id: str) -> bool:
        """Mark a run as succeeded."""
        return self._update_run_state(run_id, "succeeded")

    def mark_run_failed(self, run_id: str, error_message: Optional[str] = None) -> bool:
        """Mark a run as failed and optionally set error message."""
        with self._db_factory() as db:
            run = db.get(models.Run, run_id)
            if not run:
                return False

            run.state = "failed"
            run.finished_at = datetime.now(timezone.utc)

            # Release GPUs
            if run.agent_id and run.gpu_indices:
                for idx in run.gpu_indices:
                    gpu = (
                        db.query(models.GPU)
                        .filter(models.GPU.agent_id == run.agent_id, models.GPU.index == idx)
                        .first()
                    )
                    if gpu:
                        gpu.is_allocated = False
                        db.add(gpu)

            # Update associated job with error
            if error_message:
                job = db.query(models.Job).filter(models.Job.run_id == run_id).first()
                if job:
                    job.last_error = error_message
                    db.add(job)

            db.add(run)
            db.commit()

            # Broadcast WebSocket update
            self._broadcast_run_update(run)

            return True

    def _update_run_state(self, run_id: str, state: str) -> bool:
        """Update run state and finished timestamp."""
        with self._db_factory() as db:
            run = db.get(models.Run, run_id)
            if not run:
                return False

            run.state = state
            run.finished_at = datetime.now(timezone.utc)

            # Release GPUs if finalizing
            if state in {"succeeded", "failed", "canceled"} and run.agent_id and run.gpu_indices:
                for idx in run.gpu_indices:
                    gpu = (
                        db.query(models.GPU)
                        .filter(models.GPU.agent_id == run.agent_id, models.GPU.index == idx)
                        .first()
                    )
                    if gpu:
                        gpu.is_allocated = False
                        db.add(gpu)

            db.add(run)
            db.commit()

            # Broadcast WebSocket update
            self._broadcast_run_update(run)

            return True

    def _broadcast_run_update(self, run: models.Run) -> None:
        """Broadcast run state update via WebSocket."""
        if not ws_manager:
            return

        try:
            payload = {
                "type": "run.updated",
                "run": self._serialize_run(run),
            }
            import anyio
            anyio.from_thread.run(ws_manager.broadcast_json, payload, topic="runs")
        except Exception as e:
            print(f"[repository] Failed to broadcast run update: {e}")

    def _serialize_run(self, run: models.Run) -> dict:
        """Serialize run model for WebSocket broadcast."""
        return {
            "id": str(run.id),
            "project_id": str(run.project_id) if run.project_id else None,
            "config_id": str(run.config_id) if run.config_id else None,
            "group_id": str(run.group_id) if run.group_id else None,
            "name": run.name,
            "state": run.state,
            "monitor_metric": run.monitor_metric,
            "monitor_mode": run.monitor_mode,
            "best_value": run.best_value,
            "epoch": run.epoch,
            "step": run.step,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "agent_id": str(run.agent_id) if run.agent_id else None,
            "docker_image": run.docker_image,
            "seed": run.seed,
            "log_dir": run.log_dir,
            "ckpt_dir": run.ckpt_dir,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "updated_at": run.updated_at.isoformat() if run.updated_at else None,
            "gpu_indices": run.gpu_indices or [],
        }