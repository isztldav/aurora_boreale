import os
from datetime import datetime
from torch.utils.tensorboard import SummaryWriter

def create_tb_writer(run_name=None, root_dir="runs"):
    if run_name is None:
        run_name = datetime.now().strftime("%Y%m%d-%H%M%S")
    log_dir = os.path.join(root_dir, run_name)
    os.makedirs(log_dir, exist_ok=True)
    writer = SummaryWriter(log_dir=log_dir)
    return writer, log_dir
