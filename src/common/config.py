from dataclasses import dataclass, asdict
from typing import Optional, Tuple, Any, Union, Iterable, Dict
import os
import json
import torch

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
    autocast_dtype: torch.dtype = torch.bfloat16
    #log_every: int = 100

    # HF model weights
    load_pretrained: bool = True

    # Logging
    run_name: Optional[str] = None
    tb_root: str = "runs"
    eval_topk: Tuple[int, ...] = (3, 5)
    model_suffix: str = ''
    
    # Checkpoints
    freeze_backbone: bool = False
    ckpt_dir: str = "checkpoints"
    monitor_metric: str = "val_acc@1"  # e.g., "val_loss", "val_acc@1", "val_auroc_macro"
    monitor_mode: str = "max"          # "max" for acc/AUC, "min" for loss
    save_per_epoch_checkpoint: bool = False

    # Dataset
    max_datapoints_per_class: Union[int, Iterable] = 10_000

    # Optional GPU-batched augmentations (Kornia) applied on training batches.
    # Provide a JSON-serializable spec, e.g. {"preset": "cfp_dr_v1"} or
    # {"ops": [{"name": "RandomHorizontalFlip", "p": 0.5}, ...]}
    gpu_batch_aug: Optional[Dict[str, Any]] = None

    # Optional CPU-side color jitter (pre-normalization), applied on training only.
    # Example: {"preset": "cfp_color_v1"} or {"params": {"brightness": 0.15, "contrast": 0.15, "saturation": 0.1, "hue": 0.02}, "p": 0.8}
    cpu_color_jitter: Optional[Dict[str, Any]] = None


def _convert_jsonable(obj: Any):
    """Recursively convert objects so JSON can serialize them.

    - Containers -> same type with converted elements
    - torch.dtype -> string (e.g., "torch.bfloat16")
    """
    if isinstance(obj, dict):
        return {k: _convert_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_convert_jsonable(v) for v in list(obj)]
    # Handle torch dtype
    try:
        import torch as _torch  # local import to avoid cycles
        if isinstance(obj, _torch.dtype):
            return str(obj)
    except Exception:
        pass
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
