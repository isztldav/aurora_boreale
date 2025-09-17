from __future__ import annotations

import sys
import threading
from datetime import datetime, timezone
from io import StringIO
from typing import Optional, Callable

from shared.database.connection import SessionLocal
from shared.database import models

# Import WebSocket notifier for real-time updates
from .websocket_notifier import websocket_notifier


class LogStreamer:
    """Service for capturing and streaming training logs."""

    def __init__(self, run_id: str):
        self.run_id = run_id
        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        self._is_capturing = False
        self._lock = threading.Lock()
        self._last_progress_time = 0
        self._progress_throttle_seconds = 2.0  # Only log progress every 2 seconds

    def start_capture(self):
        """Start capturing stdout/stderr to database."""
        with self._lock:
            if self._is_capturing:
                return

            self._is_capturing = True

            # Redirect stdout and stderr to our custom streams
            sys.stdout = LogCapture(self.run_id, "info", "training", self._original_stdout)
            sys.stderr = LogCapture(self.run_id, "error", "training", self._original_stderr)

    def stop_capture(self):
        """Stop capturing and restore original streams."""
        with self._lock:
            if not self._is_capturing:
                return

            self._is_capturing = False

            # Restore original streams
            sys.stdout = self._original_stdout
            sys.stderr = self._original_stderr

    def log_message(self, message: str, level: str = "info", source: str = "agent"):
        """Manually log a message to the database."""
        self._store_log(message, level, source)

    def log_progress(self, epoch: int, total_epochs: int, batch: int, total_batches: int,
                    loss: float = None, accuracy: float = None):
        """Log training progress with throttling."""
        import time
        current_time = time.time()

        # Throttle progress updates
        if current_time - self._last_progress_time < self._progress_throttle_seconds:
            return

        self._last_progress_time = current_time

        # Create a concise progress message
        progress_pct = (batch / total_batches) * 100 if total_batches > 0 else 0
        epoch_info = f"Epoch {epoch}/{total_epochs}"
        batch_info = f"Batch {batch}/{total_batches} ({progress_pct:.1f}%)"

        parts = [epoch_info, batch_info]
        if loss is not None:
            parts.append(f"Loss: {loss:.4f}")
        if accuracy is not None:
            parts.append(f"Acc: {accuracy:.4f}")

        message = " | ".join(parts)
        self._store_log(message, "info", "training")

    def _store_log(self, message: str, level: str, source: str):
        """Store a log message to the database."""
        db = SessionLocal()
        try:
            timestamp = datetime.now(timezone.utc)
            log_entry = models.RunLog(
                run_id=self.run_id,
                timestamp=timestamp,
                level=level,
                source=source,
                message=message.strip()
            )
            db.add(log_entry)
            db.commit()

            # Broadcast log event via WebSocket
            try:
                log_event = {
                    "type": "run.log",
                    "run_id": self.run_id,
                    "timestamp": timestamp.isoformat(),
                    "level": level,
                    "source": source,
                    "message": message.strip()
                }
                # Schedule the broadcast safely
                self._safe_broadcast(log_event)
            except Exception as e:
                from shared.logging.config import get_logger
                logger = get_logger("agent.log_streamer")
                logger.debug(
                    "Failed to broadcast log event via WebSocket",
                    extra={"run_id": self.run_id, "error": str(e)}
                )

        except Exception as e:
            from shared.logging.config import get_logger
            logger = get_logger("agent.log_streamer")
            logger.error(
                "Failed to store log message to database",
                extra={"run_id": self.run_id, "level": level, "source": source, "error": str(e)}
            )
        finally:
            db.close()

    def _safe_broadcast(self, log_event: dict):
        """Safely broadcast log event to WebSocket clients."""
        try:
            import asyncio
            import threading

            # Check if we're in an async context
            try:
                loop = asyncio.get_running_loop()
                # We're in an async context, schedule the coroutine
                logs = [log_event]  # Wrap single log event in list for API compatibility
                loop.create_task(websocket_notifier.notify_run_logs(self.run_id, logs))
            except RuntimeError:
                # No running event loop, run in thread
                def run_broadcast():
                    try:
                        logs = [log_event]
                        asyncio.run(websocket_notifier.notify_run_logs(self.run_id, logs))
                    except Exception as e:
                        from shared.logging.config import get_logger
                        logger = get_logger("agent.log_streamer")
                        logger.debug(
                            "Failed to notify WebSocket in background thread",
                            extra={"run_id": self.run_id, "error": str(e)}
                        )

                thread = threading.Thread(target=run_broadcast, daemon=True)
                thread.start()
        except Exception as e:
            from shared.logging.config import get_logger
            logger = get_logger("agent.log_streamer")
            logger.debug(
                "Failed to safely broadcast log event",
                extra={"run_id": self.run_id, "error": str(e)}
            )


class LogCapture:
    """Custom stream that captures output and stores to database."""

    def __init__(self, run_id: str, level: str, source: str, original_stream):
        self.run_id = run_id
        self.level = level
        self.source = source
        self.original_stream = original_stream

    def write(self, text: str):
        """Write text to both original stream and database."""
        # Write to original stream for console output
        if self.original_stream:
            self.original_stream.write(text)
            self.original_stream.flush()

        # Filter out tqdm progress bar noise
        if self._should_log_message(text.strip()):
            self._store_log(text)

    def _should_log_message(self, message: str) -> bool:
        """Determine if a message should be logged to the database."""
        if not message:
            return False

        # Filter out tqdm progress bar updates and related noise
        tqdm_indicators = [
            "%|", "█", "▌", "▍", "▎", "▏", "▊", "▋",  # Progress bar characters
            "it/s", "s/it", "batch/s", "s/batch",      # Rate indicators
            "\r", "\x1b[",                             # Carriage returns and ANSI codes
        ]

        # Check if message contains tqdm indicators
        for indicator in tqdm_indicators:
            if indicator in message:
                return False

        # Filter out lines that are mostly whitespace or progress-like
        if len(message.strip()) < 3:
            return False

        # Filter out lines that look like tqdm postfix updates (key: value pairs)
        if ":" in message and len(message.split(":")) >= 2:
            parts = message.split(":")
            if len(parts) == 2 and all(len(p.strip()) < 20 for p in parts):
                # Looks like "loss: 0.1234" - likely tqdm postfix
                return False

        return True

    def flush(self):
        """Flush the original stream."""
        if self.original_stream:
            self.original_stream.flush()

    def _store_log(self, message: str):
        """Store a log message to the database."""
        db = SessionLocal()
        try:
            timestamp = datetime.now(timezone.utc)
            log_entry = models.RunLog(
                run_id=self.run_id,
                timestamp=timestamp,
                level=self.level,
                source=self.source,
                message=message.strip()
            )
            db.add(log_entry)
            db.commit()

            # Broadcast log event via WebSocket
            try:
                log_event = {
                    "type": "run.log",
                    "run_id": self.run_id,
                    "timestamp": timestamp.isoformat(),
                    "level": self.level,
                    "source": self.source,
                    "message": message.strip()
                }
                # Schedule the broadcast safely
                self._safe_broadcast(log_event)
            except Exception as e:
                from shared.logging.config import get_logger
                logger = get_logger("agent.log_streamer")
                logger.debug(
                    "Failed to broadcast log capture event via WebSocket",
                    extra={"run_id": self.run_id, "level": self.level, "source": self.source, "error": str(e)}
                )

        except Exception as e:
            from shared.logging.config import get_logger
            logger = get_logger("agent.log_streamer")
            logger.error(
                "Failed to store log capture message to database",
                extra={"run_id": self.run_id, "level": self.level, "source": self.source, "error": str(e)}
            )
        finally:
            db.close()

    def _safe_broadcast(self, log_event: dict):
        """Safely broadcast log event to WebSocket clients."""
        try:
            import asyncio
            import threading

            # Check if we're in an async context
            try:
                loop = asyncio.get_running_loop()
                # We're in an async context, schedule the coroutine
                logs = [log_event]  # Wrap single log event in list for API compatibility
                loop.create_task(websocket_notifier.notify_run_logs(self.run_id, logs))
            except RuntimeError:
                # No running event loop, run in thread
                def run_broadcast():
                    try:
                        logs = [log_event]
                        asyncio.run(websocket_notifier.notify_run_logs(self.run_id, logs))
                    except Exception as e:
                        from shared.logging.config import get_logger
                        logger = get_logger("agent.log_streamer")
                        logger.debug(
                            "Failed to notify WebSocket in log capture background thread",
                            extra={"run_id": self.run_id, "level": self.level, "source": self.source, "error": str(e)}
                        )

                thread = threading.Thread(target=run_broadcast, daemon=True)
                thread.start()
        except Exception as e:
            from shared.logging.config import get_logger
            logger = get_logger("agent.log_streamer")
            logger.debug(
                "Failed to safely broadcast log capture event",
                extra={"run_id": self.run_id, "level": self.level, "source": self.source, "error": str(e)}
            )
