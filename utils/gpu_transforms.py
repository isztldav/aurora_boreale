"""GPU-batched data augmentation for training.

This module applies lightweight, geometric-only augmentations on GPU with Kornia
to avoid interfering with CPU-side normalization. If Kornia is not installed,
it falls back to an identity transform.
"""
from __future__ import annotations

import torch

try:
    import kornia.augmentation as KA  # type: ignore
    _HAS_KORNIA = True
except Exception:  # pragma: no cover - optional dependency
    KA = None  # type: ignore
    _HAS_KORNIA = False


class _Identity(torch.nn.Module):
    def forward(self, x: torch.Tensor) -> torch.Tensor:  # (B,C,H,W)
        return x


def build_gpu_train_augment() -> torch.nn.Module:
    """Return a GPU-side augmentation pipeline that preserves tensor size.

    Assumes input is already float32 and normalized (done on CPU pipeline).
    Applies only normalization-invariant geometric transforms.
    """
    if not _HAS_KORNIA:
        return _Identity()

    # Mild, size-preserving geometric jitter
    aug = torch.nn.Sequential(
        KA.RandomHorizontalFlip(p=0.5),
        KA.RandomAffine(degrees=10, translate=(0.05, 0.05), scale=(0.95, 1.05), shear=5, align_corners=False),
    )
    return aug

