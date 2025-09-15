# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a unified training platform v2 for reproducible, scriptable ML experiments focused on supervised image classification using Hugging Face Transformers models. The architecture consists of three main components:

1. **FastAPI Backend** (`src/dashboard/`) - REST API and database management
2. **Next.js Frontend** (`web_ui/`) - Modern React-based dashboard UI
3. **Training Agent** (`src/agent/`) - GPU-accelerated training execution
4. **Common Libraries** (`src/common/`) - Shared training utilities and configurations

## Architecture

### Backend (FastAPI)
- **Entry point**: `src/dashboard/app.py` - FastAPI application with CORS and router configuration
- **Database**: PostgreSQL with SQLAlchemy ORM (`src/dashboard/models.py`, `src/dashboard/db.py`)
- **API Routes**: Modular routers in `src/dashboard/routers/` for projects, configs, runs, agents, etc.
- **TensorBoard Integration**: Embedded TensorBoard instances with lifecycle management

### Frontend (Next.js)
- **Framework**: Next.js 15 with TypeScript, Tailwind CSS, shadcn/ui components
- **State Management**: Zustand for global state, TanStack Query for server state
- **Real-time Updates**: WebSocket client for live training metrics
- **Key Features**: Project management, config creation, run monitoring, TensorBoard integration

### Training Agent
- **Server**: `src/agent/server.py` - FastAPI agent that polls database for training jobs
- **GPU Management**: Single agent per GPU with device isolation
- **Training Pipeline**: Orchestrated by `src/common/runner.py`

### Core Training System
- **Configuration**: `src/common/config.py` - `TrainConfig` dataclass defines all experiment parameters
- **Data Pipeline**: `src/common/data.py` - ImageFolder datasets with transforms and CUDA prefetch
- **Models**: `src/common/model.py` - HF AutoModelForImageClassification with proper label mapping
- **Training Loop**: `src/common/train_eval.py` - Mixed precision training with comprehensive metrics
- **Checkpointing**: `src/common/checkpoint.py` - Best model and optional per-epoch checkpointing

## Development Commands

### Backend Development
```bash
# Run FastAPI backend with hot reload
uvicorn src.dashboard.app:app --host 0.0.0.0 --port 8000 --reload

# Set environment variables
export DASHBOARD_DB_URL="postgresql+psycopg2://user:pass@localhost:5432/dashboard"
export PYTHONPATH=./src
```

### Frontend Development
```bash
cd web_ui
npm install
npm run dev           # Development server on port 3000
npm run build         # Production build
npm run lint          # ESLint
npm run typecheck     # TypeScript check

# Point to backend API
export NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1
```

### Docker Development
```bash
# Build images (run once or when requirements change)
docker compose build web agent

# Full stack with hot reload
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production deployment
docker compose up
```

### Standalone Training
```bash
# Run experiments from Python configs
python main.py

# Run single experiment from JSON config
python main.py --config path/to/config.json

# View TensorBoard logs
tensorboard --logdir runs
```

## Key Configuration

### Environment Variables
- `DASHBOARD_DB_URL`: PostgreSQL connection string
- `DASHBOARD_CORS_ORIGINS`: Comma-separated allowed origins for CORS
- `NEXT_PUBLIC_API_BASE`: Frontend API base URL
- `DATASETS_DIR`: Dataset mount location for agent (default: `/app/datasets`)
- `GPU_INDEX`: GPU device index for training agent
- `TB_IDLE_TIMEOUT`: TensorBoard instance idle timeout (seconds)

### Data Layout
Datasets must follow ImageFolder structure:
```
ROOT/
├── train/CLASS_NAME/*.jpg
├── val/CLASS_NAME/*.jpg
└── test/CLASS_NAME/*.jpg (optional)
```

### TrainConfig Key Fields
- `root`: Dataset root path
- `model_flavour`: HuggingFace model ID or local path
- `batch_size`, `epochs`, `lr`: Core training hyperparameters
- `load_pretrained`: Use pretrained weights vs train from scratch
- `freeze_backbone`: Train only classifier head
- `monitor_metric`/`monitor_mode`: Checkpointing criteria
- `tb_root`, `ckpt_dir`: Logging and checkpoint directories

## File Structure

```
src/
├── dashboard/          # FastAPI backend
│   ├── app.py         # Main FastAPI app
│   ├── models.py      # SQLAlchemy database models
│   ├── db.py          # Database session management
│   └── routers/       # API route handlers
├── agent/             # Training agent service
│   └── server.py      # Agent FastAPI server
└── common/            # Shared training utilities
    ├── config.py      # TrainConfig dataclass
    ├── runner.py      # Training orchestration
    ├── train_eval.py  # Training loop and evaluation
    ├── model.py       # Model construction
    ├── data.py        # Dataset and DataLoader utilities
    └── checkpoint.py  # Checkpointing utilities

web_ui/               # Next.js frontend
├── app/             # App router pages
├── components/      # React components
└── lib/            # Utilities and hooks

main.py              # Standalone training entry point
docker-compose.yml   # Production container orchestration
```

## Common Development Tasks

### Running Tests
The codebase does not appear to have a formal test suite. Add tests using pytest if needed.

### Linting and Type Checking
Frontend has configured linting:
```bash
cd web_ui && npm run lint && npm run typecheck
```

Backend uses Python type hints - run mypy if needed:
```bash
mypy src/
```

### Database Migrations
Database schema is managed through SQLAlchemy models. Migrations are not currently automated - modify `src/dashboard/models.py` and restart services to recreate tables.

### Adding New Models or Datasets
1. Update dataset registries through the dashboard UI
2. Create TrainConfig entries via API or dashboard
3. Ensure datasets follow ImageFolder structure
4. Verify HuggingFace model compatibility

### TensorBoard Access
TensorBoard instances are embedded in the FastAPI backend and accessible through the dashboard UI. For standalone access:
```bash
tensorboard --logdir runs/
```