"""Image transforms that operate on tensor inputs (CxHxW, uint8),
using HF processor metadata for size/normalization."""
from typing import Tuple, Optional, Dict, Any
import torch
from torchvision import transforms
from torchvision.transforms import InterpolationMode
from transformers import AutoImageProcessor

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
    """
    if not spec:
        return None

    p = float(spec.get("p", 0.8)) if isinstance(spec, dict) else 0.8
    if isinstance(spec, dict) and isinstance(spec.get("preset"), str):
        # Mild, CFP-friendly jitter
        params = dict(brightness=0.15, contrast=0.15, saturation=0.10, hue=0.02)
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
