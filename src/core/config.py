from dataclasses import dataclass, asdict
from typing import Optional, Tuple, Any, Union, Iterable, Dict, List
import os
import json
import torch
from pydantic import BaseModel, Field, field_validator

class TrainConfig(BaseModel):
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
    autocast_dtype: str = "torch.bfloat16"
    #log_every: int = 100

    # HF model weights
    load_pretrained: bool = True
    hf_token: Optional[bool] = False  # Whether HuggingFace token is required (token retrieved from model registry)

    # Logging
    run_name: Optional[str] = None
    tb_root: str = "runs"
    eval_topk: List[int] = Field(default_factory=lambda: [3, 5])
    model_suffix: str = ''
    
    # Checkpoints
    freeze_backbone: bool = False
    ckpt_dir: str = "checkpoints"
    monitor_metric: str = "val_acc@1"  # e.g., "val_loss", "val_acc@1", "val_auroc_macro"
    monitor_mode: str = "max"          # "max" for acc/AUC, "min" for loss
    save_per_epoch_checkpoint: bool = False

    # Dataset
    max_datapoints_per_class: Union[int, List[int]] = 10_000

    # Optional GPU-batched augmentations (Kornia) applied on training batches.
    # Provide a JSON-serializable spec, e.g. {"preset": "cfp_dr_v1"} or
    # {"ops": [{"name": "RandomHorizontalFlip", "p": 0.5}, ...]}
    gpu_batch_aug: Optional[Dict[str, Any]] = None

    # Optional CPU-side color jitter (pre-normalization), applied on training only.
    # Example: {"preset": "cfp_color_v1"} or {"params": {"brightness": 0.15, "contrast": 0.15, "saturation": 0.1, "hue": 0.02}, "p": 0.8}
    cpu_color_jitter: Optional[Dict[str, Any]] = None

    # Dataset labels - populated during training run
    class_labels: Optional[List[str]] = Field(default=None)  # List of class names in order
    label2id: Optional[Dict[str, int]] = Field(default=None)  # Mapping from class name to ID
    id2label: Optional[Dict[int, str]] = Field(default=None)  # Mapping from ID to class name

    @field_validator('autocast_dtype')
    @classmethod
    def validate_autocast_dtype(cls, v):
        """Validate and convert autocast_dtype string to torch.dtype if needed."""
        if isinstance(v, str):
            if v.startswith('torch.'):
                dtype_name = v.replace('torch.', '')
                if hasattr(torch, dtype_name):
                    return v  # Keep as string for JSON serialization
            return v
        elif hasattr(v, '__module__') and v.__module__ == 'torch':
            return str(v)  # Convert torch.dtype to string
        return v

    def get_torch_dtype(self) -> torch.dtype:
        """Get the actual torch.dtype from the string representation."""
        if isinstance(self.autocast_dtype, str):
            dtype_name = self.autocast_dtype.replace('torch.', '')
            return getattr(torch, dtype_name)
        return self.autocast_dtype

    class Config:
        # Allow arbitrary types (for backward compatibility during transition)
        arbitrary_types_allowed = True


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
    Save a TrainConfig Pydantic model to JSON at `path`, overwriting if it exists.
    Returns the final path.
    """
    data = cfg.model_dump()
    dirpath = os.path.dirname(path)
    if dirpath:
        os.makedirs(dirpath, exist_ok=True)

    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=True)
        f.write("\n")
    os.replace(tmp_path, path)  # atomic on POSIX/NT
    return path
