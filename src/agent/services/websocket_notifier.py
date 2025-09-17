"""WebSocket notification service for sending updates to the dashboard."""

import os
import json
from typing import Dict, Any, Optional
import asyncio
import aiohttp
from shared.database import models


class WebSocketNotifier:
    """Service for notifying the dashboard about agent events via HTTP API."""

    def __init__(self):
        # Get dashboard URL from environment
        self.dashboard_url = os.environ.get("DASHBOARD_URL", "http://localhost:8000")
        self.enabled = True

    async def notify_run_update(self, run: models.Run) -> None:
        """Notify dashboard about run state update."""
        if not self.enabled:
            return

        try:
            payload = {
                "type": "run.updated",
                "run": self._serialize_run(run),
            }

            await self._send_notification("runs", payload)
        except Exception as e:
            print(f"[websocket_notifier] Failed to notify run update: {e}")

    async def notify_run_logs(self, run_id: str, logs: list) -> None:
        """Notify dashboard about new run logs."""
        if not self.enabled:
            return

        try:
            payload = {
                "type": "run.logs",
                "run_id": run_id,
                "logs": logs,
            }

            await self._send_notification("runs", payload)
        except Exception as e:
            print(f"[websocket_notifier] Failed to notify run logs: {e}")

    async def _send_notification(self, topic: str, payload: Dict[str, Any]) -> None:
        """Send notification to dashboard via HTTP API."""
        url = f"{self.dashboard_url}/api/v1/ws/broadcast"

        request_payload = {
            "topic": topic,
            "payload": payload
        }

        timeout = aiohttp.ClientTimeout(total=5.0)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json=request_payload) as response:
                if response.status != 200:
                    text = await response.text()
                    print(f"[websocket_notifier] Dashboard notification failed: {response.status} {text}")

    def _serialize_run(self, run: models.Run) -> Dict[str, Any]:
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
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "best_metric": run.best_metric,
            "current_epoch": run.current_epoch,
            "total_epochs": run.total_epochs,
            "agent_id": str(run.agent_id) if run.agent_id else None,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "updated_at": run.updated_at.isoformat() if run.updated_at else None,
        }


# Global notifier instance
websocket_notifier = WebSocketNotifier()