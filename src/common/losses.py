"""Loss function utilities and implementations.

This module provides a unified interface for building loss functions
based on the registry configuration.
"""
from __future__ import annotations

import torch
from torch import nn
from typing import Dict, Any, Optional
import torch.nn.functional as F


class FocalLoss(nn.Module):
    """Focal Loss implementation for addressing class imbalance.

    Reference: Lin et al. "Focal Loss for Dense Object Detection" (2017)
    """

    def __init__(self, alpha: float = 1.0, gamma: float = 2.0, reduction: str = 'mean'):
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.reduction = reduction

    def forward(self, inputs: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        # Compute cross entropy
        ce_loss = F.cross_entropy(inputs, targets, reduction='none')

        # Compute p_t
        pt = torch.exp(-ce_loss)

        # Compute focal loss
        focal_loss = self.alpha * (1 - pt) ** self.gamma * ce_loss

        if self.reduction == 'mean':
            return focal_loss.mean()
        elif self.reduction == 'sum':
            return focal_loss.sum()
        else:
            return focal_loss


def build_loss_function(loss_name: str, loss_params: Optional[Dict[str, Any]] = None) -> nn.Module:
    """Build a loss function from registry configuration.

    Args:
        loss_name: Name of the loss function from the registry
        loss_params: Optional parameters for the loss function

    Returns:
        Initialized loss function module

    Raises:
        ValueError: If loss_name is not supported
    """
    loss_params = loss_params or {}

    if loss_name == 'cross_entropy':
        return nn.CrossEntropyLoss()

    elif loss_name == 'focal_loss':
        alpha = loss_params.get('alpha', 1.0)
        gamma = loss_params.get('gamma', 2.0)
        return FocalLoss(alpha=alpha, gamma=gamma)

    else:
        raise ValueError(f"Unsupported loss function: {loss_name}. "
                        f"Supported losses: cross_entropy, focal_loss")


def get_supported_losses() -> Dict[str, Dict[str, Any]]:
    """Get information about supported loss functions.

    Returns:
        Dictionary mapping loss names to their specifications
    """
    return {
        'cross_entropy': {
            'name': 'Cross Entropy',
            'description': 'Standard cross-entropy loss for multi-class classification',
            'parameters': [],
            'suitable_for': ['classification', 'multi-class']
        },
        'focal_loss': {
            'name': 'Focal Loss',
            'description': 'Focal loss for addressing class imbalance',
            'parameters': [
                {'name': 'alpha', 'type': 'float', 'default': 1.0, 'description': 'Weighting factor'},
                {'name': 'gamma', 'type': 'float', 'default': 2.0, 'description': 'Focusing parameter'}
            ],
            'suitable_for': ['classification', 'imbalanced']
        }
    }