"""Training runner that encapsulates a full experiment lifecycle.

This module exposes ``run_experiment`` which sets up data, model, optimizer,
and schedules, then performs a training/eval loop with TensorBoard logging
and checkpointing.
"""
from __future__ import annotations

import math
import os
from typing import Optional, Callable
import time

import numpy as np
import torch
from torch import nn
from torch.utils.tensorboard import SummaryWriter
from transformers import get_cosine_schedule_with_warmup

from core.utils.checkpoint import save_model_checkpoints
from core.config import TrainConfig, save_train_config
from core.utils.cuda_helper import CUDAPrefetchLoader
from core.data.datasets import build_dataloaders, build_label_maps
from core.utils.losses import build_loss_function
from core.training.model import build_model
from core.utils.optimizers import build_optimizer
from core.utils.seed import get_device, set_seed
from core.utils.tb import create_tb_writer, log_confusion_matrix_table
from core.data.transforms import build_transforms
from core.data.gpu_transforms import build_gpu_train_augment
import core.training.train_eval as train_eval


def _perform_checkpoint(
    cfg: TrainConfig,
    model: torch.nn.Module,
    optimizer: torch.optim.Optimizer,
    epoch: int,
    scheduler: Optional[torch.optim.lr_scheduler.LRScheduler],
    eval_metrics: dict,
) -> tuple[Optional[float], bool]:
    """Save epoch and best checkpoints, logging concise messages.

    Returns
    - best_val: The best value so far for the monitored metric
    - is_best: Whether current epoch improved the monitored metric
    """
    best_val, is_best, best_path, epoch_path = save_model_checkpoints(
        model=model,
        optimizer=optimizer,
        scheduler=scheduler,
        epoch=epoch,
        eval_metrics=eval_metrics,
        ckpt_dir=os.path.join(cfg.ckpt_dir, cfg.run_name or "default"),
        monitor=cfg.monitor_metric,
        mode=cfg.monitor_mode,
        best_ckpt_name="best.pt",
        save_per_epoch_checkpoint=cfg.save_per_epoch_checkpoint,
    )
    if is_best:
        print(
            f"[checkpoint] 🏆 New best {cfg.monitor_metric} = {best_val:.6f} at epoch {epoch+1}. Saved to: {best_path}"
        )
    if epoch_path:
        print(f"[checkpoint] Saved epoch weights to: {epoch_path}")
    return best_val, is_best


def run_experiment(
    cfg: TrainConfig,
    progress_cb: Optional[Callable[[int, int, float, Optional[str]], None]] = None,
    should_stop: Optional[Callable[[], bool]] = None,
    log_streamer=None,
) -> str:
    """Run a full training experiment.

    Steps:
    - Seed and device selection
    - Build transforms and dataloaders
    - Build model and optimizer/scheduler
    - Train/evaluate for ``cfg.epochs`` with TensorBoard logging
    - Save checkpoints using the monitored metric
    """
    # Re-seed for reproducibility per run
    set_seed(cfg.seed)
    device = get_device()
    # Enable cuDNN autotuner for potentially faster convolutions
    if torch.cuda.is_available():
        torch.backends.cudnn.benchmark = True

    # Data
    train_tfms, eval_tfms = build_transforms(cfg.model_flavour, getattr(cfg, "cpu_color_jitter", None))
    train_loader, val_loader, test_loader = build_dataloaders(
        root=cfg.root, train_tfms=train_tfms, eval_tfms=eval_tfms, cfg=cfg
    )
    train_loader = CUDAPrefetchLoader(train_loader)
    val_loader = CUDAPrefetchLoader(val_loader)
    if test_loader:
        test_loader = CUDAPrefetchLoader(test_loader)  # noqa: F841

    # Build GPU-batched training augmentations (size-preserving, geometric only)
    # Only enabled when provided via cfg.gpu_batch_aug (kept identity otherwise)
    train_batch_tf = build_gpu_train_augment(getattr(cfg, "gpu_batch_aug", None)).to(device=device)

    label2id, id2label = build_label_maps(train_loader.loader.dataset)  # type: ignore[attr-defined]
    num_labels = len(label2id)

    # Populate the config with the discovered labels for persistence
    cfg.class_labels = train_loader.loader.dataset.classes  # type: ignore[attr-defined]
    cfg.label2id = label2id
    cfg.id2label = id2label

    # Model + training setup
    model = build_model(
        model_flavour=cfg.model_flavour,
        num_labels=num_labels,
        id2label=id2label,
        label2id=label2id,
        load_pretrained=cfg.load_pretrained,
        freeze_backbone=cfg.freeze_backbone,
    ).to(device)

    # Build optimizer using registry-based builder
    opt_name = getattr(cfg, "optimizer", "adam").lower()
    optimizer = build_optimizer(
        optimizer_name=opt_name,
        model=model,
        lr=cfg.lr,
        weight_decay=getattr(cfg, "weight_decay", 0.0)
    )
    
    steps_per_epoch_eff = math.ceil(len(train_loader) / max(1, cfg.grad_accum_steps))
    num_training_steps = cfg.epochs * steps_per_epoch_eff
    scheduler = get_cosine_schedule_with_warmup(
        optimizer,
        num_warmup_steps=int(cfg.warmup_ratio * num_training_steps),
        num_training_steps=num_training_steps,
    )
    # Build loss function using registry-based builder
    loss_name = getattr(cfg, "loss_name", "cross_entropy")
    loss_fn = build_loss_function(loss_name)
    scaler = torch.GradScaler("cuda", enabled=torch.cuda.is_available())

    # Logging
    writer: Optional[SummaryWriter]
    writer, tb_log_dir = create_tb_writer(run_name=cfg.run_name, root_dir=cfg.tb_root)
    # Save the train configuration into the checkpoint dir for traceability
    save_train_config(cfg, os.path.join(cfg.ckpt_dir, cfg.run_name or "default", "train_config.json"))

    # Train/eval loop
    global_step = 0
    best_epoch_so_far: Optional[int] = None
    best_acc_at_best: Optional[float] = None

    try:
        for epoch in range(cfg.epochs):
            if should_stop and should_stop():
                break
            _epoch_start = time.time()
            steps_per_epoch = len(train_loader)

            train_metrics = train_eval.train_one_epoch(
                dataloader=train_loader,
                model=model,
                loss_fn=loss_fn,
                optimizer=optimizer,
                device=device,
                scaler=scaler,
                epoch=epoch,
                scheduler=scheduler,
                tb_writer=writer,
                global_step_start=global_step,
                max_grad_norm=cfg.max_grad_norm,
                grad_accum_steps=cfg.grad_accum_steps,
                autocast_dtype=cfg.get_torch_dtype(),
                batch_transform=train_batch_tf,
                log_streamer=log_streamer,
                total_epochs=cfg.epochs,
            )
            global_step += steps_per_epoch

            if writer:
                writer.add_scalar("train/epoch_loss", train_metrics["train_loss"], epoch)
                writer.add_scalar("train/epoch_acc@1", train_metrics["train_acc@1"], epoch)

            eval_metrics = train_eval.evaluate(
                dataloader=val_loader,
                model=model,
                loss_fn=loss_fn,
                device=device,
                epoch=epoch,
                num_classes=num_labels,
                id2label=id2label,
                tb_writer=writer,
                log_prefix="val",
                fig_dir=os.path.join(tb_log_dir, "figures"),
                topks=cfg.eval_topk,
                autocast_dtype=cfg.get_torch_dtype(),
            )

            if writer:
                writer.add_scalar("val/loss", eval_metrics["val_loss"], epoch)
                for metric_key, metric_val in eval_metrics.items():
                    if metric_key.startswith("val_acc@"):
                        k = metric_key.split("@", 1)[1]
                        writer.add_scalar(f"val/acc@{k}", metric_val, epoch)
                writer.add_scalar("val/auroc_macro", eval_metrics["val_auroc_macro"], epoch)
                writer.add_scalar("val/map", eval_metrics["val_map"], epoch)
                writer.add_scalar("val/f1_macro", eval_metrics["val_f1_macro"], epoch)
                writer.add_scalar("val/cohenkappa", eval_metrics["val_cohenkappa"], epoch)
                writer.add_scalar("val/recall_micro", eval_metrics["val_recall_micro"], epoch)
                writer.add_scalar("val/recall_macro", eval_metrics["val_recall_macro"], epoch)
                log_confusion_matrix_table(
                    writer, "Confusion_Matrix", eval_metrics["confusion_matrix"], None, global_step=epoch
                )

            # --- Checkpointing and best tracking ---
            best_val, is_best = _perform_checkpoint(
                cfg=cfg,
                model=model,
                optimizer=optimizer,
                epoch=epoch,
                scheduler=scheduler,
                eval_metrics=eval_metrics,
            )
            if is_best:
                best_epoch_so_far = epoch + 1  # human-friendly
                # Always track accuracy at the best epoch (acc@1)
                best_acc_at_best = float(eval_metrics.get("val_acc@1", float("nan")))

            # --- TensorBoard: log best epoch and its accuracy ---
            if writer and best_epoch_so_far is not None and best_acc_at_best is not None:
                writer.add_scalar("best/epoch", best_epoch_so_far, epoch)
                writer.add_scalar("best/acc@1", best_acc_at_best, epoch)
            # Progress callback with epoch duration
            if progress_cb:
                epoch_dur = time.time() - _epoch_start
                try:
                    progress_cb(epoch, cfg.epochs, epoch_dur, tb_log_dir)
                except Exception:
                    pass
            if should_stop and should_stop():
                break
    finally:
        # Ensure TensorBoard file handles are released to prevent FD leaks
        if writer is not None:
            try:
                writer.flush()
            except Exception:
                pass
            try:
                writer.close()
            except Exception:
                pass
            
    return tb_log_dir
