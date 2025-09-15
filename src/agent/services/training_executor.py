from __future__ import annotations

import os
import traceback
from datetime import datetime, timezone
from typing import Optional, Callable

from huggingface_hub import login, logout

from dashboard.db import SessionLocal
from dashboard import models
from common.config import TrainConfig
from common import runner as train_runner

from ..domain import RunContext, TrainingProgress


class TrainingExecutor:
    """Service responsible for executing training runs."""

    def __init__(self):
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
        try:
            # Load training configuration
            train_config = self._build_train_config(db, run_context)

            # Setup GPU environment
            self._setup_gpu_environment(run_context.gpu_indices)

            # Log training start
            self._log_training_start(train_config, run_context)

            # Execute training
            success = self._run_training(
                train_config, progress_callback, should_stop_callback
            )

            # Update run status
            self._update_run_completion_status(db, run_context, success)

            return success

        except Exception as e:
            self._handle_training_error(db, run_context, e)
            return False
        finally:
            db.close()
            logout()

    def _build_train_config(self, db, run_context: RunContext) -> TrainConfig:
        """Build TrainConfig from database configuration."""
        cfg_row = db.get(models.TrainConfigModel, run_context.config_id)
        if not cfg_row:
            raise RuntimeError(f"Train config {run_context.config_id} not found")

        cfg_dict = dict(cfg_row.config_json)

        # Handle autocast dtype conversion
        self._convert_autocast_dtype(cfg_dict)

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
            "hf_token": True if hf_token else False,  # Add HF token for model loading
        })

        return TrainConfig(**cfg_dict)

    def _convert_autocast_dtype(self, cfg_dict: dict) -> None:
        """Convert autocast dtype string to torch dtype if needed."""
        try:
            import torch
            autocast_dtype = cfg_dict.get("autocast_dtype")
            if isinstance(autocast_dtype, str) and autocast_dtype.startswith("torch."):
                dtype_name = autocast_dtype.split(".", 1)[1]
                cfg_dict["autocast_dtype"] = getattr(torch, dtype_name)
        except Exception:
            pass

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
        print(
            f"[executor] Starting training: run={run_context.run_name} "
            f"epochs={config.epochs} "
            f"cuda_visible_devices={os.environ.get('CUDA_VISIBLE_DEVICES', '(unset)')}"
        )

        self._log_path_diagnostics(config)
        self._log_memory_diagnostics(config)

    def _log_path_diagnostics(self, config: TrainConfig) -> None:
        """Log path diagnostics for datasets and output directories."""
        print(
            f"[executor] Paths: dataset_root={config.root} "
            f"tb_root={config.tb_root} ckpt_dir={config.ckpt_dir}"
        )

        if not os.path.isdir(config.root):
            print(
                f"[executor][warn] Dataset root does not exist: {config.root}. "
                "Ensure the host folder is mounted into the container (DATASETS_DIR)."
            )

    def _log_memory_diagnostics(self, config: TrainConfig) -> None:
        """Log shared memory diagnostics for DataLoader workers."""
        try:
            stat = os.statvfs("/dev/shm")
            shm_total = stat.f_frsize * stat.f_blocks
            shm_avail = stat.f_frsize * stat.f_bavail

            num_workers = int(getattr(config, "num_workers", 4) or 0)
            prefetch_factor = int(getattr(config, "prefetch_factor", 4) or 2)

            print(
                f"[executor] /dev/shm total={shm_total//(1024**2)}MB "
                f"avail={shm_avail//(1024**2)}MB; "
                f"num_workers={num_workers} prefetch_factor={prefetch_factor}"
            )

            if num_workers > 0 and shm_avail < 512 * 1024 * 1024:
                print(
                    "[executor][warn] Low shared memory available for DataLoader workers. "
                    "Increase container shm_size (e.g., 2GB) or set num_workers=0 "
                    "in the config to avoid worker crashes."
                )
        except Exception:
            pass

    def _run_training(
        self,
        config: TrainConfig,
        progress_callback: Optional[Callable[[TrainingProgress], None]],
        should_stop_callback: Optional[Callable[[], bool]],
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

        print(f"[executor] Training {'completed' if success else 'failed'} for run={run_context.run_name}")

    def _handle_training_error(self, db, run_context: RunContext, error: Exception) -> None:
        """Handle training execution errors."""
        print(f"[executor][error] Exception while training run={run_context.run_name}: {error}")
        traceback.print_exc()

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
            print(f"[executor] Using HF token for private model: {model_flavour}")
            return model_registry.hf_token

        return None