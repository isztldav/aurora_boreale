"""Experiment utilities: naming helpers and run name management.

This module centralizes small helpers used to construct unique run names
and to keep experiment-related string handling in one place.
"""
from __future__ import annotations

import os
from utils.config import TrainConfig


def sanitize_name(s: str) -> str:
    """Return a filesystem-friendly string.

    Replaces slashes with dashes and spaces with underscores.
    """
    return s.replace("/", "-").replace(" ", "_")


def make_run_base(cfg: TrainConfig) -> str:
    """Compose a base run name from key config attributes.

    Example: "google-vit-base-patch16-224__CE__pretrained"
    """
    return (
        f"{sanitize_name(cfg.model_flavour)}__{cfg.loss_name}__"
        f"{'pretrained' if cfg.load_pretrained else 'scratch'}{cfg.model_suffix}"
    )


def unique_run_name(root_dir: str, base: str) -> str:
    """Create a unique run name under ``root_dir`` by appending a counter.

    If ``<root_dir>/<base>`` exists, returns ``<base>-v1`` (or -v2, ...)
    at the first available index.
    """
    candidate = base
    k = 1
    while os.path.exists(os.path.join(root_dir, candidate)):
        candidate = f"{base}-v{k}"
        k += 1
    return candidate

