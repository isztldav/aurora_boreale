# Unified Training Platform v2

A small, focused codebase for running reproducible, scriptable, and easily extensible fine-tuning and training experiments. The current implementation targets supervised image classification with Hugging Face Transformers models, but the structure is intentionally generic so you can extend it to other model families and tasks.


## Goals
- Consistent fundamentals: repeatable seeding, reliable logging, and robust checkpointing.
- Scriptable experiments: define runs as small Python configs and execute them programmatically.
- Extensible design: swap models, datasets, transforms, losses, and metrics with clear touchpoints.


## Key Features
- Config-driven runs via a dataclass (TrainConfig).
- Automatic run naming and collision-free versioning.
- HF Transformers vision backbones (pretrained or from scratch) with proper label mapping.
- Efficient training loop: CUDA prefetch, mixed precision (bfloat16), gradient accumulation, grad clipping, Adam or AdamW, cosine schedule with warmup.
- Sensible weight-decay handling (no decay on biases or LayerNorms) for model stability.
- Optional GPU-side geometric augmentation (Kornia) without breaking normalization.
- Comprehensive metrics with TorchMetrics: acc@1 or acc@K, F1 macro, mAP macro, AUROC macro, Cohens kappa, recall micro and macro, confusion matrix.
- TensorBoard logging for scalars, tables, and figures (confusion matrix, ROC micro curve).
- Checkpointing for best and optionally per-epoch weights, with metadata for the monitored metric and mode.
- Class-balanced sampling cap per split (limit max samples per class).


## Repository Layout

### Core Architecture
- **src/dashboard/** — FastAPI backend with REST API and database management
- **src/agent/** — Training agent service with clean architecture (domain, services, repositories)
- **src/core/** — Pure ML training logic and utilities (no external dependencies)
- **src/shared/** — Shared infrastructure (database models, schemas, types)
- **web_ui/** — Next.js frontend with modern React dashboard
- **main.py** — Standalone training entry point

### Core ML Engine (src/core/)
- **config.py** — TrainConfig dataclass with persistent label mapping
- **training/runner.py** — Orchestrates the full training lifecycle
- **training/train_eval.py** — Training loop, evaluation, and metrics
- **training/model.py** — HF model construction with proper label mapping
- **data/datasets.py** — ImageFolder datasets with CUDA prefetch
- **data/transforms.py** — CPU transforms from HF image processors
- **data/gpu_transforms.py** — GPU batch augmentations (Kornia)
- **utils/checkpoint.py** — Best and per-epoch checkpointing
- **utils/registry.py** — Centralized configuration registry
- **utils/losses.py** — Loss function registry
- **utils/optimizers.py** — Optimizer registry
- **utils/progress_tracker.py** — Custom progress tracking for log streaming
- **utils/tb.py** — TensorBoard utilities
- **utils/seed.py** — Reproducibility helpers

### Shared Infrastructure (src/shared/)
- **database/models.py** — All SQLAlchemy database models
- **database/connection.py** — Database session management and initialization
- **database/schemas.py** — Pydantic request/response schemas
- **types/** — Shared type definitions


## Data Expectations
- Folder layout follows torchvision.datasets.ImageFolder conventions:
  - ROOT/train/CLASS_NAME/*.jpg
  - ROOT/val/CLASS_NAME/*.jpg
  - ROOT/test/CLASS_NAME/*.jpg (optional)
- Images are loaded as tensors with torchvision.io.read_image and transformed per-model using the HF AutoImageProcessor for size and normalization.
- You can cap samples per class via TrainConfig.max_datapoints_per_class (int or per-class iterable).


## Quick Start
1) Install dependencies (Python 3.10+ recommended):

~~~bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install transformers torchmetrics tensorboard matplotlib tqdm kornia
~~~

2) Point dataset roots in training_configurations/examples.py to your local folders (for standalone mode) or use the web dashboard for full platform features.

3) Run all configured experiments:

~~~bash
python main.py
~~~

4) View logs and figures in TensorBoard:

~~~bash
tensorboard --logdir runs
~~~

### Modern Dashboard UI (Next.js + TypeScript)
- The UI is now a standalone Next.js 15 app with TypeScript, Tailwind, shadcn/ui components, Zustand, TanStack Query, Recharts, and a WebSocket client for live updates.
- The FastAPI app continues to provide the backend API under `/api/v1` and now exposes a WebSocket endpoint at `/api/v1/ws`.

Run the UI locally (requires Node 18+):

```bash
cd web_ui
npm install
# Point the UI to the API (FastAPI runs on 8000 by default)
export NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1
npm run dev
# open http://localhost:3000
```

Backend (FastAPI) with hot reload:

```bash
uvicorn src.dashboard.app:app --host 0.0.0.0 --port 8000 --reload
# API: http://localhost:8000/api/v1
# WebSocket: ws://localhost:8000/api/v1/ws
```

Notes
- CORS is enabled for `http://localhost:3000` by default; override via `DASHBOARD_CORS_ORIGINS` (comma-separated) on the web service.
Legacy server-rendered pages have been removed; use the Next.js UI exclusively.

Endpoints (selection):
- `GET/POST /api/v1/projects` — list/create projects
- `GET /api/v1/configs/project/{project_id}` — list configs for project
- `POST /api/v1/configs` — create a config (payload mirrors src.core.config.TrainConfig fields)
- `POST /api/v1/runs/from-config/{config_id}` — queue a run (creates run + job rows)
- `GET /api/v1/agents` — list agents; `GET /api/v1/agents/{agent_id}/gpus` — list GPUs for agent
  - Note: Agents and GPUs are auto-registered by the agent process; manual creation is disabled.

UI Pages (Next.js):
- `/` Projects list
- `/projects/[id]` Project overview with runs and chart
- `/projects/[id]/configs` Configs list and creation (JSON)
- `/projects/[id]/datasets` Dataset registry
- `/projects/[id]/models` Model registry
- `/agents` Agents and GPUs

### Docker Dev (web + agent)
- Prereqs: Docker, Compose v2. For GPU, install NVIDIA drivers + NVIDIA Container Toolkit.
- Why: The agent has heavy CUDA/PyTorch deps. We bake them into an image once and hot‑reload Python code via a bind mount.

Build images once (installs deps into layers):

```bash
docker compose build web agent
```

Run the full stack with hot reload for both web and agent:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
# API Docs: http://localhost:8000/docs
# DB (dev overlay): localhost:5432 (user/pass/db: dashboard)
```

Notes
- Source is mounted into containers (`.:/app`), so code edits in `src/` reload without rebuilding.
- Web and Agent dependencies are preinstalled in their images (`src/dashboard/Dockerfile`, `src/agent/Dockerfile`).
- Rebuild only when the corresponding `requirements.txt` changes.
- Agent runs with `--reload`; GPUs are requested in `docker-compose.yml` via device reservations; set `GPU_INDEX` as needed.
- The web talks to the agent on the internal Docker network; you don’t need to expose the agent port for normal use.


Logging and checkpoints
- All TensorBoard logs and checkpoints are placed under `/app/runs` inside containers, which is bind-mounted to `./runs` on the host by default.
- The configured `tb_root` and `ckpt_dir` from the dashboard are respected as subpaths and are prefixed under the shared mount. Example: `tb_root="experiments/logs/foo"` becomes `/app/runs/experiments/logs/foo`.
- Override the mount prefix with `SHARED_LOGS_DIR` if your path differs.

Run naming and uniqueness
- The dashboard now assigns a unique run name at queue time by appending `-vK` (e.g., `model__loss__pretrained`, `model__loss__pretrained-v1`, ...), probing the effective log root on disk.
- Both the agent and the embedded TensorBoard use this stored run name, so checkpoints and logs always land under the same directory and are not overwritten when reusing a config.

Datasets
- Provide datasets from the host by mounting a folder into the agent container at `/app/datasets` (default).
- The `TrainConfig.root` specified in the dashboard is treated as a path relative to this mount. Examples:
  - `/datasetname/split/labels/images` → `/app/datasets/datasetname/split/labels/images`
  - `datasetname/split/labels/images` → `/app/datasets/datasetname/split/labels/images`
  - `./datasetname/split/labels/images` → `/app/datasets/datasetname/split/labels/images`
- Override the mount location with `DATASETS_DIR` in the agent environment if needed.

Shared memory (DataLoader workers)
- PyTorch DataLoader with `num_workers>0` uses POSIX shared memory (`/dev/shm`). If too small, workers may crash with "Unexpected bus error… insufficient shared memory".
- The agent service sets `shm_size: 2gb` in `docker-compose.yml`. Increase if needed, or set `num_workers=0` in your TrainConfig to disable multiprocessing.

Notes:
- Real-time log streaming and metrics are now implemented with WebSocket integration.
- Docker development environment with hot reload is fully functional.
- TensorBoard integration is embedded in the FastAPI backend.


## How Experiments Are Structured

### Standalone Mode
- Declare a list named training_configurations in training_configurations/examples.py.
- Each item is a TrainConfig with all the knobs for a single run.
- main.py loops over that list. For each config it:
  - Builds a base run name: model_flavour__loss__pretrained-or-scratch plus an optional suffix.
  - Ensures uniqueness under the TensorBoard root by adding -v1, -v2, and so on if needed.
  - Calls src.core.training.runner.run_experiment(cfg) and prints the resolved TensorBoard log directory.

### Dashboard Mode
- Create projects and experiment groups through the web UI
- Define TrainConfig entries via the dashboard interface
- Queue training runs that execute on GPU agents
- Monitor progress with real-time log streaming and metrics
- Access embedded TensorBoard instances through the UI

Outputs per run
- Logs: runs/DATASET/RUN_NAME/ (configurable via tb_root)
- Checkpoints: checkpoints/DATASET/RUN_NAME/ (configurable via ckpt_dir)
  - Best checkpoint: best.pt overwrites on improvement of the monitored metric.
  - Per-epoch checkpoints: epoch_XXX.pt if save_per_epoch_checkpoint is True.
  - Metadata: _best_meta.json records best value, epoch, monitor, and mode to make best tracking robust across restarts.

Run naming and versioning
- Defined in src/core/utils/experiments.py; sanitized to be filesystem friendly.
- If a run directory already exists, a -vK suffix is appended to avoid collisions.


## Training Pipeline Overview
- Reproducibility: src.core.utils.seed.set_seed(cfg.seed) sets Python, NumPy, and Torch seeds per run.
- Device: src.core.utils.seed.get_device() selects CUDA if available; cuDNN benchmark enabled for speed.
- Transforms: src.core.data.transforms.build_transforms looks up the HF processor for model_flavour and derives size and normalization.
- Data: src.core.data.datasets.build_dataloaders builds ImageFolder datasets and DataLoaders with pinned memory; wrapped with CUDAPrefetchLoader for async GPU prefetch.
- Model: src.core.training.model.build_model creates an AutoModelForImageClassification with correct label maps. Optional freeze_backbone trains a linear or classifier head only.
- Optimizer: Registry-based optimizer system (src.core.utils.optimizers) with Adam, AdamW, and more. Parameters are split into decay/no-decay groups for stability.
- Schedule: Cosine schedule with warmup (from Transformers) sized to effective steps, respecting gradient accumulation.
- Precision and stability: Mixed precision with torch.autocast using cfg.autocast_dtype (default bfloat16), gradient clipping via cfg.max_grad_norm, gradient accumulation via cfg.grad_accum_steps.
- Loss: Registry-based loss system (src.core.utils.losses) with cross-entropy and other options.
- Logging: Per-step loss/acc/lr; per-epoch train loss/acc and full validation suite. Confusion matrix and ROC curves saved as PNGs and logged to TensorBoard. Real-time log streaming to web UI.
- Checkpoints: Best and optional per-epoch checkpointing keyed to cfg.monitor_metric with cfg.monitor_mode in src.core.utils.checkpoint.save_model_checkpoints.


## Metrics
Computed in src.core.training.train_eval.evaluate using TorchMetrics:
- Overall: val_loss, val_acc@1, val_map (macro mAP), val_f1_macro, val_auroc_macro.
- Top-K: val_acc@K for each K in cfg.eval_topk.
- Agreement and sensitivity: val_cohenkappa, val_recall_micro, val_recall_macro.
- Visuals: Confusion matrix and ROC micro curves (saved under the runs figures directory).


## Configuration (TrainConfig)
Common fields (see src/core/config.py for full list and defaults):
- Data: root, batch_size, num_workers, prefetch_factor, persistent_workers, max_datapoints_per_class.
- Model: model_flavour (HF checkpoint id or path), load_pretrained, freeze_backbone.
- Optimization: optimizer (adam or adamw), lr, weight_decay, max_grad_norm, warmup_ratio, grad_accum_steps, epochs, autocast_dtype, seed.
- Logging or Checkpoints: run_name, tb_root, ckpt_dir, eval_topk, monitor_metric, monitor_mode, save_per_epoch_checkpoint, model_suffix.

Example: configs in training_configurations/examples.py generate comparable runs across multiple models and datasets with consistent effective batch size.


## Extending The Platform

### Standalone Mode Extensions
- New experiments: add or modify TrainConfig entries in training_configurations/examples.py.
- Custom datasets or tasks:
  - Replace or extend src.core.data.datasets.build_dataloaders to construct your DataLoaders.
  - Ensure the batch structure and the training/eval loops agree on shapes and targets.
- Custom models:
  - Add to the model registry in src.core.utils.registry.py.
  - Extend src.core.training.model.build_model for new architectures.
  - If model outputs differ from the .logits convention, adjust src.core.training.train_eval.py accordingly.

### Registry System Extensions
- Custom losses: Add to src.core.utils.losses.py using the @register_loss decorator.
- Custom optimizers: Add to src.core.utils.optimizers.py using the @register_optimizer decorator.
- Custom metrics: Extend src.core.training.train_eval.evaluate function.

### Platform Features
- Augmentations:
  - CPU transforms: edit src.core.data.transforms.py.
  - GPU batch transforms: implement in src.core.data.gpu_transforms.py.
- Web UI: Add components in web_ui/components/ and pages in web_ui/app/.
- API endpoints: Add routers in src/dashboard/routers/ and update src/dashboard/app.py.
- Agent capabilities: Extend src/agent/services/ following clean architecture patterns.

### Advanced Features
- Resuming training: Checkpoints contain model/optimizer/scheduler states; loading logic can be added to run_experiment.
- Distributed or multi-GPU: Can be implemented in src.core.training.runner.py with DDP support.


## Known Limitations
- Focused on supervised image classification; other tasks require small adaptations.
- No CLI or argparse yet; runs are defined by editing Python config files.
- Resume logic is not wired though saved artifacts support it.
- No native DDP; single-GPU by default.


## Acknowledgements
- Hugging Face Transformers for model zoo and processors.
- TorchMetrics for robust evaluation.
- TensorBoard for logging.
- Kornia for optional GPU-side augmentations.


## License
No license file is included in this repository. Use at your discretion or add a license appropriate for your project.
