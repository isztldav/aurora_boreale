import os
from tqdm.auto import tqdm

import gc

from typing import Optional

import torch
from torch import nn
from torch.optim import AdamW, Adam
from transformers import get_cosine_schedule_with_warmup
from torch.utils.tensorboard import SummaryWriter
import math

from utils.config import TrainConfig, save_train_config
from utils.transforms import build_transforms
from utils.data import build_dataloaders, build_label_maps
from utils.model import build_model
from utils.seed import set_seed, get_device
#from utils.losses import FocalLoss, make_ce_loss
from utils.tb import create_tb_writer
#from utils.train import train_one_epoch, evaluate
import utils.train_eval as train_eval
from utils.checkpoint import save_model_checkpoints
import utils.cuda_helper as cuda_helper

import numpy as np


# --- globals -----------------------------------------------------------------

root = '/home/isztld/03_nanoCNN/datasets_ssd/GL/DataFolder'

training_configurations = [
    # 'google/vit-base-patch16-224'
    TrainConfig(freeze_backbone=False, model_suffix='', ckpt_dir="experiments_v2/checkpoints/DME", root=root, run_name=None, model_flavour='google/vit-base-patch16-224', loss_name='CE', load_pretrained=True, batch_size=64, num_workers=8, prefetch_factor=2, epochs=50, lr=1e-3, weight_decay=0.05, warmup_ratio=0.05, seed=42, tb_root="experiments_v2/logs/DME", eval_topk=()),

    TrainConfig(max_datapoints_per_class=3_000, model_suffix='', tb_root="experiments_v2/benchmarking/logs/DME", ckpt_dir="experiments_v2/benchmarking/checkpoints/DME", freeze_backbone=True, root=root, run_name=None, model_flavour='iszt/RETFound_mae_meh', loss_name='CE', load_pretrained=True, batch_size=32, num_workers=8, prefetch_factor=2, epochs=50, lr=1e-3, weight_decay=0.05, warmup_ratio=0.05, seed=42, eval_topk=()),
]

# --- helpers -----------------------------------------------------------------
def log_confusion_matrix_table(
    writer: SummaryWriter,
    tag: str,
    cm: np.ndarray,
    class_names=None,
    global_step: Optional[int] = None
):
    """
    Logs a confusion matrix as a nicely formatted Markdown table in TensorBoard.
    
    Args:
        writer (SummaryWriter): your TensorBoard SummaryWriter.
        tag (str): name under which to log the table.
        cm (np.ndarray): confusion matrix (rows = true classes, cols = predicted).
        class_names (list[str], optional): list of class names; if None, will use C0, C1, ...
        global_step (int, optional): step/epoch for logging.
    """
    rows, cols = cm.shape
    if class_names is None:
        class_names = [f"C{i}" for i in range(cols)]

    # Build Markdown table
    # Header
    header = "| True\\Pred | " + "|".join(class_names) + " |"
    separator = "|".join([" --- " for _ in range(cols + 1)]) + "|"

    # Body rows
    body_lines = []
    for i in range(rows):
        row_vals = " | ".join(str(cm[i, j]) for j in range(cols))
        body_lines.append(f"| {class_names[i]} | {row_vals} |")

    markdown_table = "\n".join([header, separator] + body_lines)

    # Log to TensorBoard
    writer.add_text(tag, markdown_table, global_step=global_step)

def sanitize_name(s: str) -> str:
    return s.replace("/", "-").replace(" ", "_")

def make_run_base(cfg: TrainConfig) -> str:
    return f"{sanitize_name(cfg.model_flavour)}__{cfg.loss_name}__{'pretrained' if cfg.load_pretrained else 'scratch'}{cfg.model_suffix}"

def unique_run_name(root_dir: str, base: str) -> str:
    """
    Ensures TB log dir uniqueness by appending -v{k} if needed.
    """
    candidate = base
    k = 1
    while os.path.exists(os.path.join(root_dir, candidate)):
        candidate = f"{base}-v{k}"
        k += 1
    return candidate

def perform_checkpoint(cfg: TrainConfig, model, optimizer, epoch, scheduler, eval_metrics):
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
        save_per_epoch_checkpoint=cfg.save_per_epoch_checkpoint
    )
    if is_best:
        print(f"[checkpoint] 🏆 New best {cfg.monitor_metric} = {best_val:.6f} at epoch {epoch+1}. Saved to: {best_path}")
    if epoch_path:
        print(f"[checkpoint] Saved epoch weights to: {epoch_path}")

def perform_experiment(writer: Optional[SummaryWriter], tb_log_dir: Optional[str], cfg: TrainConfig) -> None:
    set_seed(cfg.seed)
    device = get_device()

    train_tfms, eval_tfms = build_transforms(cfg.model_flavour)
    train_loader, val_loader, test_loader = build_dataloaders(
        root=cfg.root,
        train_tfms=train_tfms,
        eval_tfms=eval_tfms,
        cfg=cfg
    )

    train_loader = cuda_helper.CUDAPrefetchLoader(train_loader)
    val_loader = cuda_helper.CUDAPrefetchLoader(val_loader)
    if test_loader:
        test_loader = cuda_helper.CUDAPrefetchLoader(test_loader)

    label2id, id2label = build_label_maps(train_loader.loader.dataset)
    num_labels = len(label2id)

    model = build_model(
        model_flavour=cfg.model_flavour,
        num_labels=num_labels,
        id2label=id2label,
        label2id=label2id,
        load_pretrained=cfg.load_pretrained,
        freeze_backbone=cfg.freeze_backbone
    ).to(device)

    optimizer = Adam(model.parameters(), lr=cfg.lr)
    num_training_steps = cfg.epochs * math.ceil(len(train_loader))
    scheduler = get_cosine_schedule_with_warmup(optimizer, num_warmup_steps=int(cfg.warmup_ratio * num_training_steps), num_training_steps=num_training_steps)
    loss_fn = nn.CrossEntropyLoss()

    scaler = torch.amp.GradScaler("cuda", enabled=torch.cuda.is_available())

    global_step = 0
    for epoch in range(cfg.epochs):
        steps_per_epoch = len(train_loader)

        train_metrics = train_eval.train_one_epoch(dataloader=train_loader, model=model, loss_fn=loss_fn, optimizer=optimizer, device=device, scaler=scaler, epoch=epoch, scheduler=scheduler, tb_writer=None, global_step_start=global_step)
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
            log_confusion_matrix_table(writer, 'Confusion_Matrix', eval_metrics["confusion_matrix"], None, global_step=epoch)


        perform_checkpoint(cfg=cfg, model=model, optimizer=optimizer, epoch=epoch, scheduler=scheduler, eval_metrics=eval_metrics)

# --- main -----------------------------------------------------------------
def main():
    pbar = tqdm(training_configurations, desc="Experiments", unit="run")

    for cfg in pbar:
        base_name = make_run_base(cfg)
        cfg.run_name = unique_run_name(cfg.tb_root, base_name)

        print(f"\n=== Starting run: {cfg.run_name} ===")

        pbar.set_postfix({
            "model": sanitize_name(cfg.model_flavour),
            "loss": cfg.loss_name,
            "init": "pretrained" if cfg.load_pretrained else "scratch",
        })

        save_train_config(cfg, os.path.join(cfg.ckpt_dir, cfg.run_name or "default", "train_config.json"))

        # TensorBoard writer (unique per run)
        writer, tb_log_dir = create_tb_writer(run_name=cfg.run_name, root_dir=cfg.tb_root)

        perform_experiment(writer, tb_log_dir, cfg)

        
        print(f"=== Finished run: {cfg.run_name} | TB logs: {tb_log_dir} ===")
    



if __name__ == "__main__":
    main()


