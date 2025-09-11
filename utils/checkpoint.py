import os
import json
from typing import Tuple, Optional, Dict, Any
import torch

def _is_improved(curr: float, best: Optional[float], mode: str) -> bool:
    if best is None:
        return True
    if mode not in {"max", "min"}:
        raise ValueError(f"mode must be 'max' or 'min', got {mode}")
    return (curr > best) if mode == "max" else (curr < best)

def save_model_checkpoints(
    *,
    model: torch.nn.Module,
    optimizer: Optional[torch.optim.Optimizer],
    scheduler: Optional[Any],
    epoch: int,
    eval_metrics: Dict[str, float],
    ckpt_dir: str,
    save_per_epoch_checkpoint: bool,
    monitor: str = "val_acc@1",
    mode: str = "max",
    best_ckpt_name: str = "best.pt",
) -> Tuple[Optional[float], bool, str, Optional[str]]:
    """
    Saves:
      1) a per-epoch checkpoint:  <ckpt_dir>/epoch_{epoch+1:03d}.pt
      2) the best-so-far checkpoint (overwrites): <ckpt_dir>/<best_ckpt_name>

    Returns: (best_value, is_best, best_ckpt_path, epoch_ckpt_path)
    """
    os.makedirs(ckpt_dir, exist_ok=True)

    # --- determine current score ---
    if monitor not in eval_metrics:
        # fallback to val_loss if requested metric missing
        if "val_loss" in eval_metrics:
            print(f"[checkpoint] monitor='{monitor}' not in eval_metrics; falling back to 'val_loss' (mode='min').")
            monitor = "val_loss"
            mode = "min"
        else:
            raise KeyError(f"[checkpoint] metric '{monitor}' not found in eval_metrics keys: {list(eval_metrics.keys())}")

    curr_value = float(eval_metrics[monitor])

    # --- read previous best from meta file (if any) ---
    meta_path = os.path.join(ckpt_dir, "_best_meta.json")
    best_value: Optional[float] = None
    if os.path.isfile(meta_path):
        try:
            with open(meta_path, "r") as f:
                meta = json.load(f)
            if meta.get("monitor") == monitor and meta.get("mode") == mode:
                best_value = float(meta.get("best_value"))
        except Exception:
            pass  # corrupted meta; ignore

    # --- save per-epoch checkpoint ---
    epoch_idx = epoch + 1  # human-friendly

    epoch_ckpt_path = None
    if save_per_epoch_checkpoint:
        epoch_ckpt_path = os.path.join(ckpt_dir, f"epoch_{epoch_idx:03d}.pt")
        torch.save(
            {
                "epoch": epoch_idx,
                "model_state": model.state_dict(),
                "optimizer_state": optimizer.state_dict() if optimizer is not None else None,
                "scheduler_state": scheduler.state_dict() if (scheduler is not None and hasattr(scheduler, "state_dict")) else None,
                "eval_metrics": eval_metrics,
                "monitor": monitor,
                "mode": mode,
            },
            epoch_ckpt_path,
        )

    # --- if improved, overwrite best checkpoint ---
    is_best = _is_improved(curr_value, best_value, mode)
    best_ckpt_path = os.path.join(ckpt_dir, best_ckpt_name)
    if is_best:
        torch.save(
            {
                "epoch": epoch_idx,
                "model_state": model.state_dict(),
                "optimizer_state": optimizer.state_dict() if optimizer is not None else None,
                "scheduler_state": scheduler.state_dict() if (scheduler is not None and hasattr(scheduler, "state_dict")) else None,
                "eval_metrics": eval_metrics,
                "monitor": monitor,
                "mode": mode,
                "best_value": curr_value,
            },
            best_ckpt_path,
        )
        with open(meta_path, "w") as f:
            json.dump(
                {
                    "best_value": curr_value,
                    "epoch": epoch_idx,
                    "monitor": monitor,
                    "mode": mode,
                    "best_ckpt": best_ckpt_path,
                },
                f,
                indent=2,
            )

    return (curr_value if is_best else best_value, is_best, best_ckpt_path, epoch_ckpt_path)
