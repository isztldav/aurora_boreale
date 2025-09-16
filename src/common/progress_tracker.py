"""Custom progress tracker for training that integrates with log streaming."""

from typing import Optional, Any, Dict
import time
import sys


class TrainingProgressTracker:
    """A tqdm-like progress tracker optimized for log streaming."""

    def __init__(self, iterable, desc: str = "Progress", total: Optional[int] = None,
                 log_streamer=None, epoch: int = 1, total_epochs: int = 1,
                 disable: bool = False, leave: bool = True):
        self.iterable = iterable
        self.desc = desc
        self.total = total or (len(iterable) if hasattr(iterable, '__len__') else None)
        self.log_streamer = log_streamer
        self.epoch = epoch
        self.total_epochs = total_epochs
        self.disable = disable
        self.leave = leave

        self.n = 0
        self.start_time = time.time()
        self.last_print_time = self.start_time
        self.last_log_time = self.start_time
        self.postfix_dict = {}

        # Console update frequency (for tqdm-like console output)
        self.print_interval = 0.1  # Update console every 100ms
        # Log update frequency (for database/WebSocket)
        self.log_interval = 2.0    # Log progress every 2 seconds

        if not disable:
            self._print_initial()

    def __iter__(self):
        for item in self.iterable:
            yield item
            self.update()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def update(self, n: int = 1):
        """Update progress by n steps."""
        self.n += n
        current_time = time.time()

        # Update console frequently for smooth progress
        if not self.disable and (current_time - self.last_print_time) >= self.print_interval:
            self._print_progress()
            self.last_print_time = current_time

        # Log to database/WebSocket less frequently
        if self.log_streamer and (current_time - self.last_log_time) >= self.log_interval:
            self._log_progress()
            self.last_log_time = current_time

    def set_postfix(self, postfix_dict: Dict[str, Any]):
        """Set postfix values for display."""
        self.postfix_dict.update(postfix_dict)

    def set_description(self, desc: str):
        """Update the description."""
        self.desc = desc

    def close(self):
        """Close the progress tracker."""
        if not self.disable:
            self._print_final()
            # Always log final progress
            if self.log_streamer:
                self._log_progress()

    def clear(self):
        """Clear the progress line."""
        if not self.disable:
            sys.stdout.write('\r' + ' ' * 80 + '\r')
            sys.stdout.flush()

    def _print_initial(self):
        """Print initial progress line."""
        sys.stdout.write(f"{self.desc}: ")
        sys.stdout.flush()

    def _print_progress(self):
        """Print current progress to console."""
        if self.total:
            percent = (self.n / self.total) * 100
            bar_length = 20
            filled_length = int(bar_length * self.n // self.total)
            bar = '█' * filled_length + '░' * (bar_length - filled_length)
            progress_str = f"\r{self.desc}: {percent:5.1f}%|{bar}| {self.n}/{self.total}"
        else:
            progress_str = f"\r{self.desc}: {self.n}it"

        # Add postfix
        if self.postfix_dict:
            postfix_items = [f"{k}: {v}" for k, v in self.postfix_dict.items()]
            progress_str += f" [{', '.join(postfix_items)}]"

        # Add rate
        elapsed = time.time() - self.start_time
        if elapsed > 0:
            rate = self.n / elapsed
            progress_str += f" {rate:.2f}it/s"

        sys.stdout.write(progress_str)
        sys.stdout.flush()

    def _print_final(self):
        """Print final progress and move to next line."""
        self._print_progress()
        if self.leave:
            sys.stdout.write('\n')
        else:
            self.clear()
        sys.stdout.flush()

    def _log_progress(self):
        """Log progress to the log streamer."""
        loss = self.postfix_dict.get("loss")
        accuracy = self.postfix_dict.get("avg_acc@1")

        # Parse numeric values if they're strings
        try:
            if isinstance(loss, str):
                loss = float(loss)
        except (ValueError, TypeError):
            loss = None

        try:
            if isinstance(accuracy, str):
                accuracy = float(accuracy)
        except (ValueError, TypeError):
            accuracy = None

        self.log_streamer.log_progress(
            epoch=self.epoch,
            total_epochs=self.total_epochs,
            batch=self.n,
            total_batches=self.total or self.n,
            loss=loss,
            accuracy=accuracy
        )


def tqdm_with_logging(iterable, desc: str = "Progress", total: Optional[int] = None,
                     log_streamer=None, epoch: int = 1, total_epochs: int = 1,
                     disable: bool = False, leave: bool = True):
    """Drop-in replacement for tqdm that integrates with log streaming."""
    return TrainingProgressTracker(
        iterable=iterable,
        desc=desc,
        total=total,
        log_streamer=log_streamer,
        epoch=epoch,
        total_epochs=total_epochs,
        disable=disable,
        leave=leave
    )