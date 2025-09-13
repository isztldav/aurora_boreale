import os
import numpy as np
import matplotlib.pyplot as plt
from typing import List, Optional

def _ensure_dir(d: str):
    os.makedirs(d, exist_ok=True)

def plot_confusion_matrix(cm: np.ndarray, class_names: List[str], title: str = "Confusion Matrix"):
    fig, ax = plt.subplots(figsize=(6, 6), dpi=120)
    im = ax.imshow(cm, interpolation="nearest")
    ax.set_title(title)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_xticks(np.arange(len(class_names)))
    ax.set_yticks(np.arange(len(class_names)))
    ax.set_xticklabels(class_names, rotation=45, ha="right")
    ax.set_yticklabels(class_names)

    # write values
    vmax = cm.max() if cm.size else 1
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, int(cm[i, j]), ha="center", va="center",
                    color="white" if cm[i, j] > 0.6 * vmax else "black")
    fig.tight_layout()
    return fig

def plot_roc_micro(fpr: np.ndarray, tpr: np.ndarray, auc: float, title: str = "ROC (micro)"):
    fig, ax = plt.subplots(figsize=(6, 5), dpi=120)
    ax.plot(fpr, tpr, label=f"AUROC")
    ax.plot([0, 1], [0, 1], linestyle="--")
    ax.set_xlim([0.0, 1.0])
    ax.set_ylim([0.0, 1.05])
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title(title + f" | AUC(macro)={auc:.4f}")
    ax.legend(loc="lower right")
    fig.tight_layout()
    return fig

def save_figure(fig, path: str):
    _ensure_dir(os.path.dirname(path))
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
