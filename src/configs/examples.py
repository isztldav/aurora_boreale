"""Example experiment configurations.

Edit or extend this list to define your own experiments. ``main.py`` will
pick them up and run each sequentially.
"""
from __future__ import annotations

from common.config import TrainConfig
import torch

# Dataset root (update to your local path if needed)
DME_root = '/home/isztld/03_nanoCNN/datasets_ssd/DME/DataFolder'
DR_root = '/home/isztld/03_nanoCNN/datasets_ssd/DR/DataFolder'
GL_root = '/home/isztld/03_nanoCNN/datasets_ssd/GL/DataFolder'
OCT_root = '/home/isztld/03_nanoCNN/datasets_ssd/OCT/DataFolder'


def _uniform_cfg(
    dataset_name: str,
    root: str,
    model_flavour: str,
    *,
    pretrained: bool,
    lr: float,
    batch_size: int = 64,
    effective_batch: int = 256,
):
    """Create a uniform TrainConfig tuned for publication-grade comparability.

    - AdamW + cosine schedule with warmup
    - Consistent effective batch size via grad accumulation
    - Mixed precision (bfloat16) and gradient clipping for stability
    - Standardized logging and checkpoint paths per dataset
    """
    grad_accum = max(1, effective_batch // max(1, batch_size))
    return TrainConfig(
        # Data
        root=root,
        batch_size=batch_size,
        num_workers=8,
        prefetch_factor=4,
        persistent_workers=True,

        # Model/Training
        model_flavour=model_flavour,
        loss_name='CE',
        load_pretrained=pretrained,
        freeze_backbone=False,
        optimizer='adamw',
        lr=lr,
        weight_decay=0.05,
        warmup_ratio=0.1,
        max_grad_norm=1.0,
        grad_accum_steps=grad_accum,
        epochs=100,
        autocast_dtype=torch.bfloat16,
        seed=42,

        # Logging/Checkpoints
        run_name=None,
        tb_root=f"experiments/logs/{dataset_name}",
        ckpt_dir=f"experiments/checkpoints/{dataset_name}",
        # Leave top-k empty to be robust across binary/3+ class tasks
        eval_topk=(),
        model_suffix='',
    )


# Per-model learning rate suggestions for finetune vs. from-scratch
_MODEL_LRS = {
    'google/vit-base-patch16-224': {True: 3e-4, False: 5e-4},
    'facebook/dinov2-small-imagenet1k-1-layer': {True: 3e-4, False: 5e-4},
    'facebook/dinov2-with-registers-base': {True: 2e-4, False: 4e-4},
    'microsoft/swin-tiny-patch4-window7-224': {True: 5e-4, False: 5e-4},
    'microsoft/swinv2-tiny-patch4-window8-256': {True: 4e-4, False: 5e-4},
    'facebook/convnextv2-tiny-1k-224': {True: 1e-3, False: 1e-3},
}


def _make_dataset_configs(dataset_name: str, root: str):
    cfgs = []
    for model in _MODEL_LRS.keys():
        for pretrained in (False, True):
            lr = _MODEL_LRS[model][pretrained]
            # Keep some headroom for 256px models (tiny variants are usually fine)
            bs = 64
            if model.endswith('-256'):
                bs = 48  # effective batch kept constant via grad accumulation
            cfgs.append(
                _uniform_cfg(
                    dataset_name=dataset_name,
                    root=root,
                    model_flavour=model,
                    pretrained=pretrained,
                    lr=lr,
                    batch_size=bs,
                    effective_batch=256,
                )
            )
    return cfgs


training_configurations = [
    # DME
    *_make_dataset_configs('DME', DME_root),

    # DR
    *_make_dataset_configs('DR', DR_root),

    # GL
    *_make_dataset_configs('GL', GL_root),

    # OCT
    *_make_dataset_configs('OCT', OCT_root),
]
