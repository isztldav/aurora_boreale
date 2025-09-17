from __future__ import annotations

import subprocess
import uuid
from typing import Optional

from ..domain import GPUInfo


class GPUDiscoveryService:
    """Service responsible for discovering and querying GPU information."""

    @staticmethod
    def discover_gpu(index: Optional[int] = None) -> GPUInfo:
        """
        Discover GPU information for the specified index.

        Args:
            index: GPU index to query. Defaults to 0 if None or invalid.

        Returns:
            GPUInfo object with discovered GPU details.
        """
        gpu_info = GPUInfo.empty(index if index is not None else 0)

        try:
            gpu_info = GPUDiscoveryService._discover_with_torch(gpu_info)
        except Exception as e:
            from shared.logging.config import get_logger
            logger = get_logger("agent.gpu_discovery")
            logger.warning(
                "Failed to discover GPU info with PyTorch, using fallback",
                extra={"gpu_index": index, "error": str(e)}
            )

        return gpu_info

    @staticmethod
    def _discover_with_torch(gpu_info: GPUInfo) -> GPUInfo:
        """Discover GPU info using PyTorch CUDA interface."""
        import torch

        if not torch.cuda.is_available():
            return gpu_info

        device_count = torch.cuda.device_count()
        idx = gpu_info.index

        if idx < 0 or idx >= device_count:
            idx = 0
            gpu_info.index = idx

        props = torch.cuda.get_device_properties(idx)

        gpu_info.name = getattr(props, "name", None)

        # Convert total memory from bytes to MB
        total = getattr(props, "total_memory", None)
        if total is not None:
            gpu_info.total_mem_mb = int(total // (1024 * 1024))

        # Build compute capability string
        major = getattr(props, "major", None)
        minor = getattr(props, "minor", None)
        if major is not None and minor is not None:
            gpu_info.compute_capability = f"{major}.{minor}"

        # Try to get GPU UUID
        gpu_info.uuid = GPUDiscoveryService._get_gpu_uuid(props, idx, gpu_info)

        return gpu_info

    @staticmethod
    def _get_gpu_uuid(props, idx: int, gpu_info: GPUInfo) -> Optional[str]:
        """
        Get GPU UUID, trying multiple methods.

        Priority:
        1. PyTorch props.uuid (newer versions)
        2. nvidia-smi query
        3. Deterministic fallback based on hardware specs
        """
        # Try PyTorch UUID first
        torch_uuid = getattr(props, "uuid", None)
        if torch_uuid:
            return str(torch_uuid)

        # Try nvidia-smi
        smi_uuid = GPUDiscoveryService._query_nvidia_smi_uuid(idx)
        if smi_uuid:
            return smi_uuid

        # Deterministic fallback
        return GPUDiscoveryService._generate_fallback_uuid(gpu_info)

    @staticmethod
    def _query_nvidia_smi_uuid(gpu_index: int) -> Optional[str]:
        """Query GPU UUID using nvidia-smi."""
        try:
            result = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=uuid",
                    "--format=csv,noheader",
                    f"-i={gpu_index}",
                ],
                capture_output=True,
                text=True,
                timeout=2.0,
                check=True,
            )
            uuid_str = result.stdout.strip().splitlines()[0].strip()
            return uuid_str if uuid_str else None
        except Exception as e:
            from shared.logging.config import get_logger
            logger = get_logger("agent.gpu_discovery")
            logger.debug(
                "Failed to query GPU UUID via nvidia-smi",
                extra={"gpu_index": gpu_index, "error": str(e)}
            )
            return None

    @staticmethod
    def _generate_fallback_uuid(gpu_info: GPUInfo) -> Optional[str]:
        """Generate a deterministic UUID based on GPU hardware specs."""
        if not (gpu_info.name and gpu_info.compute_capability and gpu_info.total_mem_mb):
            return None

        hardware_signature = f"{gpu_info.name}|{gpu_info.compute_capability}|{gpu_info.total_mem_mb}"
        return f"FAKEGPU-{uuid.uuid5(uuid.NAMESPACE_DNS, hardware_signature)}"