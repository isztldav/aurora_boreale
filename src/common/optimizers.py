"""Optimizer utilities and builders.

This module provides a unified interface for building optimizers
based on the registry configuration.
"""
from __future__ import annotations

import torch
from torch.optim import Adam, AdamW
from typing import Dict, Any, Optional, List


def build_param_groups(module: torch.nn.Module, weight_decay: float) -> List[Dict[str, Any]]:
    """Build parameter groups to avoid weight decay on LayerNorm/bias.

    This is important for stability when training ViT/Swin transformers.

    Args:
        module: The model to create parameter groups for
        weight_decay: Weight decay coefficient for applicable parameters

    Returns:
        List of parameter groups with appropriate weight decay settings
    """
    decay_params, no_decay_params = [], []
    for name, param in module.named_parameters():
        if not param.requires_grad:
            continue
        # Do not apply weight decay on bias, LayerNorm/Norms, or 1D parameters
        if name.endswith("bias") or param.ndim == 1 or "norm" in name.lower() or "layernorm" in name.lower():
            no_decay_params.append(param)
        else:
            decay_params.append(param)
    return [
        {"params": decay_params, "weight_decay": weight_decay},
        {"params": no_decay_params, "weight_decay": 0.0},
    ]


def build_optimizer(
    optimizer_name: str,
    model: torch.nn.Module,
    lr: float,
    weight_decay: float = 0.0,
    optimizer_params: Optional[Dict[str, Any]] = None
) -> torch.optim.Optimizer:
    """Build an optimizer from registry configuration.

    Args:
        optimizer_name: Name of the optimizer from the registry
        model: The model to optimize
        lr: Learning rate
        weight_decay: Weight decay coefficient
        optimizer_params: Optional additional parameters for the optimizer

    Returns:
        Initialized optimizer

    Raises:
        ValueError: If optimizer_name is not supported
    """
    optimizer_params = optimizer_params or {}

    if optimizer_name == 'adamw':
        param_groups = build_param_groups(model, weight_decay)
        betas = optimizer_params.get('betas', [0.9, 0.999])
        eps = optimizer_params.get('eps', 1e-8)
        return AdamW(param_groups, lr=lr, betas=betas, eps=eps)

    elif optimizer_name == 'adam':
        # Preserve previous behavior: no weight decay when using Adam
        param_groups = build_param_groups(model, 0.0)
        betas = optimizer_params.get('betas', [0.9, 0.999])
        eps = optimizer_params.get('eps', 1e-8)
        return Adam(param_groups, lr=lr, betas=betas, eps=eps)

    else:
        raise ValueError(f"Unsupported optimizer: {optimizer_name}. "
                        f"Supported optimizers: adam, adamw")


def get_supported_optimizers() -> Dict[str, Dict[str, Any]]:
    """Get information about supported optimizers.

    Returns:
        Dictionary mapping optimizer names to their specifications
    """
    return {
        'adam': {
            'name': 'Adam',
            'description': 'Adam optimizer with momentum',
            'parameters': [
                {'name': 'lr', 'type': 'float', 'default': 1e-3, 'description': 'Learning rate'},
                {'name': 'betas', 'type': 'list', 'default': [0.9, 0.999], 'description': 'Momentum coefficients'},
                {'name': 'eps', 'type': 'float', 'default': 1e-8, 'description': 'Term for numerical stability'}
            ],
            'recommended_for': ['general', 'quick-experiments']
        },
        'adamw': {
            'name': 'AdamW',
            'description': 'Adam with weight decay correction',
            'parameters': [
                {'name': 'lr', 'type': 'float', 'default': 5e-4, 'description': 'Learning rate'},
                {'name': 'weight_decay', 'type': 'float', 'default': 0.05, 'description': 'Weight decay coefficient'},
                {'name': 'betas', 'type': 'list', 'default': [0.9, 0.999], 'description': 'Momentum coefficients'}
            ],
            'recommended_for': ['transformers', 'fine-tuning', 'production']
        }
    }