from __future__ import annotations

import sys
import threading
from datetime import datetime, timezone
from io import StringIO
from typing import Optional, Callable

from dashboard.db import SessionLocal
from dashboard import models

# Import WebSocket manager for real-time updates (optional)
try:
    from dashboard.routers.ws import ws_manager
except ImportError:
    ws_manager = None


class LogStreamer:
    """Service for capturing and streaming training logs."""

    def __init__(self, run_id: str):
        self.run_id = run_id
        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        self._is_capturing = False
        self._lock = threading.Lock()

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

            # Broadcast log event via WebSocket if available
            if ws_manager:
                try:
                    import asyncio
                    log_event = {
                        "type": "run.log",
                        "run_id": self.run_id,
                        "timestamp": timestamp.isoformat(),
                        "level": level,
                        "source": source,
                        "message": message.strip()
                    }
                    # Schedule the broadcast
                    asyncio.create_task(ws_manager.broadcast_json(log_event, topic="runs"))
                except Exception:
                    # Don't let WebSocket errors break logging
                    pass

        except Exception:
            # Don't let logging errors break the training
            pass
        finally:
            db.close()


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

        # Store non-empty messages to database
        if text.strip():
            self._store_log(text)

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

            # Broadcast log event via WebSocket if available
            if ws_manager:
                try:
                    import asyncio
                    log_event = {
                        "type": "run.log",
                        "run_id": self.run_id,
                        "timestamp": timestamp.isoformat(),
                        "level": self.level,
                        "source": self.source,
                        "message": message.strip()
                    }
                    # Schedule the broadcast
                    asyncio.create_task(ws_manager.broadcast_json(log_event, topic="runs"))
                except Exception:
                    # Don't let WebSocket errors break logging
                    pass

        except Exception:
            # Don't let logging errors break the training
            pass
        finally:
            db.close()