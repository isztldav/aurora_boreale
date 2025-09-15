from __future__ import annotations

import asyncio
import os
import socket
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI

from dashboard.db import init_db

from ..domain import AgentConfig, AgentStatus
from ..services import GPUDiscoveryService, AgentManager
from ..repositories import AgentRepository


class AgentAppFactory:
    """Factory for creating FastAPI applications for training agents."""

    @staticmethod
    def create_app(
        agent_id: Optional[str] = None,
        gpu_index: Optional[int] = None
    ) -> FastAPI:
        """
        Create a FastAPI application for a training agent.

        Args:
            agent_id: Override agent ID (defaults to GPU-derived UUID)
            gpu_index: GPU index for this agent (defaults to env var or 0)

        Returns:
            Configured FastAPI application
        """
        # Resolve parameters from environment if not provided
        effective_agent_id, gpu_info = AgentAppFactory._resolve_agent_identity(
            agent_id, gpu_index
        )

        # Create agent configuration
        agent_config = AgentConfig(agent_id=effective_agent_id)

        # Set CUDA device for this process
        AgentAppFactory._configure_cuda_environment(gpu_info.index)

        # Create agent manager
        agent_manager = AgentManager(agent_config)

        # Create repositories
        agent_repository = AgentRepository()

        print(
            f"[app_factory] Creating agent app: agent_id={effective_agent_id} "
            f"host={socket.gethostname()} gpu_index={gpu_info.index} "
            f"gpu_name={gpu_info.name}"
        )

        @asynccontextmanager
        async def lifespan(app: FastAPI):
            """FastAPI lifespan handler for startup/shutdown."""
            # Startup
            worker_task, heartbeat_task = await AgentAppFactory._startup_sequence(
                effective_agent_id, gpu_info, agent_repository, agent_manager
            )

            # Store tasks on app state
            app.state.worker = worker_task
            app.state.heartbeat = heartbeat_task

            try:
                yield
            finally:
                # Shutdown
                await AgentAppFactory._shutdown_sequence(agent_manager, app)

        # Create FastAPI app
        app = FastAPI(
            title="Training Agent",
            version="0.1.0",
            lifespan=lifespan
        )

        # Add routes
        AgentAppFactory._register_routes(app, agent_manager)

        return app

    @staticmethod
    def _resolve_agent_identity(
        agent_id: Optional[str],
        gpu_index: Optional[int]
    ) -> tuple[str, any]:
        """Resolve effective agent ID and GPU information."""
        # Get agent_id from env if not provided
        if agent_id is None:
            agent_id = os.environ.get("AGENT_ID")

        # Get gpu_index from env if not provided
        if gpu_index is None:
            env_gpu = os.environ.get("GPU_INDEX")
            try:
                gpu_index = int(env_gpu) if env_gpu is not None else None
            except ValueError:
                gpu_index = None

        # Discover GPU information
        gpu_info = GPUDiscoveryService.discover_gpu(gpu_index)
        host = socket.gethostname()

        # Generate stable agent ID if not provided
        if agent_id is None:
            if gpu_info.uuid:
                derived_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"gpu:{gpu_info.uuid}")
            else:
                derived_uuid = uuid.uuid5(
                    uuid.NAMESPACE_DNS,
                    f"host:{host}:gpu-idx:{gpu_info.index}"
                )
            agent_id = str(derived_uuid)

        return agent_id, gpu_info

    @staticmethod
    def _configure_cuda_environment(gpu_index: int) -> None:
        """Configure CUDA environment for this process."""
        try:
            os.environ["CUDA_VISIBLE_DEVICES"] = str(gpu_index)
        except Exception:
            pass

    @staticmethod
    async def _startup_sequence(
        agent_id: str,
        gpu_info: any,
        agent_repository: AgentRepository,
        agent_manager: AgentManager
    ) -> tuple[asyncio.Task, asyncio.Task]:
        """Execute startup sequence and return background tasks."""
        # Initialize database
        init_db()

        # Register agent and GPU
        agent_uuid = uuid.UUID(agent_id)
        host = socket.gethostname()

        agent_name = f"gpu:{gpu_info.uuid or 'idx-'+str(gpu_info.index)}"
        agent = agent_repository.upsert_agent(agent_uuid, agent_name, host, gpu_info)
        print(f"[app_factory] Registered agent id={agent.id} name={agent.name} host={agent.host}")

        gpu = agent_repository.upsert_gpu(agent_uuid, gpu_info)
        print(
            f"[app_factory] Upserted GPU index={gpu.index} uuid={gpu.uuid} "
            f"name={gpu.name} mem={gpu.total_mem_mb}MB"
        )

        # Start background tasks
        worker_task = asyncio.create_task(agent_manager.run_forever())

        heartbeat_task = asyncio.create_task(
            AgentAppFactory._heartbeat_loop(agent_uuid, gpu_info.index, agent_repository)
        )

        return worker_task, heartbeat_task

    @staticmethod
    async def _shutdown_sequence(agent_manager: AgentManager, app: FastAPI) -> None:
        """Execute shutdown sequence."""
        # Stop agent manager
        agent_manager.stop()

        # Cancel and await background tasks
        for task_name in ["worker", "heartbeat"]:
            task = getattr(app.state, task_name, None)
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                except Exception:
                    pass

    @staticmethod
    async def _heartbeat_loop(
        agent_id: uuid.UUID,
        gpu_index: int,
        agent_repository: AgentRepository
    ) -> None:
        """Background task to send periodic heartbeats."""
        try:
            while True:
                await asyncio.sleep(15)  # Heartbeat interval
                agent_repository.update_heartbeat(agent_id)
                agent_repository.update_gpu_heartbeat(agent_id, gpu_index)
        except asyncio.CancelledError:
            pass

    @staticmethod
    def _register_routes(app: FastAPI, agent_manager: AgentManager) -> None:
        """Register HTTP routes on the FastAPI app."""

        @app.get("/health")
        def health():
            return {"ok": True}

        @app.get("/status", response_model=AgentStatus)
        def status():
            return agent_manager.get_status()

        @app.post("/halt")
        def halt():
            agent_manager.request_halt()
            return {"ok": True}