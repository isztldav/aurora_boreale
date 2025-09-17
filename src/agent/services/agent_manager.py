from __future__ import annotations

import asyncio
import threading
import time
from typing import Optional, Callable

# Database initialization is handled by the dashboard backend only

from shared.logging.config import get_logger
from ..domain import AgentStatus, AgentConfig, TrainingProgress, RunContext
from ..repositories import RunRepository
from .training_executor import TrainingExecutor


class AgentManager:
    """
    Manages the agent lifecycle including job polling, training execution, and status tracking.
    """

    def __init__(self, config: AgentConfig):
        self.logger = get_logger("agent.manager")
        self.config = config
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._halt_requested = threading.Event()
        self._cancel_requested = threading.Event()
        self._finish_requested = threading.Event()

        # Current run state
        self._current_run_id: Optional[str] = None
        self._current_run_name: Optional[str] = None
        self._current_epoch: Optional[int] = None
        self._total_epochs: Optional[int] = None
        self._avg_epoch_time: Optional[float] = None
        self._started_at_ts: Optional[float] = None

        # Idle logging throttling
        self._last_idle_log_ts: float = 0.0

        # Dependencies
        self._run_repository = RunRepository()
        self._training_executor = TrainingExecutor()

    def get_status(self) -> AgentStatus:
        """Get current agent status."""
        with self._lock:
            if self._current_run_id is None:
                return AgentStatus(state="idle")

            elapsed = time.time() - (self._started_at_ts or time.time())
            eta = self._calculate_eta()

            return AgentStatus(
                state="running",
                run_id=self._current_run_id,
                name=self._current_run_name,
                epoch=self._current_epoch,
                total_epochs=self._total_epochs,
                started_at=self._format_start_time(),
                elapsed_seconds=elapsed,
                eta_seconds=eta,
            )

    def request_halt(self) -> None:
        """Request halt of current training run."""
        self._halt_requested.set()
        self.logger.info("Halt requested for current training run")

    def request_cancel(self) -> None:
        """Request immediate cancellation of current training run."""
        self._cancel_requested.set()
        self.logger.info("Cancel requested for current training run")

    def request_finish(self) -> None:
        """Request early finish of current training run."""
        self._finish_requested.set()
        self.logger.info("Finish requested for current training run")

    def stop(self) -> None:
        """Stop the agent manager."""
        self._stop_event.set()

    async def run_forever(self) -> None:
        """Main agent loop - polls for jobs and executes training runs."""
        # Note: Database initialization is handled by the dashboard backend
        self.logger.info(
            "Agent manager started",
            extra={"agent_id": self.config.agent_id, "poll_interval": self.config.poll_interval}
        )

        while not self._stop_event.is_set():
            did_work = await asyncio.get_event_loop().run_in_executor(None, self._process_next_run)

            if not did_work:
                self._log_idle_status()
                await asyncio.sleep(self.config.poll_interval)

    def _process_next_run(self) -> bool:
        """Process the next available run. Returns True if work was done."""
        run_context = self._run_repository.get_next_queued_run(self.config.agent_id)
        if not run_context:
            return False

        self._execute_training_run(run_context)
        return True

    def _execute_training_run(self, run_context: RunContext) -> None:
        """Execute a training run with proper state management."""
        try:
            self._initialize_run_state(run_context)

            success = self._training_executor.execute_run(
                run_context,
                progress_callback=self._on_training_progress,
                should_stop_callback=self._should_stop,
            )

            self._finalize_run_state(run_context, success)

        except Exception as e:
            self.logger.exception(
                "Unexpected error executing training run",
                extra={"run_name": run_context.run_name, "run_id": run_context.run_id}
            )
            self._finalize_run_state(run_context, success=False)
        finally:
            self._clear_run_state()

    def _initialize_run_state(self, run_context: RunContext) -> None:
        """Initialize run state tracking."""
        self._halt_requested.clear()
        self._cancel_requested.clear()
        self._finish_requested.clear()

        with self._lock:
            self._current_run_id = run_context.run_id
            self._current_run_name = run_context.run_name
            self._current_epoch = 0
            # Total epochs will be set by the training progress callback
            self._total_epochs = None
            self._avg_epoch_time = None
            self._started_at_ts = time.time()

        self.logger.info(
            "Starting training run",
            extra={"run_name": run_context.run_name, "run_id": run_context.run_id}
        )

    def _finalize_run_state(self, run_context: RunContext, success: bool) -> None:
        """Finalize run state based on completion status."""
        if self._cancel_requested.is_set():
            self._run_repository.mark_run_canceled(run_context.run_id)
            status = "canceled"
        elif self._halt_requested.is_set():
            self._run_repository.mark_run_canceled(run_context.run_id)
            status = "canceled"
        elif self._finish_requested.is_set():
            self._run_repository.mark_run_succeeded(run_context.run_id)
            status = "succeeded"
        elif success:
            self._run_repository.mark_run_succeeded(run_context.run_id)
            status = "succeeded"
        else:
            self._run_repository.mark_run_failed(run_context.run_id)
            status = "failed"

        self.logger.info(
            "Training run completed",
            extra={"run_name": run_context.run_name, "run_id": run_context.run_id, "status": status}
        )

    def _clear_run_state(self) -> None:
        """Clear current run state."""
        with self._lock:
            self._current_run_id = None
            self._current_run_name = None
            self._current_epoch = None
            self._total_epochs = None
            self._avg_epoch_time = None
            self._started_at_ts = None

        self.logger.debug(
            "Cleared run state",
            extra={"agent_id": self.config.agent_id}
        )

    def _on_training_progress(self, progress: TrainingProgress) -> None:
        """Handle training progress updates."""
        with self._lock:
            self._current_epoch = progress.epoch
            self._total_epochs = progress.total_epochs

            # Update moving average of epoch time
            if self._avg_epoch_time is None:
                self._avg_epoch_time = progress.epoch_duration
            else:
                # Exponential moving average with α=0.3
                self._avg_epoch_time = 0.7 * self._avg_epoch_time + 0.3 * progress.epoch_duration

            eta = self._calculate_eta()

        # Update database
        self._run_repository.update_run_epoch(
            self._current_run_id,
            progress.epoch + 1  # Human-friendly 1-based indexing
        )

        self.logger.info(
            "Training epoch completed",
            extra={
                "epoch": progress.epoch + 1,
                "total_epochs": progress.total_epochs,
                "epoch_duration": progress.epoch_duration,
                "eta_seconds": eta
            }
        )

    def _should_stop(self) -> bool:
        """Check if training should be stopped."""
        return (self._halt_requested.is_set() or
                self._cancel_requested.is_set() or
                self._finish_requested.is_set() or
                self._stop_event.is_set())

    def _calculate_eta(self) -> Optional[float]:
        """Calculate estimated time to completion."""
        if not (self._avg_epoch_time and self._current_epoch is not None and self._total_epochs):
            return None

        remaining_epochs = max(0, self._total_epochs - (self._current_epoch + 1))
        return remaining_epochs * self._avg_epoch_time

    def _format_start_time(self) -> Optional[str]:
        """Format start time as ISO string."""
        if not self._started_at_ts:
            return None

        from datetime import datetime, timezone
        return datetime.fromtimestamp(self._started_at_ts, tz=timezone.utc).isoformat()

    def _log_idle_status(self) -> None:
        """Log idle status with throttling to avoid spam."""
        now = time.time()
        if now - self._last_idle_log_ts >= self.config.idle_log_interval:
            self.logger.debug(
                "No queued runs available",
                extra={"agent_id": self.config.agent_id, "poll_interval": self.config.poll_interval}
            )
            self._last_idle_log_ts = now