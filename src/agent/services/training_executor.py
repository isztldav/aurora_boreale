from __future__ import annotations

import os
import traceback
from datetime import datetime, timezone
from typing import Optional, Callable

from huggingface_hub import login, logout

from shared.logging.config import get_logger
from shared.database.connection import SessionLocal
from shared.database import models
from core.config import TrainConfig
from core.training import runner as train_runner

from ..domain import RunContext, TrainingProgress
from .log_streamer import LogStreamer


class TrainingExecutor:
    """Service responsible for executing training runs."""

    def __init__(self):
        self.logger = get_logger("agent.training_executor")
        self._datasets_root = os.environ.get("DATASETS_DIR", "/app/datasets")

    def execute_run(
        self,
        run_context: RunContext,
        progress_callback: Optional[Callable[[TrainingProgress], None]] = None,
        should_stop_callback: Optional[Callable[[], bool]] = None,
    ) -> bool:
        """
        Execute a training run.

        Args:
            run_context: Context information for the run
            progress_callback: Optional callback for progress updates
            should_stop_callback: Optional callback to check if execution should stop

        Returns:
            True if training completed successfully, False otherwise
        """
        db = SessionLocal()
        log_streamer = LogStreamer(run_context.run_id)

        try:
            # Start log capture
            log_streamer.start_capture()
            log_streamer.log_message(f"Training started for run {run_context.run_name}", "info", "agent")

            # Load training configuration
            train_config = self._build_train_config(db, run_context)

            # Setup GPU environment
            self._setup_gpu_environment(run_context.gpu_indices)

            # Log training start
            self._log_training_start(train_config, run_context)

            # Execute training
            success = self._run_training(
                train_config, progress_callback, should_stop_callback, log_streamer
            )

            # Update run status
            self._update_run_completion_status(db, run_context, success)

            log_streamer.log_message(
                f"Training {'completed successfully' if success else 'failed'} for run {run_context.run_name}",
                "info" if success else "error",
                "agent"
            )

            return success

        except Exception as e:
            log_streamer.log_message(f"Training error: {str(e)}", "error", "agent")
            self._handle_training_error(db, run_context, e)
            return False
        finally:
            log_streamer.stop_capture()
            db.close()
            logout()

    def _build_train_config(self, db, run_context: RunContext) -> TrainConfig:
        """Build TrainConfig from database configuration."""
        cfg_row = db.get(models.TrainConfigModel, run_context.config_id)
        if not cfg_row:
            raise RuntimeError(f"Train config {run_context.config_id} not found")

        cfg_dict = dict(cfg_row.config_json)

        # Note: autocast_dtype conversion is handled by TrainConfig validator

        # Fetch HF token from model registry if model uses one
        hf_token = self._get_hf_token_for_model(db, cfg_row.project_id, cfg_dict.get("model_flavour"))

        if hf_token:
            login(token=hf_token)

        # Set run-specific parameters
        cfg_dict.update({
            "run_name": run_context.run_name,
            "tb_root": run_context.log_dir,
            "ckpt_dir": run_context.ckpt_dir,
            "root": self._sanitize_dataset_path(cfg_dict.get("root")),
            "hf_token": bool(hf_token),  # Boolean flag indicating if HF token was used
        })

        return TrainConfig(**cfg_dict)


    def _sanitize_dataset_path(self, path: Optional[str]) -> str:
        """Sanitize and resolve dataset path under the datasets root."""
        raw_path = (path or "").strip()

        # Handle file:// prefix
        if raw_path.startswith("file://"):
            raw_path = raw_path[7:]

        # Normalize path separators
        raw_path = raw_path.replace("\\", "/")

        # If path already starts with datasets root, return it as-is (but normalized)
        if raw_path.startswith(self._datasets_root + "/") or raw_path == self._datasets_root:
            return os.path.normpath(raw_path)

        # Remove leading slashes and dots, resolve parent traversals
        raw_path = raw_path.lstrip("/\\.")
        parts = []

        for segment in raw_path.split("/"):
            if segment in ("", "."):
                continue
            if segment == "..":
                if parts:
                    parts.pop()
                continue
            parts.append(segment)

        safe_relative = "/".join(parts)
        return os.path.join(self._datasets_root, safe_relative)

    def _setup_gpu_environment(self, gpu_indices: list[int]) -> None:
        """Configure CUDA_VISIBLE_DEVICES for the training run."""
        if gpu_indices:
            os.environ["CUDA_VISIBLE_DEVICES"] = ",".join(str(i) for i in gpu_indices)

    def _log_training_start(self, config: TrainConfig, run_context: RunContext) -> None:
        """Log training start information and diagnostics."""
        self.logger.info(
            "Starting training",
            extra={
                "run_name": run_context.run_name,
                "epochs": config.epochs,
                "cuda_visible_devices": os.environ.get('CUDA_VISIBLE_DEVICES', '(unset)')
            }
        )

        self._log_path_diagnostics(config)
        self._log_memory_diagnostics(config)

    def _log_path_diagnostics(self, config: TrainConfig) -> None:
        """Log path diagnostics for datasets and output directories."""
        self.logger.info(
            "Training paths configuration",
            extra={
                "dataset_root": config.root,
                "tb_root": config.tb_root,
                "ckpt_dir": config.ckpt_dir
            }
        )

        if not os.path.isdir(config.root):
            self.logger.warning(
                "Dataset root does not exist - ensure host folder is mounted",
                extra={
                    "dataset_root": config.root,
                    "container_mount": "DATASETS_DIR"
                }
            )

    def _log_memory_diagnostics(self, config: TrainConfig) -> None:
        """Log shared memory diagnostics for DataLoader workers."""
        try:
            stat = os.statvfs("/dev/shm")
            shm_total = stat.f_frsize * stat.f_blocks
            shm_avail = stat.f_frsize * stat.f_bavail

            num_workers = int(getattr(config, "num_workers", 4) or 0)
            prefetch_factor = int(getattr(config, "prefetch_factor", 4) or 2)

            self.logger.info(
                "Shared memory diagnostics",
                extra={
                    "shm_total_mb": shm_total//(1024**2),
                    "shm_avail_mb": shm_avail//(1024**2),
                    "num_workers": num_workers,
                    "prefetch_factor": prefetch_factor
                }
            )

            if num_workers > 0 and shm_avail < 512 * 1024 * 1024:
                self.logger.warning(
                    "Low shared memory for DataLoader workers - consider increasing shm_size or setting num_workers=0",
                    extra={
                        "shm_avail_mb": shm_avail//(1024**2),
                        "recommended_shm_size": "2GB",
                        "alternative": "num_workers=0"
                    }
                )
        except Exception as e:
            self.logger.warning(
                "Failed to retrieve shared memory diagnostics",
                extra={"error": str(e)}
            )

    def _run_training(
        self,
        config: TrainConfig,
        progress_callback: Optional[Callable[[TrainingProgress], None]],
        should_stop_callback: Optional[Callable[[], bool]],
        log_streamer,
    ) -> bool:
        """Execute the actual training process."""
        # Create progress wrapper that matches the expected signature
        def progress_wrapper(epoch: int, total: int, epoch_dur: float, tb_log: Optional[str]):
            if progress_callback:
                progress = TrainingProgress(
                    epoch=epoch,
                    total_epochs=total,
                    epoch_duration=epoch_dur,
                )
                progress_callback(progress)

        # Run training
        train_runner.run_experiment(
            config,
            progress_cb=progress_wrapper,
            should_stop=should_stop_callback,
            log_streamer=log_streamer,
        )

        return True

    def _update_run_completion_status(
        self, db, run_context: RunContext, success: bool
    ) -> None:
        """Update run status upon completion."""
        run = db.get(models.Run, run_context.run_id)
        if not run:
            return

        run.state = "succeeded" if success else "failed"
        run.finished_at = datetime.now(timezone.utc)

        self._release_gpus(db, run)

        db.add(run)
        db.commit()

        self.logger.info(
            "Training run status updated",
            extra={
                "run_name": run_context.run_name,
                "status": "completed" if success else "failed"
            }
        )

    def _handle_training_error(self, db, run_context: RunContext, error: Exception) -> None:
        """Handle training execution errors."""
        self.logger.exception(
            "Training execution failed",
            extra={
                "run_name": run_context.run_name,
                "error": str(error)
            }
        )

        run = db.get(models.Run, run_context.run_id)
        if not run:
            return

        run.state = "failed"
        run.finished_at = datetime.now(timezone.utc)

        # Update job error
        job = db.query(models.Job).filter(models.Job.run_id == run_context.run_id).first()
        if job:
            job.last_error = str(error)
            db.add(job)

        self._release_gpus(db, run)

        db.add(run)
        db.commit()

    def _release_gpus(self, db, run: models.Run) -> None:
        """Release GPU allocations for the run."""
        if not (run.agent_id and run.gpu_indices):
            return

        for idx in run.gpu_indices:
            gpu = (
                db.query(models.GPU)
                .filter(models.GPU.agent_id == run.agent_id, models.GPU.index == idx)
                .first()
            )
            if gpu:
                gpu.is_allocated = False
                db.add(gpu)

    def _get_hf_token_for_model(self, db, project_id: str, model_flavour: Optional[str]) -> Optional[str]:
        """Get HuggingFace token for a specific model from the model registry."""
        if not model_flavour:
            return None

        # Look up the model in the project's model registry
        model_registry = (
            db.query(models.ModelRegistry)
            .filter(
                models.ModelRegistry.project_id == project_id,
                models.ModelRegistry.hf_checkpoint_id == model_flavour
            )
            .first()
        )

        if model_registry and model_registry.hf_token:
            self.logger.info(
                "Using HuggingFace token for private model",
                extra={"model_flavour": model_flavour}
            )
            return model_registry.hf_token

        return None