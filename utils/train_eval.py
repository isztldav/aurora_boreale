from typing import Iterable, Tuple, Dict, Optional
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
from utils.visuals import plot_confusion_matrix, plot_roc_micro, save_figure
from tqdm.auto import tqdm
from torch.utils.tensorboard import SummaryWriter
from torch.utils.data import DataLoader
from utils.cuda_helper import CUDAPrefetchLoader


def train_one_epoch(
    dataloader: Tuple[DataLoader, CUDAPrefetchLoader],
    model: torch.nn.Module,
    loss_fn: nn.Module,
    optimizer: Optimizer,
    device: torch.device,
    scaler: torch.amp.GradScaler,
    epoch: int,
    scheduler: Optional[torch.optim.lr_scheduler.LRScheduler] = None,
    tb_writer: Optional[SummaryWriter] = None,
    global_step_start: int = 0
): # -> Dict[str, float]:
    
    model.train()
    running_loss = 0.0
    running_acc = 0.0
    n_batches = 0
    global_step = global_step_start

    progress_bar = tqdm(dataloader, total=len(dataloader), desc="Processing", unit="batch", leave=True)
    for batch_idx, (input, expected) in enumerate(progress_bar):
        input = input.to(device, non_blocking=True)
        expected = expected.to(device, non_blocking=True)

        optimizer.zero_grad(set_to_none=True)
        with torch.autocast(device_type="cuda", enabled=torch.cuda.is_available()):
            logits = model(input).logits
            loss = loss_fn(logits, expected)
        
        prev_scale = scaler.get_scale()

        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        
        if scheduler:
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
    dataloader: Tuple[DataLoader, CUDAPrefetchLoader],
    model,
    loss_fn: nn.Module,
    device: torch.device,
    epoch: int,
    num_classes: int,
    id2label: dict,
    tb_writer=None,
    log_prefix: str = "val",
    topks: Tuple[int, ...] = (3, 5),
    fig_dir: Optional[str] = None,
):
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

    progress_bar = tqdm(dataloader, total=len(dataloader), desc="Processing", unit="batch")
    for batch_idx, (X, y) in enumerate(progress_bar):
        X = X.to(device, non_blocking=True)
        y = y.to(device, non_blocking=True)

        with torch.autocast(device_type="cuda", enabled=torch.cuda.is_available()):
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
        cohenkappa.update(probs, y)
        recall_micro.update(probs, y)
        recall_macro.update(probs, y)
    
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

