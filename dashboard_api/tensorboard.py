import os
import socket
import subprocess
import threading
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class TBServer:
    run_id: str
    logdir: str
    port: int
    process: subprocess.Popen


_servers: Dict[str, TBServer] = {}
_lock = threading.Lock()


def _find_free_port(start: int = 6006, end: int = 6999) -> int:
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("No free port found for TensorBoard")


def _is_running(proc: subprocess.Popen) -> bool:
    return proc.poll() is None


def get_or_start_tensorboard(run_id: str, logdir: str) -> str:
    """Ensure a TensorBoard server is running for ``run_id`` and return its base URL.

    Starts a background ``tensorboard`` process if needed, bound to localhost on a free port.
    """
    # Normalize logdir (must exist; TensorBoard can create but we keep it explicit)
    logdir = os.path.abspath(logdir)

    with _lock:
        existing: Optional[TBServer] = _servers.get(run_id)
        if existing and _is_running(existing.process) and existing.logdir == logdir:
            return f"http://127.0.0.1:{existing.port}"

        # If there is a stale server, clean it up
        if existing and not _is_running(existing.process):
            try:
                existing.process.terminate()
            except Exception:
                pass
            _servers.pop(run_id, None)

        port = _find_free_port()
        # Launch tensorboard pointing at the desired logdir
        # Use minimal reload interval to keep it responsive; bind only to localhost for safety.
        cmd = [
            "tensorboard",
            "--logdir",
            logdir,
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--reload_interval",
            "5",
        ]

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        _servers[run_id] = TBServer(run_id=run_id, logdir=logdir, port=port, process=proc)
        return f"http://127.0.0.1:{port}"

