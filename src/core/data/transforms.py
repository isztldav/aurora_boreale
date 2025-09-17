"""Image transforms that operate on tensor inputs (CxHxW, uint8),
using HF processor metadata for size/normalization.

Now uses the centralized registry system for color jitter validation.
"""
from typing import Tuple, Optional, Dict, Any
import torch
from torchvision import transforms
from torchvision.transforms import InterpolationMode
from transformers import AutoImageProcessor
from ..utils.registry import cpu_color_presets, validate_cpu_color_jitter_spec

def _get_target_image_size(processor: AutoImageProcessor) -> int:
    size = getattr(processor, "size", None)
    if isinstance(size, dict):
        if "shortest_edge" in size:
            return int(size["shortest_edge"])  # common for processors
        if "height" in size and "width" in size and int(size["height"]) == int(size["width"]):
            return int(size["height"])
    if isinstance(size, int):
        return int(size)
    return 224

def _build_color_jitter_from_spec(spec: Optional[Dict[str, Any]]):
    """Return a torchvision RandomApply(ColorJitter) from a spec or None.

    Spec forms:
    - {"preset": "cfp_color_v1", "p": 0.8}
    - {"params": {brightness, contrast, saturation, hue}, "p": 0.8}

    Now validates against the centralized registry.
    """
    if not spec:
        return None

    # Validate spec against registry
    is_valid, errors = validate_cpu_color_jitter_spec(spec)
    if not is_valid:
        print(f"[transforms] Invalid color jitter spec: {errors}")
        return None

    p = float(spec.get("p", 0.8)) if isinstance(spec, dict) else 0.8

    if isinstance(spec, dict) and isinstance(spec.get("preset"), str):
        # Get parameters from preset
        preset_name = spec["preset"]
        preset_spec = cpu_color_presets.get(preset_name)
        if not preset_spec:
            return None

        preset_config = preset_spec.config
        params = dict(preset_config.get("params", {}))
        # Use preset probability if not overridden
        if "p" not in spec:
            p = float(preset_config.get("p", 0.8))

    elif isinstance(spec, dict) and isinstance(spec.get("params"), dict):
        params = dict(spec["params"])  # type: ignore[index]
    else:
        return None

    try:
        cj = transforms.ColorJitter(**params)
    except Exception:
        return None
    return transforms.RandomApply([cj], p=p)


def build_transforms(model_flavour: str, train_color_jitter_spec: Optional[Dict[str, Any]] = None) -> Tuple[transforms.Compose, transforms.Compose]:
    """Return train/eval transforms for tensor inputs.

    Expects input images as CxHxW uint8 tensors (from torchvision.io.read_image)."""
    processor = AutoImageProcessor.from_pretrained(model_flavour, use_fast=True)
    size = _get_target_image_size(processor)
    mean = processor.image_mean
    std = processor.image_std

    color_jitter = _build_color_jitter_from_spec(train_color_jitter_spec)

    train_ops = [
        transforms.Resize(size, interpolation=InterpolationMode.BILINEAR),
        transforms.CenterCrop(size),
        transforms.ConvertImageDtype(torch.float32),
    ]
    if color_jitter is not None:
        train_ops.append(color_jitter)
    train_ops.append(transforms.Normalize(mean=mean, std=std))
    train_tfms = transforms.Compose(train_ops)

    eval_tfms = transforms.Compose([
        transforms.Resize(size, interpolation=InterpolationMode.BILINEAR),
        transforms.CenterCrop(size),
        transforms.ConvertImageDtype(torch.float32),
        transforms.Normalize(mean=mean, std=std),
    ])
    return train_tfms, eval_tfms


def get_available_color_presets() -> Dict[str, Any]:
    """Get all available CPU color jitter presets for UI consumption."""
    return cpu_color_presets.to_json()
