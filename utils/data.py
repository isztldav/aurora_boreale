import os
from typing import Callable, Optional, Tuple, Any, List, Dict
import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import datasets
import random
from torchvision.datasets.folder import default_loader
from torchvision.io import decode_image

from collections import Counter

from .config import TrainConfig


def collate_fn(batch):
    """Simple collate function to stack images and labels.

    Args:
        batch: Sequence of ``(image_tensor, label_int)``.

    Returns:
        Tuple[torch.Tensor, torch.Tensor]: batched images and labels.
    """
    images, labels = zip(*batch)
    images = torch.stack(images, dim=0)
    labels = torch.tensor(labels, dtype=torch.long)
    return images, labels

def build_dataloaders(
    root: str,
    train_tfms,
    eval_tfms,
    cfg: TrainConfig
):
    """Create train/val/test dataloaders from a folder structure.

    Expects subfolders ``train``, ``val``, and optionally ``test`` under ``root``.
    """
    train_p = os.path.join(root, "train")
    val_p   = os.path.join(root, "val")
    test_p  = os.path.join(root, "test")

    train_dataset = datasets.ImageFolder(train_p, transform=train_tfms)

    val_dataset   = datasets.ImageFolder(val_p,   transform=eval_tfms)

    test_dataset  = datasets.ImageFolder(test_p,  transform=eval_tfms) if os.path.isdir(test_p) else None

    train_loader = DataLoader(train_dataset, batch_size=cfg.batch_size, shuffle=True,
                              num_workers=cfg.num_workers, pin_memory=True, collate_fn=collate_fn, prefetch_factor=cfg.prefetch_factor, persistent_workers=cfg.persistent_workers)
    
    val_loader = DataLoader(val_dataset, batch_size=cfg.batch_size, shuffle=False,
                            num_workers=cfg.num_workers, pin_memory=True, collate_fn=collate_fn, prefetch_factor=cfg.prefetch_factor, persistent_workers=cfg.persistent_workers)
    
    test_loader = None
    if test_dataset is not None:
        test_loader = DataLoader(test_dataset, batch_size=cfg.batch_size, shuffle=False,
                                num_workers=cfg.num_workers, pin_memory=True, collate_fn=collate_fn, prefetch_factor=cfg.prefetch_factor, persistent_workers=cfg.persistent_workers)
    return train_loader, val_loader, test_loader

def build_label_maps(train_dataset) -> Tuple[dict, dict]:
    """Build mapping dicts between class names and integer IDs."""
    label2id = {c: i for i, c in enumerate(train_dataset.classes)}
    id2label = {i: c for c, i in label2id.items()}
    return label2id, id2label
