# Unified Training Platform — Dashboard Technical Spec (MVP → v1.0)

> Goal: give Codex a crisp, end‑to‑end blueprint to implement a web dashboard that orchestrates, schedules, and inspects training experiments that use the existing codebase (configs + `utils.runner.run_experiment`).

---

## 0) Scope

### In‑scope (MVP)
- Create/read/update experiments through the UI (parity with flat `TrainConfig`).
- Group experiments into **Projects** and **Experiment Groups**; taggable categories.
- Select **target node** and **GPU(s)** per run; validate availability before enqueue.
- Push runs to a queue and execute via Docker agents (NVIDIA runtime).
- Live run console: stdout/stderr tail, current step/epoch, ETA, monitored metric.
- Persist runs, metrics, artifacts, logs, and checkpoints in DB + object store.
- Embed **TensorBoard** per run and per project (multi-run) inside the dashboard.
- User auth (local + OAuth), RBAC (Admin, Editor, Viewer).

### Near‑term (v1.0)
- Recurring schedules (cron-like) and conditional triggers (e.g., new data snapshot).
- Basic resource scheduling (fair-share, FIFO with priorities, GPU memory guardrails).
- Pluggable augmentation presets (CPU/GPU) and transform catalog with validation.
- Dataset registry (ImageFolder roots) with class maps preview + dataset health checks.

### Out‑of‑scope (for now)
- Distributed training (DDP/K8s); pipeline components beyond single-GPU runs.
- Arbitrary remote code upload; we run the **existing repo** in containers.

---

## 1) Architecture Overview

**Topology**
- **Web App (Next.js/TypeScript)** → UX, auth, embeds TensorBoard, websockets.
- **API Server (FastAPI/Python)** → CRUD, validation, REST + WebSocket, authZ.
- **Scheduler (service in API process)** → dequeues jobs, assigns to agents, tracks lifecycle.
- **Agent(s) (Python, runs in each compute node)** → executes jobs inside Docker with NVIDIA runtime, reports heartbeats and GPU inventory.
- **DB (PostgreSQL)** → source of truth for users, projects, configs, runs, metrics.
- **Queue (Redis)** → job queue and pub/sub for run logs.
- **Object Storage (S3‑compatible or local FS)** → checkpoints, figures, artifacts.
- **TensorBoard Manager (sidecar service)** → spawns TB instances and proxies them via the API (iframe‑safe).

**Key principles**
- **Configuration as data**: `TrainConfig` represented as JSON Schema; server renders Python config file on execution (to keep code parity).
- **Stateless agents**: agents pull work, execute, stream logs, and upload artifacts; no business logic in agents beyond execution.
- **Idempotent runs**: a run has immutable config; reruns produce new run rows with lineage to the source config.

---

## 2) Data Model (DB Schema)

> PostgreSQL with SQLAlchemy models. All tables have `id (UUID)`, `created_at`, `updated_at`.

### Core
- **users**: email (unique), name, auth_provider, role {admin|editor|viewer}.
- **projects**: name (unique per owner/org), description.
- **experiment_groups**: project_id ↦ projects, name, description, tags (jsonb string[]).
- **datasets**: project_id, name, root_path, split_layout (train/val/test presence), class_map (jsonb), sample_stats (jsonb).
- **models**: project_id, label, hf_checkpoint_id, notes, default_pretrained (bool).
- **augmentations**: project_id, name, type {cpu|gpu}, params (jsonb), enabled (bool), version.

### Configs & Runs
- **train_configs**: project_id, group_id, name, `config_json` (validated against schema), version, status {draft|ready}, hash (content hash for versioning).
- **schedules**: config_id, cron (text) or RRULE, timezone, enabled, priority.
- **runs**: project_id, config_id, group_id, name (resolved run name), state {draft|scheduled|queued|running|succeeded|failed|canceled|stopping|stopped}, monitor_metric, monitor_mode, best_value (numeric), epoch, step, started_at, finished_at, agent_id, docker_image, seed, log_dir, ckpt_dir.
- **run_metrics**: run_id, step_or_epoch, key, value, split {train|val|test}, unique (run_id, step_or_epoch, key, split).
- **artifacts**: run_id, kind {checkpoint|figure|tensorboard|log|other}, path (object key/URI), size_bytes, sha256, metadata (jsonb), is_best (bool).
- **events**: actor_type {user|system|agent}, actor_id, verb, subject_type {run|config|project|dataset}, subject_id, payload (jsonb).

### Infra
- **agents**: name, host, labels (jsonb), last_heartbeat_at, api_version, runner_version.
- **gpus**: agent_id, index, uuid, name, total_mem_mb, compute_capability, is_allocated (derived), last_seen_at.
- **jobs**: run_id, queue_id, enqueued_at, dequeued_at, retries, last_error, priority.
- **tb_sessions**: run_id or project_id, pid, port, base_url, status {starting|ready|stopped}, last_ping.

Indexes: `(project_id, name)`, `(run_id, key)`, `(agent_id, index)`, GIN on jsonb columns.

---

## 3) TrainConfig JSON Schema (server‑side)

- Derive from `utils/config.TrainConfig`. Keep names identical.
- Validate incoming configs with `pydantic` + JSON Schema.
- Persist canonical `config_json`. On execution, render a temporary Python file that imports `TrainConfig` and writes a `training_configurations/examples.py` stub for the run (or pass a `--config-json` to a new `main.py` path that accepts JSON).

**Example (abridged) JSON shape**
```json
{
  "data": {
    "root": "/datasets/catsdogs",
    "batch_size": 64,
    "num_workers": 8,
    "prefetch_factor": 2,
    "persistent_workers": true,
    "max_datapoints_per_class": null
  },
  "model": {
    "model_flavour": "google/vit-base-patch16-224",
    "load_pretrained": true,
    "freeze_backbone": false
  },
  "optimization": {
    "optimizer": "adamw",
    "lr": 5e-4,
    "weight_decay": 0.05,
    "max_grad_norm": 1.0,
    "warmup_ratio": 0.05,
    "grad_accum_steps": 2,
    "epochs": 20,
    "autocast_dtype": "bfloat16",
    "seed": 1337
  },
  "logging": {
    "run_name": null,
    "tb_root": "experiments/logs",
    "ckpt_dir": "experiments/checkpoints",
    "eval_topk": [1, 5],
    "monitor_metric": "val_acc@1",
    "monitor_mode": "max",
    "save_per_epoch_checkpoint": false,
    "model_suffix": ""
  }
}
```

---

## 4) REST & WebSocket API (contract)

Base: `/api/v1`

### Auth
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- OAuth providers: GitHub/Google (OIDC) via NextAuth/Passport equivalent. Tokens: JWT w/ short TTL + refresh.

### Projects & Groups
- `GET/POST /projects`, `GET/PUT/DELETE /projects/{id}`
- `GET/POST /projects/{id}/groups`, `GET/PUT/DELETE /groups/{id}`

### Datasets/Models/Augmentations
- `GET/POST /projects/{id}/datasets`
- `GET/POST /projects/{id}/models`
- `GET/POST /projects/{id}/augmentations`

### Configs & Schedules
- `GET/POST /projects/{id}/configs`
- `GET/PUT/DELETE /configs/{id}`
- `POST /configs/{id}/validate` → returns normalized config + warnings.
- `POST /configs/{id}/schedule` (body: cron, tz, priority)

### Runs
- `POST /configs/{id}/runs` (body: agent_id, gpu_indices[], docker_image?, env[], priority?)
- `GET /runs?project_id=&state=&query=`
- `GET /runs/{id}` → includes flattened `config_json`, resolved paths.
- `POST /runs/{id}/cancel`, `POST /runs/{id}/stop`
- `GET /runs/{id}/metrics?keys=val_acc@1,val_loss&granularity=epoch`
- `GET /runs/{id}/artifacts`
- `GET /runs/{id}/logs?tail=500` (http)
- `WS /runs/{id}/stream` → realtime logs + metric scalars.

### Infra
- `GET /agents` (includes GPU inventory and utilization snapshot)
- `POST /agents/refresh` (ask agents to re-discover GPUs)
- `GET /tensorboard/run/{run_id}` → reverse proxy URL for iframe
- `GET /tensorboard/project/{project_id}` → aggregated logdirs

**Error model**: JSON with `code`, `message`, `details`.

---

## 5) Agent & Execution Flow

1. **Agent registration** on startup:
   - POST `/agents/register` with host info, labels, GPUs (`nvidia-smi --query-gpu=index,uuid,name,memory.total,compute_cap --format=csv,noheader`).
   - Heartbeat every 5 seconds: free/used GPU mem, running PIDs, process health.

2. **Scheduling** (API service):
   - On `POST /configs/{id}/runs`, create `runs` row (state=`queued`) and enqueue job in Redis with payload: run_id, docker_image, agent constraint (optional), gpu_indices.
   - FIFO by priority, per-project fair-share (optional for v1.0).

3. **Agent consumes job** (only if agent label/ID matches):
   - Reserve GPU devices (set `CUDA_VISIBLE_DEVICES` to requested indices).
   - Check dataset roots exist and have splits, else fail fast with clear error.
   - Create ephemeral working dir: `/runs/{run_id}`.
   - **Materialize config**: write `config.json` + a tiny `examples.py` if needed; or call `python main.py --config /runs/{run_id}/config.json` (add a CLI path in repo for JSON acceptance — trivial adapter).
   - Start container with NVIDIA runtime, bind mounts:
     - Repo image: `unified-train:latest` (or configurable).
     - Mount dataset roots read‑only.
     - Mount `/runs/{run_id}` read‑write.
     - Mount project `experiments/logs` and `experiments/checkpoints` dirs.
   - Stream stdout/stderr → Redis pubsub → WebSocket to clients; also persist to `artifacts`.
   - Emit metrics by tailing TensorBoard event files (optional) or by instrumenting training loop to also `POST` scalars.

4. **Completion**
   - Detect process exit status; update `runs.state` (`succeeded`/`failed`).
   - Upload artifacts (best checkpoint, figures) to object storage and register rows.

5. **Cancel/Stop**
   - API sets state `stopping` and signals agent; agent sends SIGTERM to container; after timeout sends SIGKILL.

**Docker runtime**
- Base image installs: torch/transformers/torchmetrics/tensorboard/kornia + your repo.
- Entrypoint: `python main.py --config /runs/{run_id}/config.json`.
- NVIDIA: `--gpus "device=IDX,IDX2"`.

---

## 6) GPU Selection & Resource Guardrails

- **UI**: when creating a run, show available agents with GPU list and live free memory; allow selecting one or more GPU indices. Default single GPU.
- **Validation**: require `batch_size` × estimated activation size ≤ free mem. For MVP, heuristic by model family (table of footprints) + user override "force run" checkbox.
- **Reservation**: agent marks chosen GPU indices as allocated for run duration; prevents double-scheduling.

---

## 7) TensorBoard Embedding

- **TB Manager** service starts TB with `--logdir_spec`:
  - Per‑run: `RUN=<run_log_dir>`.
  - Per‑project: `GROUP1=logs/…/groupA, GROUP2=…` (optional).
- Expose TB on an ephemeral local port; API reverse‑proxies to `/tb/run/{id}/` so it’s iframe‑safe and behind auth.
- Auto‑shutdown TB instance after N minutes of inactivity.
- Add a "Open in new tab" link.

---

## 8) Frontend (Next.js) — Pages & UX

- **/login** — OAuth or email+magic code.
- **/projects** — list, create.
- **/projects/:id/overview** — recent runs, datasets, models, TB embed (multi‑run).
- **/projects/:id/configs** — table + JSON/visual editor for `TrainConfig`; diff & versioning; validation panel.
- **/projects/:id/runs** — filterable runs; states; bulk actions (cancel/clone).
- **/runs/:id** — header (state, metric, duration), live logs (ansi), metrics charts (acc@1, loss, f1), artifacts list, TB iframe tab, config tab (read‑only), hardware tab (agent, GPUs).
- **/agents** — nodes & GPUs with utilization and running runs.
- **/datasets** — registered datasets; browse classes; quick sanity thumbnails.
- **/augmentations** — catalog of presets; enable/disable; preview transform chain (static sample image).

**UI components**: shadcn/ui, recharts for charts; websockets for live updates.

---

## 9) Implementation details & integration with existing codebase

- Add a **JSON config entry path** to `main.py`:
  - `--config` accepts either a Python module path (status quo) or a JSON file. If JSON, parse into `TrainConfig` (reuse `utils/config.py`), then call `utils.runner.run_experiment(cfg)`.
- **Run naming**: keep `utils/experiments.py` logic. Server may pass an optional suffix; collision‑free versioning remains inside the training code to avoid drift.
- **Metrics emission**: minimal change — in `utils/tb.py` or `utils/train_eval.py`, also emit key scalars via a tiny `requests.post` to `/api/v1/runs/{id}/metrics` (optional). Otherwise, the server reads TB event files post‑hoc for the UI charts.
- **Artifacts layout**: unchanged (`experiments/logs/...`, `experiments/checkpoints/...`). Agents register discovered files to the API after each epoch.

---

## 10) Security & Permissions

- RBAC at project level. Editors can create configs/runs; viewers read-only.
- Signed download URLs for artifacts (if using S3); streaming logs require auth.
- CSRF for cookie auth; JWT for API; CORS restricted to dashboard origin.
- Validate path traversal on dataset roots; only allow admin-registered dataset paths.

---

## 11) Observability & Ops

- Structured logs (JSON) for API, Scheduler, Agents.
- Health endpoints: `/healthz`, `/readyz`.
- Metrics: Prometheus scrape (requests/sec, job durations, queue depth, agent heartbeats).
- Alerts: no heartbeat > 30s, queue > threshold, job failures.

---

## 12) Dev Environment

- `docker-compose` services: `web`, `api`, `scheduler` (part of `api`), `agent` (optional for local GPU), `redis`, `postgres`, `minio`, `tb-manager`.
- Seed script: creates sample project, dataset, and a couple configs.
- Fixtures: mock agent (CPU only) for CI.

---

## 13) Milestones & Acceptance Criteria

### Milestone A — Scaffolding (1–2 weeks)
- ✅ Repos: `dashboard-web`, `dashboard-api`, `agent` with shared `proto` package (pydantic models).
- ✅ Auth working; projects CRUD.
- ✅ TrainConfig schema + validation endpoint.

**Acceptance**: create a config via UI; validation returns success.

### Milestone B — Runs (2 weeks)
- ✅ Create a run with chosen agent/GPU; job enqueued; agent executes; logs stream; state transitions; artifacts recorded.

**Acceptance**: run finishes on a real GPU; best checkpoint appears in UI.

### Milestone C — TensorBoard Embed (3–4 days)
- ✅ TB Manager spawns per‑run instance; iframe visible under run page; secure proxy.

**Acceptance**: user sees scalars/images/confusion matrix in embedded TB.

### Milestone D — Groups, Tags, Filters (3–4 days)
- ✅ Experiment groups; tags; filterable runs page; bulk cancel/clone.

**Acceptance**: user filters by tag and clones a run into a new one.

### Milestone E — Scheduling & Recurrence (1 week)
- ✅ Cron schedules; priority queue; fair‑share (per project).

**Acceptance**: scheduled run starts automatically when window opens.

---

## 14) Tech Stack Choices (opinionated)

- **Frontend**: Next.js (App Router), TypeScript, shadcn/ui, Zustand, Recharts, TanStack Query, WebSocket client.
- **Backend**: FastAPI, Uvicorn, SQLAlchemy 2.0, Alembic, Pydantic v2, Redis (rq/arq) or Celery+rabbitmq (later), MinIO SDK or boto3, Authlib (OIDC).
- **Agent**: Python 3.11, `docker` SDK, `nvidia-ml-py` for telemetry, `watchdog` for artifact discovery.
- **Container**: NVIDIA Container Toolkit, base image `pytorch/pytorch:2.4.x-cuda12.1-cudnn8-devel` + your repo.

---

## 15) Edge Cases & Validation Rules

- Dataset root must exist and contain `train` + `val`. If `test` missing, disable test metrics.
- Class maps must match discovered classes; mismatch ⇒ warning with auto-remap option.
- Invalid `eval_topk` values (non‑positive or > num_classes) ⇒ validation error.
- `autocast_dtype` limited to {bfloat16,float16,float32}; if GPU lacks bfloat16 support, fallback with warning.
- Weight decay exclusions enforced in UI (read‑only preview from server logic).
- Monitor metric must exist in computed metrics; else default to `val_acc@1`.

---

## 16) Nice‑to‑have (Post‑v1)

- Compare runs (side‑by‑side diff of configs + metrics + figures).
- Notebook export (render a summary notebook per run).
- Model registry with promotion stages (Staging/Production) and signatures.
- Webhooks/Slack notifications on run completion or failure.
- Canary agents and sandbox runs.

---

## 17) Open TODOs in the training repo (small changes)

- [ ] Add `--config` flag to `main.py` to accept a JSON file and bypass `examples.py`.
- [ ] Optional metrics POST hook in `utils/train_eval.py` (behind env var).
- [ ] Ensure `utils/experiments.py` exposes a pure function for run name resolution that the API can call for previews.
- [ ] Emit confusion matrix & ROC figure filenames in a sidecar JSON for artifact registration.

---

## 18) Reference Directory Layout (agent runtime)

```
/runs/{run_id}/
  config.json
  workdir/
experiments/
  logs/{DATASET}/{RUN_NAME}/
  checkpoints/{DATASET}/{RUN_NAME}/
```

---

## 19) Risk Register

- TB iframe embedding + CSP: solved by reverse proxying under same origin.
- GPU mem estimation inaccuracies: allow override; surface OOM suggestions.
- Dataset path leakage: restrict to admin-registered paths; never accept arbitrary mounts.

---

## 20) Example Job Payload (Redis)

```json
{
  "run_id": "2c0a7dd3-...",
  "agent_id": "gpu-node-01",
  "gpu_indices": [0],
  "docker_image": "unified-train:latest",
  "env": {"WANDB_DISABLED": "true"},
  "config_json_path": "/runs/2c0a7dd3/config.json"
}
```

---

## 21) Definition of Done (v1.0)

- A non-admin user can log in, pick a project, create/validate a config, launch a run on a selected GPU, watch logs in realtime, open TensorBoard embed, and download the best checkpoint — without SSHing anywhere or touching code.

