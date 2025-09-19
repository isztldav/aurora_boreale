# 🌟 Aurora Boreale

> **A modern, unified platform for reproducible machine learning experiments**

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Aurora Boreale is a production-ready machine learning platform designed for supervised image classification using Hugging Face Transformers. Built with clean architecture principles, it offers real-time monitoring, GPU management, and comprehensive experiment tracking in a modern web interface.

## ✨ Key Features

### 🎯 **Experiment Management**
- **Project Organization**: Structure experiments with projects and experiment groups
- **Visual Configuration**: Registry-based training setup with real-time validation
- **Label Persistence**: Automatic dataset label mapping for perfect reproducibility

### ⚡ **Training & Performance**
- **GPU Auto-Discovery**: Intelligent GPU allocation and multi-agent support
- **Real-time Monitoring**: Live training logs and metrics via WebSocket
- **Mixed Precision Training**: Optimized training with automatic scaling

### 📊 **Monitoring & Analysis**
- **Embedded TensorBoard**: Integrated visualization with automatic lifecycle management
- **Model Testing**: Drag-and-drop inference testing with visualization
- **Comprehensive Logging**: Structured logging with no silent failures

### 🏗️ **Architecture Excellence**
- **Clean Architecture**: Modular design with clear separation of concerns
- **Extensible Registry**: Plugin system for models, optimizers, losses, augmentations
- **Zero External Dependencies**: Pure ML core with no platform coupling
- **Hot Reload Development**: Fast iteration with Docker Compose

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- NVIDIA Docker runtime (for GPU support)
- 8GB+ RAM recommended

### 1. Setup
```bash
git clone https://github.com/your-org/aurora-boreale.git
cd aurora-boreale
```

### 2. Prepare Dataset
Organize your images in ImageFolder structure:
```
datasets/
└── your_dataset/
    ├── train/
    │   ├── class1/*.jpg
    │   └── class2/*.jpg
    └── val/
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

### 4. Access Platform
- **🌐 Dashboard**: http://localhost:8080
- **📚 API Docs**: http://localhost:8000/docs
- **📊 TensorBoard**: Embedded in dashboard

## 🏗️ Architecture

```mermaid
graph TB
    subgraph "Frontend Layer"
        UI[Next.js UI<br/>shadcn/ui + TailwindCSS]
    end

    subgraph "API Layer"
        API[FastAPI Backend<br/>REST + WebSocket]
        TB[TensorBoard<br/>Embedded]
    end

    subgraph "Training Layer"
        AGENT[Training Agent<br/>GPU Executor]
        CORE[Core ML Engine<br/>Pure ML Logic]
    end

    subgraph "Data Layer"
        DB[(PostgreSQL<br/>Centralized)]
        FILES[Datasets & Logs<br/>File System]
    end

    subgraph "Infrastructure"
        NGINX[Nginx<br/>Reverse Proxy]
    end

    NGINX --> UI
    NGINX --> API
    UI --> API
    API --> TB
    API --> DB
    AGENT --> DB
    AGENT --> CORE
    AGENT --> FILES
    API --> FILES
```

### Component Overview

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | Next.js 15 + TypeScript | Modern React UI with real-time updates |
| **Backend** | FastAPI + SQLAlchemy | REST API with WebSocket streaming |
| **Agent** | Clean Architecture | GPU-bound training executor |
| **Core ML** | Pure Python + HF Transformers | Training engine with zero dependencies |
| **Database** | PostgreSQL | Centralized experiment metadata |
| **Proxy** | Nginx | Unified platform serving |

## 📖 Usage Guide

### Creating Your First Experiment

1. **📁 Create Project**: Set up a new project in the dashboard
2. **📊 Add Dataset**: Register your dataset using the browser
3. **⚙️ Configure Training**: Use the visual config builder
4. **🚀 Start Training**: Launch and monitor in real-time
5. **🧪 Test Model**: Drag-and-drop inference testing

### Training Configuration

The platform supports extensive configuration through the UI or API:

```yaml
# Example configuration
model_flavour: "microsoft/resnet-50"
batch_size: 32
epochs: 10
learning_rate: 0.001
optimizer: "adamw"
loss_function: "cross_entropy"
freeze_backbone: false
load_pretrained: true
monitor_metric: "val_acc@1"
monitor_mode: "max"
```

### GPU Management

- **Auto-Discovery**: Agents automatically find available GPUs
- **Queue Management**: Jobs queued and allocated to free GPUs
- **Multi-Agent**: Multiple agents can run on different GPUs
- **Resource Isolation**: Each agent uses dedicated GPU memory

## 🛠️ Development

### Local Development

**Backend Development:**
```bash
export DASHBOARD_DB_URL="postgresql+psycopg2://user:pass@localhost:5432/dashboard"
export PYTHONPATH=./src
uvicorn src.dashboard.app:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend Development:**
```bash
cd web_ui
npm install
npm run dev  # Starts on port 3000
```

**Database Setup:**
```bash
docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15
# Database auto-initialized by backend
```

### Project Structure

```
├── src/
│   ├── dashboard/          # FastAPI backend service
│   │   ├── app.py         # Main application with CORS/routing
│   │   ├── routers/       # Modular API endpoints
│   │   └── tensorboard.py # TensorBoard integration
│   ├── agent/             # Training agent (Clean Architecture)
│   │   ├── server.py      # Agent FastAPI server
│   │   ├── domain/        # Core domain models
│   │   ├── services/      # Business logic layer
│   │   └── repositories/  # Data access layer
│   ├── core/              # Pure ML engine (zero dependencies)
│   │   ├── config.py      # Training configuration
│   │   ├── training/      # Training pipeline
│   │   ├── data/          # Data handling & transforms
│   │   └── utils/         # Pure utilities
│   └── shared/            # Shared infrastructure
│       ├── database/      # Models & connection management
│       ├── logging/       # Structured logging system
│       └── types/         # Shared type definitions
├── web_ui/                # Next.js frontend
│   ├── app/              # App Router pages
│   ├── components/       # React components
│   └── lib/              # Utilities & hooks
└── docker-compose.yml     # Container orchestration
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_DB_URL` | - | PostgreSQL connection string |
| `DASHBOARD_CORS_ORIGINS` | `http://localhost:3000` | Allowed CORS origins |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8000/api/v1` | API base URL |
| `GPU_INDEX` | `0` | GPU device index for agent |
| `DATASETS_DIR` | `/app/datasets` | Dataset mount location |
| `TB_IDLE_TIMEOUT` | `600` | TensorBoard idle timeout (seconds) |

## 🧪 Testing & Quality

```bash
# Frontend
cd web_ui
npm run typecheck  # TypeScript validation
npm run lint       # ESLint checks

# Backend
mypy src/          # Python type checking
```

### Quality Assurance Features
- **💯 Type Safety**: Full TypeScript + Python type hints
- **🔍 Code Quality**: ESLint + Prettier formatting
- **🛡️ Error Handling**: Comprehensive error boundaries
- **📋 Structured Logging**: No silent exception handling
- **🏗️ Clean Architecture**: Testable, maintainable design

## 📦 Deployment

### Production Deployment

```bash
# 1. Build images
docker compose build

# 2. Configure environment
cat > .env << EOF
DASHBOARD_DB_URL=postgresql+psycopg2://user:pass@db:5432/dashboard
DASHBOARD_CORS_ORIGINS=https://yourdomain.com
EOF

# 3. Deploy
docker compose up -d
```

### Scaling Options
- **Multi-GPU**: Deploy agents across multiple GPUs/machines
- **Load Balancing**: Use nginx for frontend scaling
- **Managed Database**: PostgreSQL RDS for production

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Follow** existing code patterns and architecture
4. **Test** thoroughly with Docker development environment
5. **Submit** a pull request

### Development Guidelines
- Follow clean architecture principles
- Use the registry system for extensible components
- Add comprehensive error handling and logging
- Update documentation for new features
- Maintain type safety across the codebase

## 🙏 Acknowledgments

Built with these amazing technologies:

- **🤗 [Hugging Face Transformers](https://huggingface.co/transformers/)** - Pre-trained model ecosystem
- **⚡ [FastAPI](https://fastapi.tiangelo.com/)** - Modern Python web framework
- **⚛️ [Next.js](https://nextjs.org/)** - React production framework
- **🎨 [shadcn/ui](https://ui.shadcn.com/)** - Beautiful React components
- **🔍 [TanStack Query](https://tanstack.com/query)** - Data synchronization
- **🐻 [Zustand](https://zustand-demo.pmnd.rs/)** - State management
- **🎯 [TensorBoard](https://www.tensorflow.org/tensorboard)** - ML visualization

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **🐛 Issues**: [GitHub Issues](https://github.com/your-org/aurora-boreale/issues)
- **💬 Discussions**: [GitHub Discussions](https://github.com/your-org/aurora-boreale/discussions)
- **📖 Documentation**: [Wiki](https://github.com/your-org/aurora-boreale/wiki)

---

**🚀 Built for the ML community with modern web technologies and clean architecture principles**