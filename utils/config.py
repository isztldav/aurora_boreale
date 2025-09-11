from dataclasses import dataclass, asdict
from typing import Optional, Tuple, Any
import os
import json

@dataclass
class TrainConfig:
    root: str
    model_flavour: str
    loss_name: str
    batch_size: int = 256
    num_workers: int = 4
    prefetch_factor:int = 4
    persistent_workers:bool = False
    epochs: int = 10
    # Optimizer
    optimizer: str = "adam"  # one of: "adam", "adamw"
    lr: float = 1e-3
    weight_decay: float = 0.05
    max_grad_norm: float = 1.0
    warmup_ratio: float = 0.05
    grad_accum_steps: int = 1
    seed: int = 42
    #log_every: int = 100

    # HF model weights
    load_pretrained: bool = True

    # Logging
    run_name: Optional[str] = None
    tb_root: str = "runs"
    eval_topk: Tuple[int, ...] = (3, 5),
    model_suffix: str = ''
    
    # Checkpoints
    freeze_backbone: bool = False
    ckpt_dir: str = "checkpoints"
    monitor_metric: str = "val_acc@1"  # e.g., "val_loss", "val_acc@1", "val_auroc_macro"
    monitor_mode: str = "max"          # "max" for acc/AUC, "min" for loss
    save_per_epoch_checkpoint: bool = False

    # Dataset
    max_datapoints_per_class: int = 10_000


def _convert_jsonable(obj: Any):
    """Recursively convert tuples/sets to lists so JSON can serialize them."""
    if isinstance(obj, dict):
        return {k: _convert_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_convert_jsonable(v) for v in list(obj)]
    return obj

def save_train_config(cfg: TrainConfig, path: str) -> str:
    """
    Save a TrainConfig dataclass to JSON at `path`, overwriting if it exists.
    Returns the final path.
    """
    data = _convert_jsonable(asdict(cfg))
    dirpath = os.path.dirname(path)
    if dirpath:
        os.makedirs(dirpath, exist_ok=True)

    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=True)
        f.write("\n")
    os.replace(tmp_path, path)  # atomic on POSIX/NT
    return path

