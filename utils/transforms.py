"""Image transforms that operate on tensor inputs (CxHxW, uint8),
using HF processor metadata for size/normalization."""
from typing import Tuple
import torch
from torchvision import transforms
from torchvision.transforms import InterpolationMode
from transformers import AutoImageProcessor
import random

class RandomNoise:
    """Add random Gaussian noise with probability ``p``."""
    def __init__(self, mean=0.0, std=0.05, p=0.5):
        self.mean = mean
        self.std = std
        self.p = p

    def __call__(self, img):
        if torch.rand(1).item() < self.p:
            noise = torch.randn_like(img) * self.std + self.mean
            img = img + noise
            #img = torch.clamp(img, -1.0, 1.0)  # keep valid range
        return img


class RandomBlackSpots:
    """Draw random black rectangles to simulate occlusions/artefacts."""
    def __init__(self, processor_name:str, num_spots=5, max_size=0.2, p=0.5, fill=0):
        self.num_spots = num_spots
        self.max_size = max_size
        self.p = p

        processor = AutoImageProcessor.from_pretrained(processor_name)
        mean = torch.tensor(processor.image_mean)
        std = torch.tensor(processor.image_std)

        self.fill = ((fill-mean) / std).view(-1, 1, 1)  # shape [C,1,1]

    def __call__(self, img):
        if torch.rand(1).item() < self.p:
            _, H, W = img.shape
            for _ in range(random.randint(1, self.num_spots)):
                h = int(random.uniform(0.05, self.max_size) * H)
                w = int(random.uniform(0.05, self.max_size) * W)
                y = random.randint(0, H - h)
                x = random.randint(0, W - w)
                img[:, y:y+h, x:x+w] = self.fill
        return img

class RandomRotation:
    """Rotate the image by a random angle within ``degrees``."""
    def __init__(self, processor_name:str, degrees: int, fill=0):

        processor = AutoImageProcessor.from_pretrained(processor_name)
        mean = torch.tensor(processor.image_mean)
        std = torch.tensor(processor.image_std)

        self.fill = list(((fill-mean) / std).numpy()) #.view(-1, 1, 1)  # shape [C,1,1]
        #print(self.fill)

        self.randomRotation = transforms.RandomRotation(degrees=degrees, fill=self.fill)
    
    def __call__(self, img):
        return self.randomRotation(img)

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
