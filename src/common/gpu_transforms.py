"""GPU-batched data augmentation for training.

This module applies lightweight, geometric-only augmentations on GPU with Kornia
to avoid interfering with CPU-side normalization. If Kornia is not installed,
it falls back to an identity transform.
"""
from __future__ import annotations

from typing import Optional, Dict, Any, List

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


def _build_from_preset(name: str) -> torch.nn.Module:
    """Known-good augmentation presets.

    These are size-preserving and geometric only to avoid conflicting with
    CPU-side normalization. Suitable for color fundus photographs (CFP).
    """
    lname = (name or "").lower()
    if lname in {"cfp_dr_v1", "fundus_geometric_v1"}:
        return torch.nn.Sequential(
            KA.RandomHorizontalFlip(p=0.5),
            KA.RandomAffine(
                degrees=12,
                translate=(0.04, 0.04),
                scale=(0.95, 1.05),
                shear=5,
                align_corners=False,
            ),
        )
    # Fallback: identity
    return _Identity()


def _build_from_ops(ops: List[Dict[str, Any]]) -> torch.nn.Module:
    """Construct a Sequential from a list of op dicts.

    Allowed names are a safe subset of Kornia augmentations that preserve size
    and don't alter color post-normalization.
    """
    if not ops:
        return _Identity()

    allowed = {
        "RandomHorizontalFlip": KA.RandomHorizontalFlip,
        "RandomVerticalFlip": KA.RandomVerticalFlip,
        "RandomRotation": KA.RandomRotation,
        "RandomAffine": KA.RandomAffine,
        "RandomPerspective": KA.RandomPerspective,
        # Avoid color/intensity jitter here since inputs are normalized
    }
    layers = []
    for spec in ops:
        if not isinstance(spec, dict) or "name" not in spec:
            continue
        name = str(spec["name"])  # type: ignore
        params = {k: v for k, v in spec.items() if k != "name"}
        if name not in allowed:
            # silently skip unknown ops for robustness
            continue
        layer_cls = allowed[name]
        try:
            layer = layer_cls(**params)
        except Exception:
            # skip malformed parameters
            continue
        layers.append(layer)
    if not layers:
        return _Identity()
    return torch.nn.Sequential(*layers)


def build_gpu_train_augment(spec: Optional[Dict[str, Any]] = None) -> torch.nn.Module:
    """Return a GPU-side augmentation pipeline from a spec/preset.

    - If Kornia is unavailable or ``spec`` is None/empty, returns identity.
    - Spec may be {"preset": "cfp_dr_v1"} or {"ops": [{"name": "Random...", ...}, ...]}
    - Now validates against the centralized registry

    Notes: Assumes input is already float32 and normalized on CPU; therefore
    we intentionally restrict to geometric-only operations here.
    """
    if not _HAS_KORNIA or not spec:
        return _Identity()

    # Validate spec against registry
    is_valid, errors = validate_gpu_augmentation_spec(spec)
    if not is_valid:
        print(f"[gpu_transforms] Invalid augmentation spec: {errors}")
        return _Identity()

    # Preset takes precedence if provided
    preset = spec.get("preset") if isinstance(spec, dict) else None
    if isinstance(preset, str) and preset:
        return _build_from_preset(preset)

    # Otherwise, attempt to build from explicit ops list
    if isinstance(spec, dict) and isinstance(spec.get("ops"), list):
        return _build_from_ops(spec["ops"])  # type: ignore[index]

    return _Identity()


def get_supported_transforms() -> Dict[str, Any]:
    """Get all supported GPU transforms for UI consumption."""
    return gpu_transforms.to_json()


def get_available_presets() -> Dict[str, Any]:
    """Get all available GPU augmentation presets for UI consumption."""
    return gpu_presets.to_json()
