from __future__ import annotations

import os


def sanitize_name(s: str) -> str:
    return s.replace("/", "-").replace(" ", "_")


def resolve_run_name(cfg_json: dict) -> str:
    """Mimic utils.experiments.make_run_base + unique suffix absent.

    For dashboard preview and creation we compose a base name. Uniqueness is
    not enforced at filesystem level here; the training code will ensure it
    when writing logs.
    """
    model = sanitize_name(cfg_json.get("model_flavour", "model"))
    loss = cfg_json.get("loss_name", "loss")
    init = "pretrained" if cfg_json.get("load_pretrained", True) else "scratch"
    suffix = cfg_json.get("model_suffix", "")
    base = f"{model}__{loss}__{init}{suffix}"
    return base

