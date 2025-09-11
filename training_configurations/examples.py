"""Example experiment configurations.

Edit or extend this list to define your own experiments. ``main.py`` will
pick them up and run each sequentially.
"""
from __future__ import annotations

from utils.config import TrainConfig


# Dataset root (update to your local path if needed)
ROOT = "/home/isztld/03_nanoCNN/datasets_ssd/GL/DataFolder"


# Example experiments
training_configurations = [
    # Example 1: ViT base, finetune, CE loss
    TrainConfig(
        freeze_backbone=False,
        model_suffix="",
        ckpt_dir="experiments_v2/checkpoints/DME",
        root=ROOT,
        run_name=None,
        model_flavour="google/vit-base-patch16-224",
        loss_name="CE",
        load_pretrained=True,
        batch_size=64,
        num_workers=8,
        prefetch_factor=2,
        epochs=50,
        lr=1e-3,
        weight_decay=0.05,
        warmup_ratio=0.05,
        seed=42,
        tb_root="experiments_v2/logs/DME",
        eval_topk=(),
    ),
    # Example 2: Freeze backbone, smaller batch
    TrainConfig(
        max_datapoints_per_class=3_000,
        model_suffix="",
        tb_root="experiments_v2/benchmarking/logs/DME",
        ckpt_dir="experiments_v2/benchmarking/checkpoints/DME",
        freeze_backbone=True,
        root=ROOT,
        run_name=None,
        model_flavour="iszt/RETFound_mae_meh",
        loss_name="CE",
        load_pretrained=True,
        batch_size=32,
        num_workers=8,
        prefetch_factor=2,
        epochs=50,
        lr=1e-3,
        weight_decay=0.05,
        warmup_ratio=0.05,
        seed=42,
        eval_topk=(),
    ),
]

