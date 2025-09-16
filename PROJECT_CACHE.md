# ML Training Platform - Project Cache

> **Purpose**: This cache provides agents with a comprehensive understanding of the codebase structure, extension points, and development patterns to quickly identify where and how to add or extend features.

## Quick Architecture Overview

This is a unified ML training platform consisting of:
- **FastAPI Backend** (`src/dashboard/`) - REST API + database management
- **Next.js Frontend** (`web_ui/`) - React dashboard with real-time updates
- **Training Agent** (`src/agent/`) - GPU-bound training executor with clean architecture
- **Common Libraries** (`src/common/`) - Shared training utilities and configs

## 🏗️ Component Architecture Map

### Backend (FastAPI) - `src/dashboard/`
```
app.py                 # Main FastAPI app with CORS, routers, TensorBoard mounting
├── routers/           # Modular API endpoints
│   ├── projects.py    # Project CRUD (top-level container)
│   ├── runs.py        # Training run management + GPU allocation + LIVE LOGS
│   ├── configs.py     # Training configuration management
│   ├── agents.py      # Agent registration and heartbeat
│   ├── datasets.py    # Dataset browsing and management
│   ├── registry_models.py  # HuggingFace model registry
│   ├── augmentations.py    # Data augmentation presets
│   ├── model_testing.py    # Model inference and testing API
│   ├── ws.py          # WebSocket for real-time updates + LOG STREAMING
│   └── tensorboard.py # Embedded TensorBoard integration
├── models.py          # SQLAlchemy database models (PostgreSQL + RunLog)
├── schemas.py         # Pydantic request/response schemas
├── db.py              # Database session management
└── utils.py           # Helper utilities
```

### Frontend (Next.js 15) - `web_ui/`
```
app/                   # App Router pages
├── page.tsx           # Projects dashboard (/)
├── projects/[id]/     # Project detail pages
├── agents/            # Agent management
└── tensorboard/[runId]/ # TensorBoard integration

components/            # React components
├── shell/shell.tsx    # Main layout + responsive sidebar
├── projects/          # Project management UI
├── datasets/          # Dataset viewer and selector
└── ui/               # shadcn/ui components

lib/
├── store.ts          # Zustand UI state (sidebar toggle)
├── query-provider.tsx # TanStack Query setup
└── api.ts            # API client utilities
```

### Training Agent - `src/agent/` (Clean Architecture)
```
server.py             # FastAPI agent server
api/app_factory.py    # Dependency injection setup
domain/models.py      # Core agent domain objects
services/
├── agent_manager.py      # Main agent lifecycle
├── training_executor.py  # Training execution service + LOG CAPTURE
├── gpu_discovery.py      # GPU hardware discovery
├── log_streamer.py       # Real-time log capture and streaming to web UI
└── model_tester.py       # Model inference and checkpoint testing with drag-and-drop
repositories/         # Database interaction layer
```

### Core Training System - `src/common/`
```
config.py            # TrainConfig dataclass (all experiment parameters + PERSISTENT LABELS)
runner.py            # Complete experiment orchestration + label population
train_eval.py        # Training loop + evaluation with metrics + CUSTOM PROGRESS
model.py             # HuggingFace model construction + label mapping
data.py              # ImageFolder datasets + CUDA prefetch
checkpoint.py        # Best model + per-epoch checkpointing
progress_tracker.py  # Custom tqdm replacement for log streaming with rate limiting

registry.py          # Centralized configuration registry
losses.py            # Registry-based loss functions
optimizers.py        # Registry-based optimizers
transforms.py        # CPU augmentation pipeline
gpu_transforms.py    # GPU augmentation pipeline (Kornia)
```

## 📊 Database Schema (SQLAlchemy Models)

**Core Entity Hierarchy:**
```
Project (top-level container)
├── ExperimentGroup (grouping related configs)
├── TrainConfigModel (training configuration)
├── Dataset (project-scoped datasets)
├── ModelRegistry (project-scoped HF models)
└── Augmentation (project-scoped augmentations)

TrainConfigModel → Run (training execution) → Job (queued work)
                           ↓
                      RunLog (real-time logs)
Agent ← GPU (1:1 allocation tracking)
```

**Key Relationships:**
- Projects contain all resources (cascade deletion)
- Runs are created from configs and assigned to agents
- RunLogs capture real-time training output with WebSocket streaming
- GPUs track allocation state for scheduling
- User model exists but auth not implemented

## 🔌 API Structure

```
/api/v1/
├── projects/          # Project CRUD operations
├── groups/            # Experiment grouping
├── configs/           # Training configuration management
├── runs/              # Training run control + monitoring + LIVE LOGS
├── agents/            # Agent registration + heartbeat
├── datasets/          # Dataset management + browsing
├── models/            # HuggingFace model registry
├── augmentations/     # Data augmentation presets
├── registry/          # Configuration registries (losses, optimizers, etc.)
├── model-testing/     # Model inference with drag-and-drop image upload
├── tensorboard/       # TensorBoard lifecycle management
└── ws                 # WebSocket for real-time training updates + log streaming

/tb/                   # Embedded TensorBoard (WSGI mount)
```

## 🎯 Extension Points & Patterns

### Adding New API Endpoints
**Location**: `src/dashboard/routers/`
**Pattern**:
1. Define Pydantic schemas in `schemas.py`
2. Add database models to `models.py` if needed
3. Create router file with CRUD operations
4. Include router in `app.py`
5. Add WebSocket events for real-time updates if needed

**Example**: To add metrics tracking endpoints
```python
# routers/metrics.py
from fastapi import APIRouter
router = APIRouter(prefix="/metrics", tags=["metrics"])

@router.get("/")
async def get_metrics(): ...
```

### Adding New Frontend Pages/Components
**Location**: `web_ui/app/` (pages), `web_ui/components/` (components)
**Pattern**:
1. Add page in `app/` directory (App Router)
2. Create reusable components in `components/`
3. Use TanStack Query for server state
4. Follow shadcn/ui patterns for styling
5. Add navigation link in `shell.tsx`

### Extending Training Pipeline
**Key Files**: `src/common/`
**Extension Points**:
- **New Models**: Add to `registry.py` model registry
- **New Loss Functions**: Extend `losses.py` with registry pattern
- **New Optimizers**: Extend `optimizers.py` with registry pattern
- **New Augmentations**: Add to `transforms.py` or `gpu_transforms.py`
- **New Metrics**: Extend `train_eval.py` evaluation function
- **Custom Training Logic**: Override methods in `runner.py`

**Registry Pattern Example**:
```python
# In losses.py
@register_loss("my_custom_loss")
def build_my_loss(config: dict) -> nn.Module:
    return MyCustomLoss(**config)
```

### Adding New Database Models
**Pattern**:
1. Define SQLAlchemy model in `models.py`
2. Add Pydantic schemas in `schemas.py`
3. Create migration script (see `migrate_hf_token.py`)
4. Add API endpoints following CRUD patterns
5. Update frontend to consume new endpoints

### Extending Agent Capabilities
**Location**: `src/agent/`
**Clean Architecture Pattern**:
1. Add domain models in `domain/`
2. Implement services in `services/`
3. Add repository methods in `repositories/`
4. Register new routes in app factory
5. Update agent manager for orchestration

## 🛠️ Development Patterns

### Backend Patterns
- **FastAPI Routers**: Modular endpoint organization with dependency injection
- **SQLAlchemy ORM**: Declarative base with UUID primary keys, relationship mapping
- **Pydantic Validation**: Strong request/response schema validation
- **Registry Pattern**: Centralized configuration management (`registry.py`)
- **Repository Pattern**: Clean data access layer (in agent)
- **Factory Pattern**: Dependency injection for testability

### Frontend Patterns
- **React Hooks**: Functional components with custom hooks
- **Compound Components**: shadcn/ui component composition
- **Server State**: TanStack Query for caching and synchronization
- **Form Handling**: Controlled components with validation
- **Error Boundaries**: Graceful error handling with enhanced error parsing
- **WebSocket Integration**: Real-time training updates and log streaming
- **Drag-and-Drop**: File upload with visual feedback (model testing)

### State Management
- **Frontend UI State**: Zustand for simple UI state (sidebar visibility)
- **Server State**: TanStack Query for API data with caching/invalidation
- **Real-time Updates**: WebSocket connection for training metrics and live logs

## 🔧 Key Configuration Files

### Environment Variables
```bash
# Backend
DASHBOARD_DB_URL="postgresql+psycopg2://..."
DASHBOARD_CORS_ORIGINS="http://localhost:3000"
TB_IDLE_TIMEOUT=300

# Frontend
NEXT_PUBLIC_API_BASE="http://localhost:8000/api/v1"

# Agent
GPU_INDEX=0
DATASETS_DIR="/app/datasets"
AGENT_ID="agent-gpu-0"
```

### Docker Services
- **Production**: `docker-compose.yml`
- **Development**: `docker-compose.dev.yml` (hot reload)
- **Services**: PostgreSQL, Backend, Frontend, Agent, Nginx

### Data Structure Requirements
```
datasets/
└── DATASET_NAME/
    ├── train/CLASS_NAME/*.jpg
    ├── val/CLASS_NAME/*.jpg
    └── test/CLASS_NAME/*.jpg (optional)
```

## 🚀 Development Workflow

### Development Commands
```bash
# Backend (FastAPI)
uvicorn src.dashboard.app:app --host 0.0.0.0 --port 8000 --reload

# Frontend (Next.js)
cd web_ui && npm run dev

# Full stack with Docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Type checking
cd web_ui && npm run typecheck
```

### Adding New Features - Checklist

**For Training Features:**
- [ ] Update `TrainConfig` in `src/common/config.py` (includes label persistence)
- [ ] Add to appropriate registry in `src/common/registry.py`
- [ ] Update Pydantic schemas in `src/dashboard/schemas.py`
- [ ] Create/update API endpoints
- [ ] Add frontend components for configuration
- [ ] Consider progress tracking and log streaming integration
- [ ] Test with Docker development environment

**For UI Features:**
- [ ] Create components in `web_ui/components/`
- [ ] Add pages in `web_ui/app/`
- [ ] Integrate with TanStack Query for data fetching
- [ ] Add navigation links in `shell.tsx`
- [ ] Follow shadcn/ui patterns for consistency
- [ ] Implement proper error handling with user-friendly messages
- [ ] Consider WebSocket integration for real-time updates

**For Database Changes:**
- [ ] Add models to `src/dashboard/models.py`
- [ ] Create migration script
- [ ] Update Pydantic schemas
- [ ] Create API endpoints
- [ ] Update frontend to consume new data

## 🎨 UI Component Library

**Base**: shadcn/ui (Radix UI primitives + Tailwind CSS)
**Key Components**:
- `ui/button.tsx` - Action buttons
- `ui/table.tsx` - Data tables with sorting
- `ui/dialog.tsx` - Modal dialogs
- `ui/form.tsx` - Form components with validation
- `ui/badge.tsx` - Status indicators
- `ui/tabs.tsx` - Tabbed interfaces

## 🔍 Common File Modification Targets

| Feature Type | Key Files to Modify |
|--------------|---------------------|
| New Training Config | `config.py`, `schemas.py`, `registry.py`, frontend forms |
| New Model Support | `registry.py`, `model.py`, frontend model selector |
| New API Endpoint | `routers/`, `app.py`, frontend API client |
| New UI Page | `web_ui/app/`, `components/`, `shell.tsx` navigation |
| Database Schema | `models.py`, migration script, `schemas.py`, API endpoints |
| Training Pipeline | `runner.py`, `train_eval.py`, `progress_tracker.py`, registry files |
| Agent Capability | `agent/services/`, `agent/domain/`, API routes |
| Log Streaming | `log_streamer.py`, `routers/runs.py`, WebSocket client |
| Model Testing | `model_tester.py`, `routers/model_testing.py`, frontend dialog |

## 🐛 Error Handling & Testing

**Current State**: No formal test suite
**Patterns**: HTTPException (backend), Enhanced error parsing + user-friendly UI (frontend)
**Error Handling**: Comprehensive error parsing in API client, graceful model testing failures
**Recommended**: pytest (backend), Jest + Testing Library (frontend)

## 🔐 Authentication

**Current State**: User model exists, no active authentication
**Extension Point**: Add FastAPI middleware + frontend auth context providers

## 🚀 Recent Feature Additions

### Label Persistence System
- **TrainConfig Enhancement**: Added `class_labels`, `label2id`, `id2label` fields for persistent label storage
- **Training Pipeline**: Modified `runner.py` to populate labels before saving configurations
- **Purpose**: Enables model testing and inference by preserving dataset label mappings with checkpoints

### Real-time Log Streaming
- **RunLog Model**: New database model for storing timestamped training logs
- **LogStreamer Service**: Captures stdout/stderr with WebSocket broadcasting to web UI
- **Progress Tracking**: Custom progress tracker with tqdm filtering and rate limiting
- **WebSocket Integration**: Live log updates in training dashboard with proper async handling

### Model Testing Feature
- **ModelTester Service**: Drag-and-drop image testing against trained checkpoints
- **API Endpoints**: Complete model testing API with file upload and inference
- **Frontend Integration**: Modal dialog with drag-and-drop, prediction display, and error handling
- **Checkpoint Loading**: Automatic model reconstruction from saved configs and weights

### Enhanced Error Handling
- **API Client**: Improved error parsing for FastAPI validation errors and detail messages
- **User Experience**: User-friendly error messages instead of raw JSON responses
- **Visual Feedback**: Better error states in model testing and form validation

---

**Last Updated**: Comprehensive update including all recent feature implementations
**Usage**: Provide this cache to agents for quick project understanding and feature extension guidance