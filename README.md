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
- main.py — Entry point that iterates over experiment configs and runs them sequentially.
- training_configurations/examples.py — Where you define experiments (dataset roots, models, hyperparameters).
- utils/config.py — TrainConfig dataclass and JSON serialization helper.
- utils/experiments.py — Run name helpers (sanitization, base name, unique suffixing).
- utils/runner.py — Orchestrates the full lifecycle: data, model, optimizer or scheduler, train and eval, logging, checkpoints.
- utils/data.py — ImageFolder-based datasets and DataLoaders, class maps, and a simple collate.
- utils/transforms.py — CPU transforms derived from each models HF image processor (size and normalization stats).
- utils/gpu_transforms.py — Optional GPU batch augmentations (Kornia) that preserve size.
- utils/model.py — HF model construction (pretrained or from config), optional backbone freezing.
- utils/train_eval.py — Training step, evaluation loop, metrics, and visuals.
- utils/checkpoint.py — Best or per-epoch checkpoint saving and metadata.
- utils/tb.py — TensorBoard writer factory and table logging (Markdown confusion matrix).
- utils/cuda_helper.py — GPU prefetch DataLoader wrapper with async host-to-device copies.
- utils/seed.py — Reproducibility helpers and device selection.


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

2) Point dataset roots in training_configurations/examples.py to your local folders.

3) Run all configured experiments:

~~~bash
python main.py
~~~

4) View logs and figures in TensorBoard:

~~~bash
tensorboard --logdir experiments/logs
~~~

### Dashboard (MVP)
- The web dashboard is a minimal FastAPI app to manage projects, configs, agents/GPUs and to queue runs (no Docker/agent execution yet).
- It uses SQLite by default (`DASHBOARD_DB_URL` can point to Postgres later).

Run the dashboard locally:

~~~bash
pip install fastapi "uvicorn[standard]" sqlalchemy pydantic tensorboard
python run_dashboard.py
# open http://localhost:8000/web/projects
~~~

Tailwind UI build (optional, recommended)
- The templates use Tailwind utility classes. A prebuilt CSS is not committed to avoid bloating the repo. Build it locally:

~~~bash
cd web_ui
npm install  # requires network
npm run build:css  # outputs ../src/dashboard/static/tw.css
~~~

- During development you can watch for changes:

~~~bash
npm run watch:css
~~~

Note: If you don’t build Tailwind, pages will still render but unstyled. Build once to enable the modern look.

Forms plugin
- The UI uses Tailwind Forms plugin for polished inputs. It’s already listed in devDependencies.
- If you installed dependencies before this change, run `npm install` again.

Endpoints (selection):
- `GET/POST /api/v1/projects` — list/create projects
- `GET /api/v1/configs/project/{project_id}` — list configs for project
- `POST /api/v1/configs` — create a config (payload mirrors utils.config.TrainConfig fields)
- `POST /api/v1/runs/from-config/{config_id}` — queue a run (creates run + job rows)
- `GET /api/v1/agents` — list agents; `GET /api/v1/agents/{agent_id}/gpus` — list GPUs for agent
  - Note: Agents and GPUs are auto-registered by the agent process; manual creation is disabled.

UI Pages (simple Jinja templates):
- `/web/projects` → projects list and create
- `/web/projects/{id}/configs` → configs list and create (paste JSON)
- `/web/projects/{id}/runs` → queue runs; inspect existing runs
- `/web/runs/{run_id}` → run detail, simple state controls and logs placeholder
- `/web/agents` → agents and GPU inventory (read-only; auto-registered)
 - `/web/projects/{id}/datasets` → dataset registry
 - `/web/projects/{id}/models` → model registry

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
# Web: http://localhost:8000/web/projects
# DB (dev overlay): localhost:5432 (user/pass/db: dashboard)
```

Notes
- Source is mounted into containers (`.:/app`), so code edits in `src/` reload without rebuilding.
- Web and Agent dependencies are preinstalled in their images (`src/dashboard/Dockerfile`, `src/agent/Dockerfile`).
- Rebuild only when the corresponding `requirements.txt` changes.
- Agent runs with `--reload`; GPUs are requested in `docker-compose.yml` via device reservations; set `GPU_INDEX` as needed.
- The web talks to the agent on the internal Docker network; you don’t need to expose the agent port for normal use.
 - `/web/projects/{id}/augmentations` → augmentation registry

Logging and checkpoints
- All TensorBoard logs and checkpoints are placed under the shared volume mount inside containers (default: `/app/runs`).
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
- No scheduler, Docker, or real log/metrics streaming is implemented yet per requirements_v_1.md scope. The API records queued jobs and run states for now.


## How Experiments Are Structured
- Declare a list named training_configurations in training_configurations/examples.py.
- Each item is a TrainConfig with all the knobs for a single run.
- main.py loops over that list. For each config it:
  - Builds a base run name: model_flavour__loss__pretrained-or-scratch plus an optional suffix.
  - Ensures uniqueness under the TensorBoard root by adding -v1, -v2, and so on if needed.
  - Calls utils.runner.run_experiment(cfg) and prints the resolved TensorBoard log directory.

Outputs per run
- Logs: experiments/logs/DATASET/RUN_NAME/
- Checkpoints: experiments/checkpoints/DATASET/RUN_NAME/
  - Best checkpoint: best.pt overwrites on improvement of the monitored metric.
  - Per-epoch checkpoints: epoch_XXX.pt if save_per_epoch_checkpoint is True.
  - Metadata: _best_meta.json records best value, epoch, monitor, and mode to make best tracking robust across restarts.

Run naming and versioning
- Defined in utils/experiments.py; sanitized to be filesystem friendly.
- If a run directory already exists, a -vK suffix is appended to avoid collisions.


## Training Pipeline Overview
- Reproducibility: utils/seed.set_seed(cfg.seed) sets Python, NumPy, and Torch seeds per run.
- Device: utils/seed.get_device() selects CUDA if available; cuDNN benchmark enabled for speed.
- Transforms: utils/transforms.build_transforms looks up the HF processor for model_flavour and derives size and normalization.
- Data: utils/data.build_dataloaders builds ImageFolder datasets and DataLoaders with pinned memory; wrapped with CUDAPrefetchLoader for async GPU prefetch.
- Model: utils/model.build_model creates an AutoModelForImageClassification with correct label maps. Optional freeze_backbone trains a linear or classifier head only.
- Optimizer: Adam or AdamW. Parameters are split into decay or no-decay groups (no decay for bias or LayerNorm or 1D) for stability. Learning rate from config.
- Schedule: Cosine schedule with warmup (from Transformers) sized to effective steps, respecting gradient accumulation.
- Precision and stability: Mixed precision with torch.autocast using cfg.autocast_dtype (default bfloat16), gradient clipping via cfg.max_grad_norm, gradient accumulation via cfg.grad_accum_steps.
- Loss: Cross-entropy (nn.CrossEntropyLoss).
- Logging: Per-step loss or acc or lr; per-epoch train loss or acc and full validation suite. Confusion matrix and ROC micro are saved as PNGs and logged to TensorBoard.
- Checkpoints: Best and optional per-epoch checkpointing keyed to cfg.monitor_metric with cfg.monitor_mode in utils.checkpoint.save_model_checkpoints.


## Metrics
Computed in utils/train_eval.evaluate using TorchMetrics:
- Overall: val_loss, val_acc@1, val_map (macro mAP), val_f1_macro, val_auroc_macro.
- Top-K: val_acc@K for each K in cfg.eval_topk.
- Agreement and sensitivity: val_cohenkappa, val_recall_micro, val_recall_macro.
- Visuals: Confusion matrix and ROC micro curves (saved under the runs figures directory).


## Configuration (TrainConfig)
Common fields (see utils/config.py for full list and defaults):
- Data: root, batch_size, num_workers, prefetch_factor, persistent_workers, max_datapoints_per_class.
- Model: model_flavour (HF checkpoint id or path), load_pretrained, freeze_backbone.
- Optimization: optimizer (adam or adamw), lr, weight_decay, max_grad_norm, warmup_ratio, grad_accum_steps, epochs, autocast_dtype, seed.
- Logging or Checkpoints: run_name, tb_root, ckpt_dir, eval_topk, monitor_metric, monitor_mode, save_per_epoch_checkpoint, model_suffix.

Example: configs in training_configurations/examples.py generate comparable runs across multiple models and datasets with consistent effective batch size.


## Extending The Platform
- New experiments: add or modify TrainConfig entries in training_configurations/examples.py.
- Custom datasets or tasks:
  - Replace or extend utils/data.build_dataloaders to construct your DataLoaders.
  - Ensure the batch structure and the training or eval loops agree on shapes and targets.
- Custom models:
  - Extend utils/model.build_model to build other HF model types or your own architectures.
  - If model outputs differ from the .logits convention, adjust utils/train_eval.py accordingly.
- Custom loss or metrics:
  - Swap the loss function in utils/runner.run_experiment.
  - Add metrics or plots inside utils/train_eval.evaluate.
- Augmentations:
  - CPU transforms: edit utils/transforms.py.
  - GPU batch transforms: implement in utils/gpu_transforms.py and enable in utils/runner.py.
- Resuming training:
  - Checkpoints contain model or optimizer or scheduler states; loading logic is not wired yet. To add resume, read a checkpoint in run_experiment before training starts and restore states.
- Distributed or multi GPU:
  - Not currently implemented. You can introduce DDP in utils/runner.py and adapt DataLoaders or samplers accordingly.


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
