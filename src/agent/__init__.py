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
    from agent.server import create_app

    app = create_app(agent_id="...", gpu_index=0)
"""

# Note: No imports from server module to avoid circular imports when
# running as python -m agent.server

