import os
from typing import Callable, Optional, Tuple, Any, List, Dict
import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import datasets
import random
from torchvision.datasets.folder import default_loader
from torchvision.io import read_image, ImageReadMode

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

    def _apply_max_per_class(imagefolder_ds: datasets.ImageFolder, max_per_class_cfg):
        """Limit ImageFolder items to at most N per class, in-place.

        - If ``max_per_class_cfg`` is an int: same cap for all classes.
        - If it's a sequence: length must equal number of classes; caps applied per class index.
        """
        if imagefolder_ds is None:
            return

        num_classes = len(imagefolder_ds.classes)

        # Build per-class limits
        if isinstance(max_per_class_cfg, int):
            limits = [max_per_class_cfg] * num_classes
        else:
            # Treat as sequence
            try:
                limits = list(max_per_class_cfg)
            except TypeError:
                raise ValueError("cfg.max_datapoints_per_class must be int or a sequence")
            if len(limits) != num_classes:
                raise ValueError(
                    f"cfg.max_datapoints_per_class length {len(limits)} does not match number of labels {num_classes}"
                )

        # Get targets per sample
        if hasattr(imagefolder_ds, "targets") and len(getattr(imagefolder_ds, "targets", [])) == len(imagefolder_ds.samples):
            targets = list(imagefolder_ds.targets)  # type: ignore[attr-defined]
        else:
            targets = [y for _, y in imagefolder_ds.samples]

        # Indices grouped by class
        per_class_indices = [[] for _ in range(num_classes)]
        for i, y in enumerate(targets):
            per_class_indices[y].append(i)

        chosen = set()
        for cls_idx, idxs in enumerate(per_class_indices):
            lim = limits[cls_idx]
            if lim is None or len(idxs) <= lim:
                chosen.update(idxs)
            else:
                chosen.update(random.sample(idxs, lim))

        # Filter samples/targets preserving original order
        new_samples = [s for i, s in enumerate(imagefolder_ds.samples) if i in chosen]
        new_targets = [t for i, t in enumerate(targets) if i in chosen]
        imagefolder_ds.samples = new_samples
        imagefolder_ds.imgs = new_samples  # alias used by torchvision
        imagefolder_ds.targets = new_targets

    # Use a tensor-based loader to return CxHxW uint8 tensors (RGB)
    def _tensor_loader(path: str):
        return read_image(path, mode=ImageReadMode.RGB)

    train_dataset = datasets.ImageFolder(train_p, transform=train_tfms, loader=_tensor_loader)
    _apply_max_per_class(train_dataset, cfg.max_datapoints_per_class)

    val_dataset   = datasets.ImageFolder(val_p,   transform=eval_tfms, loader=_tensor_loader)
    _apply_max_per_class(val_dataset, cfg.max_datapoints_per_class)

    test_dataset  = datasets.ImageFolder(test_p,  transform=eval_tfms, loader=_tensor_loader) if os.path.isdir(test_p) else None
    if test_dataset is not None:
        _apply_max_per_class(test_dataset, cfg.max_datapoints_per_class)

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
