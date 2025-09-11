import torch
from collections import abc
from typing import Any, Mapping, Sequence

def _move_to_device(x: Any, device: torch.device, dtype=None, non_blocking=True):
    """Recursively move tensors to device/dtype, preserving structure."""
    if isinstance(x, torch.Tensor):
        return x.to(device=device, dtype=dtype if dtype is not None else x.dtype, non_blocking=non_blocking)
    elif isinstance(x, Mapping):
        return {k: _move_to_device(v, device, dtype, non_blocking) for k, v in x.items()}
    elif isinstance(x, tuple) and hasattr(x, "_fields"):  # namedtuple
        return type(x)(*(_move_to_device(v, device, dtype, non_blocking) for v in x))
    elif isinstance(x, Sequence) and not isinstance(x, (str, bytes)):
        typ = type(x)
        return typ(_move_to_device(v, device, dtype, non_blocking) for v in x)
    else:
        return x  # leave non-tensors as-is


class CUDAPrefetchLoader:
    """
    Wrap a DataLoader to prefetch the *next* batch to GPU asynchronously.

    - Overlaps H2D copies with compute using a dedicated CUDA stream.
    - Handles arbitrarily nested batch structures (tensor/tuple/dict/etc.).
    - Falls back to the original DataLoader if CUDA is unavailable.

    Args:
        loader: torch.utils.data.DataLoader
        device: torch.device or string like 'cuda:0' (default: current cuda device)
        dtype: optional target dtype (e.g., torch.float16 for fp16 inputs)
        non_blocking: use non_blocking=True for .to() copies (use with pin_memory=True on DataLoader)
    """
    def __init__(self, loader, device=None, dtype=None, non_blocking=True):
        self.loader = loader
        self.dtype = dtype
        self.non_blocking = non_blocking

        self._use_cuda = torch.cuda.is_available()
        if self._use_cuda:
            self.device = torch.device(device) if device is not None else torch.device("cuda", torch.cuda.current_device())
            self.stream = torch.cuda.Stream(device=self.device)
        else:
            self.device = torch.device("cpu")
            self.stream = None

        self._iter = None
        self._next = None

    def __len__(self):
        return len(self.loader)

    def __iter__(self):
        if not self._use_cuda:
            # No CUDA: just yield CPU batches unchanged.
            yield from iter(self.loader)
            return

        self._iter = iter(self.loader)
        self._preload()
        while self._next is not None:
            # Make sure the current stream waits for the prefetch stream
            torch.cuda.current_stream(self.device).wait_stream(self.stream)
            batch = self._next
            # Immediately kick off copy for the following batch
            self._preload()
            yield batch

        # clean up references
        self._iter = None
        self._next = None

    def _preload(self):
        try:
            nxt = next(self._iter)
        except StopIteration:
            self._next = None
            return

        # Do the H2D copies on the prefetch stream
        with torch.cuda.stream(self.stream):
            self._next = _move_to_device(
                nxt,
                device=self.device,
                dtype=self.dtype,
                non_blocking=self.non_blocking,
            )
            # Optionally, you can also warm up by calling .record_stream on each tensor
            # so that CUDA knows which stream "owns" it and can free memory earlier.
            def _record_stream(x):
                if isinstance(x, torch.Tensor):
                    x.record_stream(self.stream)
                elif isinstance(x, Mapping):
                    for v in x.values():
                        _record_stream(v)
                elif isinstance(x, Sequence) and not isinstance(x, (str, bytes)):
                    for v in x:
                        _record_stream(v)
            _record_stream(self._next)
