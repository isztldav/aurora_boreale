# 🚀 ML Training Platform v2

A modern, unified platform for reproducible machine learning experiments focused on supervised image classification using Hugging Face Transformers. Features clean architecture, real-time monitoring, and comprehensive ML experiment management.

![Platform Architecture](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi) ![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white) ![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)

## ✨ Features

### 🎯 Core Capabilities
- **🗂️ Project Management**: Organize experiments into projects with experiment groups
- **⚙️ Visual Config Builder**: Registry-based training configuration with real-time validation
- **🔥 GPU Management**: Automatic GPU discovery, allocation, and multi-agent support
- **📊 Real-time Monitoring**: Live training logs and metrics via WebSocket streaming
- **📈 TensorBoard Integration**: Embedded TensorBoard instances with automatic lifecycle management
- **🧪 Model Testing**: Drag-and-drop image testing against trained checkpoints with inference visualization
- **🏷️ Label Persistence**: Automatic dataset label mapping preservation for reproducibility

### 🔧 Technical Highlights
- **🏗️ Clean Architecture**: Modular design with clear separation between core ML and platform infrastructure
- **🔌 Extensible Registry System**: Plugin architecture for models, optimizers, losses, and augmentations
- **⚡ Real-time Log Streaming**: Custom progress tracking with WebSocket broadcasting
- **🔄 Hot Reload Development**: Fast iteration with Docker Compose development environment
- **📦 Production Ready**: Comprehensive structured logging, error handling, and containerized deployment
- **🎯 Zero External Dependencies**: Pure ML core with no platform coupling

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Nginx       │◄──►│   Next.js UI    │◄──►│  FastAPI API    │◄──►│ Training Agent  │
│ Reverse Proxy   │    │  (Port 3000)    │    │  (Port 8000)    │    │ (GPU Executor)  │
│  (Port 8080)    │    │   shadcn/ui     │    │  + TensorBoard  │    │ Clean Arch      │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │                       │
         └───────────────────────┼───────────────────────┼───────────────────────┘
                                 └───────────────────────┼───────────────────────┘
                                                         ▼
                                              ┌─────────────────┐
                                              │   PostgreSQL    │
                                              │   Database      │
                                              │   (Centralized) │
                                              └─────────────────┘
                                                         ▲
                                              ┌─────────────────┐
                                              │   Core ML       │
                                              │   Engine        │
                                              │ (Pure ML Logic) │
                                              └─────────────────┘
```

### Component Overview
- **🌐 Nginx**: Reverse proxy serving the unified platform on port 8080
- **⚛️ Frontend**: Next.js 15 with TypeScript, Tailwind CSS, shadcn/ui components, and real-time WebSocket updates
- **🚀 Backend**: FastAPI REST API with embedded TensorBoard, WebSocket streaming, and comprehensive logging
- **🤖 Agent**: GPU-bound training executor with clean architecture (domain/services/repositories pattern)
- **🧠 Core ML Engine**: Pure ML training logic with Hugging Face Transformers integration and no external dependencies
- **🗄️ Database**: PostgreSQL with centralized SQLAlchemy models and automated schema management
- **🔌 Shared Infrastructure**: Common database models, schemas, and utilities shared across services

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- NVIDIA Docker runtime (for GPU support)
- 8GB+ RAM recommended

### 1. Clone and Setup
```bash
git clone <repository-url>
cd web_training_platform
```

### 2. Prepare Your Dataset
Organize your image dataset in ImageFolder structure:
```
datasets/
└── your_dataset/
    ├── train/
    │   ├── class1/*.jpg
    │   └── class2/*.jpg
    ├── val/
    │   ├── class1/*.jpg
    │   └── class2/*.jpg
    └── test/ (optional)
        ├── class1/*.jpg
        └── class2/*.jpg
```

### 3. Launch Platform
```bash
# Development mode (with hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production mode
docker compose up
```

### 4. Access the Platform
- **Dashboard**: http://localhost:8080 (nginx reverse proxy)
- **API Docs**: http://localhost:8000/docs
- **TensorBoard**: Embedded in dashboard or http://localhost:8000/tb/

## 📖 Usage Guide

### Creating Your First Project

1. **Create Project**: Navigate to the dashboard and create a new project
2. **Add Dataset**: Register your dataset using the dataset browser
3. **Configure Training**: Use the visual config builder to set up your experiment
4. **Start Training**: Launch training and monitor progress in real-time
5. **Test Model**: Use drag-and-drop testing once training completes

### Training Configuration

The platform supports extensive configuration options:

```yaml
# Example training config
model_flavour: "microsoft/resnet-50"
batch_size: 32
epochs: 10
learning_rate: 0.001
optimizer: "adamw"
loss_function: "cross_entropy"
freeze_backbone: false
load_pretrained: true
```

### GPU Management

- Agents automatically discover available GPUs
- Training jobs are queued and allocated to free GPUs
- Multiple agents can run on different GPUs simultaneously

## 🛠️ Development

### Local Development Setup

1. **Backend Development**:
```bash
# Set environment variables
export DASHBOARD_DB_URL="postgresql+psycopg2://user:pass@localhost:5432/dashboard"
export PYTHONPATH=./src

# Run with hot reload
uvicorn src.dashboard.app:app --host 0.0.0.0 --port 8000 --reload
```

2. **Frontend Development**:
```bash
cd web_ui
npm install
npm run dev  # Starts on port 3000
```

3. **Database Setup**:
```bash
# Start PostgreSQL
docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15

# Database will be auto-initialized by the backend
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_DB_URL` | - | PostgreSQL connection string |
| `DASHBOARD_CORS_ORIGINS` | `http://localhost:3000` | Allowed CORS origins |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8000/api/v1` | API base URL |
| `NGINX_PORT` | `8080` | Nginx reverse proxy port |
| `GPU_INDEX` | `0` | GPU device index for agent |
| `DATASETS_DIR` | `/app/datasets` | Dataset mount location |

### Project Structure

```
src/
├── dashboard/              # FastAPI backend service
│   ├── app.py             # Main FastAPI app with CORS and routing
│   ├── routers/           # Modular API endpoints (projects, runs, configs, etc.)
│   └── tensorboard.py     # Embedded TensorBoard WSGI integration
├── agent/                 # Training agent service (Clean Architecture)
│   ├── server.py          # FastAPI agent server
│   ├── api/               # Application factory and dependency injection
│   ├── domain/            # Core domain models
│   ├── services/          # Business logic (training executor, log streamer)
│   └── repositories/      # Data access layer
├── core/                  # Pure ML training engine (zero external dependencies)
│   ├── config.py          # TrainConfig dataclass with label persistence
│   ├── training/          # Training pipeline (runner, train_eval, model)
│   ├── data/              # Data handling (datasets, transforms, GPU transforms)
│   └── utils/             # Pure utilities (checkpoint, registry, progress tracker)
└── shared/                # Shared infrastructure
    ├── database/          # Centralized database management
    │   ├── models.py      # All SQLAlchemy models
    │   ├── connection.py  # Session management and init_db()
    │   └── schemas.py     # Pydantic request/response schemas
    ├── logging/           # Unified structured logging system
    └── types/             # Shared type definitions

web_ui/                    # Next.js frontend
├── app/                   # App Router pages
│   ├── projects/[id]/     # Project detail pages
│   └── tensorboard/[runId]/ # Embedded TensorBoard
├── components/            # React components
│   ├── shell/             # Main layout with responsive sidebar
│   ├── projects/          # Project management UI
│   └── ui/                # shadcn/ui components
└── lib/                   # Utilities and hooks
    ├── store.ts           # Zustand UI state management
    ├── query-provider.tsx # TanStack Query setup
    └── api.ts             # API client with enhanced error handling

main.py                    # Standalone training entry point
docker-compose.yml         # Production container orchestration
docker-compose.dev.yml     # Development with hot reload
```

## 🧪 Testing

```bash
# Frontend type checking and linting
cd web_ui
npm run typecheck  # TypeScript validation
npm run lint       # ESLint code quality checks

# Backend type checking (optional)
mypy src/          # Python type hint validation

# Standalone ML training
python main.py --config path/to/config.json

# Integration testing (when implemented)
pytest tests/      # Full test suite
```

### Quality Assurance
- **Type Safety**: Full TypeScript frontend + Python type hints
- **Code Quality**: ESLint, Prettier for consistent formatting
- **Error Handling**: Comprehensive error boundaries and user-friendly messages
- **Logging**: Structured logging with no silent exception handling
- **Architecture**: Clean separation prevents tight coupling and improves testability

## 📦 Deployment

### Production Deployment

1. **Build Images**:
```bash
docker compose build
```

2. **Configure Environment**:
```bash
# Create .env file
DASHBOARD_DB_URL=postgresql+psycopg2://user:pass@db:5432/dashboard
DASHBOARD_CORS_ORIGINS=https://yourdomain.com
```

3. **Deploy**:
```bash
docker compose up -d
```

### Scaling

- **Multiple Agents**: Run agents on different GPUs/machines
- **Load Balancing**: Use nginx for frontend load balancing
- **Database**: Use managed PostgreSQL for production workloads

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes following the existing patterns
4. Test your changes thoroughly
5. Submit a pull request

### Development Guidelines

- Follow existing code style and patterns
- Use the registry system for extensible components
- Add comprehensive error handling
- Update documentation for new features
- Test with Docker development environment

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📚 Documentation

- **Technical Guide**: `CLAUDE.md` - Comprehensive development guide and architecture details
- **Architecture Cache**: `PROJECT_CACHE.md` - Complete codebase structure and extension patterns
- **API Documentation**: http://localhost:8000/docs - Interactive FastAPI documentation
- **Component Library**: Built with [shadcn/ui](https://ui.shadcn.com/) - Modern, accessible React components

## 🆘 Support

- **🐛 Issues**: Report bugs and request features via GitHub Issues
- **💬 Discussions**: Architecture questions and feature discussions
- **📖 Wiki**: Additional guides and tutorials (coming soon)
- **🔧 Development**: See documentation files for detailed technical guidance

## 🌟 Key Features Highlight

### Latest Updates
- **🏗️ Clean Architecture Refactoring**: Complete separation of core ML logic from platform infrastructure
- **📊 Real-time Log Streaming**: Live training logs with WebSocket broadcasting and custom progress tracking
- **🧪 Model Testing Interface**: Drag-and-drop image testing with inference visualization
- **🏷️ Label Persistence System**: Automatic dataset label mapping preservation for reproducibility
- **📋 Comprehensive Logging**: Structured logging system with no silent exception handling
- **🔧 Enhanced Error Handling**: User-friendly error messages and graceful failure handling

## 🙏 Acknowledgments

- **🤗 [Hugging Face Transformers](https://huggingface.co/transformers/)** - Pre-trained model ecosystem
- **🎨 [shadcn/ui](https://ui.shadcn.com/)** - Beautiful, accessible React components
- **⚡ [FastAPI](https://fastapi.tiangelo.com/)** - Modern, fast Python web framework
- **⚛️ [Next.js](https://nextjs.org/)** - Full-stack React framework
- **🔍 [TanStack Query](https://tanstack.com/query)** - Powerful data synchronization
- **🐻 [Zustand](https://zustand-demo.pmnd.rs/)** - Lightweight state management
- **🎯 [TensorBoard](https://www.tensorflow.org/tensorboard)** - ML experiment visualization

---

**🚀 Built for the ML community with modern web technologies and clean architecture principles**