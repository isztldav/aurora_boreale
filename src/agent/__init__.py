"""
Training Agent Package

Provides a clean, modular architecture for GPU training agents that execute
ML training jobs from the dashboard queue.

Architecture:
- domain: Core data types and business models
- services: Business logic and core services
- repositories: Data access layer
- api: HTTP API and application factory

Usage:
    from agent import create_app

    app = create_app(agent_id="...", gpu_index=0)
"""

from .server import create_app

__all__ = ["create_app"]

