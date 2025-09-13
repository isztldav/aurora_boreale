"""Image transforms that operate on tensor inputs (CxHxW, uint8),
using HF processor metadata for size/normalization."""
from typing import Tuple
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

def build_transforms(model_flavour: str) -> Tuple[transforms.Compose, transforms.Compose]:
    """Return train/eval transforms for tensor inputs.

    Expects input images as CxHxW uint8 tensors (from torchvision.io.read_image)."""
    processor = AutoImageProcessor.from_pretrained(model_flavour, use_fast=True)
    size = _get_target_image_size(processor)
    mean = processor.image_mean
    std = processor.image_std

    train_tfms = transforms.Compose([
        transforms.Resize(size, interpolation=InterpolationMode.BILINEAR),
        transforms.CenterCrop(size),
        transforms.ConvertImageDtype(torch.float32),
        transforms.Normalize(mean=mean, std=std),
    ])

    eval_tfms = transforms.Compose([
        transforms.Resize(size, interpolation=InterpolationMode.BILINEAR),
        transforms.CenterCrop(size),
        transforms.ConvertImageDtype(torch.float32),
        transforms.Normalize(mean=mean, std=std),
    ])
    return train_tfms, eval_tfms
