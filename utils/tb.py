import os
from datetime import datetime
from typing import Optional, Sequence

import numpy as np
from torch.utils.tensorboard import SummaryWriter


def create_tb_writer(run_name: Optional[str] = None, root_dir: str = "runs"):
    """Create and return a TensorBoard writer and its log directory.

    Args:
        run_name: Optional name of the run directory; if None, uses a timestamp.
        root_dir: Root log directory that will contain the ``run_name`` folder.

    Returns:
        Tuple[SummaryWriter, str]: writer instance and the resolved log directory.
    """
    if run_name is None:
        run_name = datetime.now().strftime("%Y%m%d-%H%M%S")
    log_dir = os.path.join(root_dir, run_name)
    os.makedirs(log_dir, exist_ok=True)
    writer = SummaryWriter(log_dir=log_dir)
    return writer, log_dir


def log_confusion_matrix_table(
    writer: SummaryWriter,
    tag: str,
    cm: np.ndarray,
    class_names: Optional[Sequence[str]] = None,
    global_step: Optional[int] = None,
) -> None:
    """Log a confusion matrix to TensorBoard as a Markdown table.

    This provides a compact, text-based view of the confusion matrix which is
    handy when browsing runs remotely.
    """
    rows, cols = cm.shape
    if class_names is None:
        class_names = [f"C{i}" for i in range(cols)]

    header = r"| True\Pred | " + "|".join(class_names) + " |"
    separator = "|".join([" --- " for _ in range(cols + 1)]) + "|"

    body_lines = []
    for i in range(rows):
        row_vals = " | ".join(str(cm[i, j]) for j in range(cols))
        body_lines.append(f"| {class_names[i]} | {row_vals} |")

    markdown_table = "\n".join([header, separator] + body_lines)
    writer.add_text(tag, markdown_table, global_step=global_step)
