from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query


@dataclass
class Client:
    ws: WebSocket
    topic: str | None = None


class ConnectionManager:
    def __init__(self) -> None:
        self._clients: list[Client] = []

    async def connect(self, websocket: WebSocket, topic: str | None = None) -> Client:
        await websocket.accept()
        client = Client(ws=websocket, topic=topic)
        self._clients.append(client)
        return client

    def disconnect(self, client: Client) -> None:
        try:
            self._clients.remove(client)
        except ValueError:
            pass

    async def broadcast(self, message: str, topic: str | None = None) -> None:
        targets = list(self._clients)
        for c in targets:
            if topic and c.topic and c.topic != topic:
                continue
            try:
                await c.ws.send_text(message)
            except Exception:
                # Best-effort: drop broken connections
                self.disconnect(c)

    async def broadcast_json(self, payload: Any, topic: str | None = None) -> None:
        await self.broadcast(json.dumps(payload, default=str), topic=topic)


# Global manager instance, importable from other routers
ws_manager = ConnectionManager()

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, topic: str | None = Query(default=None)):
    """Accept WebSocket connections for optional topic (e.g., 'runs').

    Clients may receive server-originated events, and can optionally send 'ping'
    messages to keep the connection alive. Any non-'ping' message will be echoed
    back with a timestamp for basic diagnostics.
    """
    client = await ws_manager.connect(websocket, topic=topic)
    try:
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
            else:
                await websocket.send_text(json.dumps({
                    "type": "echo",
                    "received": msg,
                    "at": datetime.now(timezone.utc).isoformat() + "Z",
                }))
    except WebSocketDisconnect:
        ws_manager.disconnect(client)
