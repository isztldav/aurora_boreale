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
    import os

    parser = argparse.ArgumentParser(description="Training agent server")
    parser.add_argument("--agent-id", required=False, help="Agent UUID to serve jobs for (defaults to GPU-derived)")
    parser.add_argument("--gpu-index", type=int, default=None, help="GPU index this agent is bound to")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=7070)
    parser.add_argument("--reload", action="store_true", help="Auto-reload on code changes (dev only)")
    args = parser.parse_args()

    # Determine if we're running in development mode
    is_development = os.getenv("ENVIRONMENT") == "development" or args.reload

    uvicorn_config = {
        "host": args.host,
        "port": args.port,
        "log_config": None,  # Disable uvicorn's default logging config
        "access_log": True   # Keep access logging but route through our system
    }

    # Only add reload config in development mode
    if is_development and args.reload:
        uvicorn_config.update({
            "reload": True,
            "reload_dirs": ["/app/src"]
        })

    uvicorn.run(
        create_app(args.agent_id, args.gpu_index),
        **uvicorn_config
    )


if __name__ == "__main__":
    main()
