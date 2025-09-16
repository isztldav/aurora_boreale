from typing import Iterable, Tuple, Dict, Optional, Any, Union
import os
import torch
from torch import nn
from torch.optim import Optimizer
from torchmetrics.classification import (
    MulticlassAccuracy,
    MulticlassAveragePrecision,
    MulticlassF1Score,
    MulticlassAUROC,
    MulticlassConfusionMatrix,
    MulticlassROC,
    CohenKappa,
    Recall,
)
from common.visuals import plot_confusion_matrix, plot_roc_micro, save_figure
from tqdm.auto import tqdm
from .progress_tracker import tqdm_with_logging
from torch.utils.tensorboard import SummaryWriter
from torch.utils.data import DataLoader
from common.cuda_helper import CUDAPrefetchLoader


def train_one_epoch(
    dataloader: Union[DataLoader, CUDAPrefetchLoader],
    model: torch.nn.Module,
    loss_fn: nn.Module,
    optimizer: Optimizer,
    device: torch.device,
    scaler: torch.GradScaler,
    autocast_dtype: torch.dtype,
    epoch: int,
    scheduler: Optional[torch.optim.lr_scheduler.LRScheduler] = None,
    tb_writer: Optional[SummaryWriter] = None,
    global_step_start: int = 0,
    max_grad_norm: Optional[float] = None,
    grad_accum_steps: int = 1,
    batch_transform: Optional[torch.nn.Module] = None,
    log_streamer = None,
    total_epochs: int = 1,
)-> Dict[str, float]:
    """Train one full epoch.

    Logs per-step metrics if ``tb_writer`` is provided and returns average
    loss and accuracy for the epoch.
    """
    
    model.train()
    running_loss = 0.0
    running_acc = 0.0
    n_batches = 0
    global_step = global_step_start

    # Use custom progress tracker if log_streamer available, otherwise use tqdm
    if log_streamer:
        progress_bar = tqdm_with_logging(
            dataloader,
            desc=f"Epoch {epoch + 1}/{total_epochs}",
            total=len(dataloader),
            log_streamer=log_streamer,
            epoch=epoch + 1,
            total_epochs=total_epochs,
            leave=True
        )
    else:
        progress_bar = tqdm(dataloader, total=len(dataloader), desc="Processing", unit="batch", leave=True)
    optimizer.zero_grad(set_to_none=True)
    for batch_idx, (input, expected) in enumerate(progress_bar):
        input = input.to(device, non_blocking=True)
        expected = expected.to(device, non_blocking=True)

        with torch.autocast(device_type="cuda", dtype=autocast_dtype, enabled=torch.cuda.is_available()):
            if batch_transform is not None:
                input = batch_transform(input)
            logits = model(input).logits
            loss = loss_fn(logits, expected)
        
        loss_to_backprop = loss / max(1, grad_accum_steps)
        prev_scale = scaler.get_scale()
        scaler.scale(loss_to_backprop).backward()

        do_step = ((batch_idx + 1) % max(1, grad_accum_steps) == 0) or ((batch_idx + 1) == len(dataloader))
        if do_step:
            # Gradient clipping (after unscale) to improve stability
            if max_grad_norm is not None and max_grad_norm > 0:
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)

            scaler.step(optimizer)
            scaler.update()
            optimizer.zero_grad(set_to_none=True)

            if scheduler and scaler.get_scale() >= prev_scale:
                scheduler.step()
        
        
        with torch.no_grad():
            preds = torch.argmax(logits, dim=1)
            batch_acc = (preds == expected).float().mean().item()
        running_loss += loss.item()
        running_acc += batch_acc
        n_batches += 1

        # ---- Per-step TensorBoard logging ----
        if tb_writer is not None:
            lr = optimizer.param_groups[0]["lr"] if optimizer.param_groups else float("nan")
            tb_writer.add_scalar("train/step_loss", loss.item(), global_step)
            tb_writer.add_scalar("train/step_acc@1", batch_acc, global_step)
            tb_writer.add_scalar("train/lr", lr, global_step)

        avg_acc_so_far = running_acc / max(1, n_batches)
        progress_bar.set_postfix({
            "loss": f"{loss.item():.4f}",
            "avg_acc@1": f"{avg_acc_so_far:.4f}"
        })

        global_step += 1
    
    progress_bar.clear()
    progress_bar.close()
    print('')

    avg_loss = running_loss / max(1, n_batches)
    avg_acc = running_acc / max(1, n_batches)
    return {"train_loss": avg_loss, "train_acc@1": avg_acc}


@torch.no_grad()
def evaluate(
    dataloader: Union[DataLoader, CUDAPrefetchLoader],
    model,
    loss_fn: nn.Module,
    device: torch.device,
    autocast_dtype: torch.dtype,
    epoch: int,
    num_classes: int,
    id2label: dict,
    tb_writer=None,
    log_prefix: str = "val",
    topks: Tuple[int, ...] = (3, 5),
    fig_dir: Optional[str] = None,
)-> Dict[str, Any]:
    """Evaluate model and compute a suite of multiclass metrics.

    Also generates and optionally logs confusion matrix and ROC(micro) figures.
    """
    model.eval()

    acc_top1 = MulticlassAccuracy(num_classes=num_classes).to(device)
    map_macro = MulticlassAveragePrecision(num_classes=num_classes, average="macro").to(device)
    topk_metrics = {k: MulticlassAccuracy(num_classes=num_classes, top_k=k).to(device) for k in topks}
    f1_macro = MulticlassF1Score(num_classes=num_classes, average="macro").to(device)
    auroc_macro = MulticlassAUROC(num_classes=num_classes, average="macro").to(device)
    cm_metric = MulticlassConfusionMatrix(num_classes=num_classes).to(device)
    roc_micro = MulticlassROC(num_classes=num_classes, average="micro").to(device)
    cohenkappa = CohenKappa(task="multiclass", num_classes=num_classes).to(device)
    recall_micro = Recall(task="multiclass", average='micro', num_classes=num_classes).to(device)
    recall_macro = Recall(task="multiclass", average='macro', num_classes=num_classes).to(device)

    total_loss = 0.0
    nb = 0

    # Use simpler progress for evaluation (no log streaming needed)
    progress_bar = tqdm(dataloader, total=len(dataloader), desc="Evaluating", unit="batch")
    for batch_idx, (X, y) in enumerate(progress_bar):
        X = X.to(device, non_blocking=True)
        y = y.to(device, non_blocking=True)

        with torch.autocast(device_type="cuda", dtype=autocast_dtype, enabled=torch.cuda.is_available()):
            logits = model(X).logits
            probs = torch.softmax(logits, dim=1)
            total_loss += loss_fn(logits, y).item()
        
        nb += 1

        acc_top1.update(logits, y)
        map_macro.update(logits, y)
        for k, m in topk_metrics.items():
            m.update(logits, y)
        f1_macro.update(logits, y)
        auroc_macro.update(probs, y)
        cm_metric.update(logits, y)
        roc_micro.update(probs, y)
        preds_eval = torch.argmax(logits, dim=1)
        cohenkappa.update(preds_eval, y)
        recall_micro.update(preds_eval, y)
        recall_macro.update(preds_eval, y)
    
    progress_bar.clear()
    progress_bar.close()
    print()

    avg_loss = total_loss / max(nb, 1)
    acc1 = acc_top1.compute().item()
    map = map_macro.compute().item()
    topk_vals = {k: m.compute().item() for k, m in topk_metrics.items()}
    f1_val = f1_macro.compute().item()
    auc_macro = auroc_macro.compute().item()
    cm = cm_metric.compute().cpu().numpy()
    cohenk = cohenkappa.compute().cpu().numpy()
    recall_mi = recall_micro.compute().cpu().numpy()
    recall_ma = recall_macro.compute().cpu().numpy()

    # ROC (micro) curve points
    fpr, tpr, _ = roc_micro.compute()  # tensors of shape (N,)
    fpr = fpr.cpu().numpy()
    tpr = tpr.cpu().numpy()

    print(
        f"[EVAL epoch {epoch+1}] loss={avg_loss:.4f} acc@1={acc1:.4f} map={map:.4f} "
        + " ".join([f"acc@{k}={topk_vals[k]:.4f}" for k in sorted(topk_vals)])
        + f" f1_macro={f1_val:.4f} auroc_macro={auc_macro:.4f}"
    )

    # --- Visuals: Confusion Matrix + ROC(micro) ---
    class_names = [id2label[i] for i in range(num_classes)]
    figure_paths = []
    if fig_dir is not None:
        os.makedirs(fig_dir, exist_ok=True)

        cm_fig = plot_confusion_matrix(cm, class_names, title=f"{log_prefix.upper()} Confusion Matrix (epoch {epoch+1})")
        cm_path = os.path.join(fig_dir, f"{log_prefix}_confusion_matrix_epoch_{epoch+1}.png")
        save_figure(cm_fig, cm_path)
        figure_paths.append(cm_path)

        roc_fig = plot_roc_micro(fpr, tpr, auc_macro, title=f"{log_prefix.upper()} ROC (micro) epoch {epoch+1}")
        roc_path = os.path.join(fig_dir, f"{log_prefix}_roc_micro_epoch_{epoch+1}.png")
        save_figure(roc_fig, roc_path)
        figure_paths.append(roc_path)

        # Also log figures to TensorBoard
        if tb_writer is not None:
            import matplotlib.pyplot as plt
            # Re-create lightweight figures for TB to avoid reusing closed figs
            tb_writer.add_figure(f"{log_prefix}/confusion_matrix", plot_confusion_matrix(cm, class_names), global_step=epoch)
            tb_writer.add_figure(f"{log_prefix}/roc_micro", plot_roc_micro(fpr, tpr, auc_macro), global_step=epoch)
            plt.close('all')

    return {
        "val_loss": avg_loss,
        "val_acc@1": acc1,
        "val_map": map,
        **{f"val_acc@{k}": v for k, v in topk_vals.items()},
        "val_f1_macro": f1_val,
        "val_auroc_macro": auc_macro,
        "val_cohenkappa": cohenk,
        "val_recall_micro": recall_mi,
        "val_recall_macro": recall_ma,
        "confusion_matrix": cm,
        "roc_micro": (fpr, tpr),
        "figure_paths": figure_paths,
    }
