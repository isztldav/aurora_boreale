from __future__ import annotations

from typing import Optional

from .api import AgentAppFactory


def create_app(agent_id: Optional[str] = None, gpu_index: Optional[int] = None):
    """
    Create a FastAPI application for a training agent.

    This function maintains backward compatibility with the original API
    while using the new clean architecture internally.
    """
    return AgentAppFactory.create_app(agent_id, gpu_index)


def main():
    """Main entry point for the training agent server."""
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Training agent server")
    parser.add_argument("--agent-id", required=False, help="Agent UUID to serve jobs for (defaults to GPU-derived)")
    parser.add_argument("--gpu-index", type=int, default=None, help="GPU index this agent is bound to")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=7070)
    parser.add_argument("--reload", action="store_true", help="Auto-reload on code changes (dev only)")
    args = parser.parse_args()

    uvicorn.run(
        create_app(args.agent_id, args.gpu_index),
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_dirs=["/app/src"],
        log_config=None,  # Disable uvicorn's default logging config
        access_log=False  # Disable access logging to prevent conflicts
    )


if __name__ == "__main__":
    main()
