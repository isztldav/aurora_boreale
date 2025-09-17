# 🚀 ML Training Platform v2

A modern, unified platform for reproducible machine learning experiments focused on supervised image classification. Built with FastAPI, Next.js, and Hugging Face Transformers.

![Platform Architecture](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi) ![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white) ![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

## ✨ Features

### 🎯 Core Capabilities
- **Project Management**: Organize experiments into projects with hierarchical structure
- **Training Configuration**: Visual config builder with registry-based components
- **GPU Management**: Automatic GPU discovery and allocation for distributed training
- **Real-time Monitoring**: Live training logs and metrics via WebSocket
- **TensorBoard Integration**: Embedded TensorBoard instances with lifecycle management
- **Model Testing**: Drag-and-drop image testing against trained checkpoints

### 🔧 Technical Highlights
- **Clean Architecture**: Modular design with clear separation of concerns
- **Extensible Registry**: Plugin system for models, optimizers, losses, and augmentations
- **Label Persistence**: Automatic dataset label mapping preservation
- **Hot Reload Development**: Fast iteration with Docker Compose
- **Production Ready**: Comprehensive logging, error handling, and Docker deployment

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js UI   │◄──►│  FastAPI API    │◄──►│ Training Agent  │
│  (Port 3000)   │    │  (Port 8000)    │    │ (GPU Executor)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                      ┌─────────────────┐
                      │   PostgreSQL    │
                      │   Database      │
                      └─────────────────┘
```

- **Frontend**: Modern React dashboard with real-time updates
- **Backend**: FastAPI REST API with embedded TensorBoard
- **Agent**: GPU-bound training executor with clean architecture
- **Core**: Pure ML training engine with Hugging Face integration
- **Database**: PostgreSQL with SQLAlchemy ORM

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
- **Dashboard**: http://localhost:3000
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
| `GPU_INDEX` | `0` | GPU device index for agent |
| `DATASETS_DIR` | `/app/datasets` | Dataset mount location |

### Project Structure

```
src/
├── dashboard/          # FastAPI backend
├── agent/             # Training agent with clean architecture
├── core/              # Pure ML training engine
└── shared/            # Database models and shared utilities

web_ui/                # Next.js frontend
├── app/              # App router pages
├── components/       # React components
└── lib/             # Utilities and hooks

main.py               # Standalone training entry point
docker-compose.yml    # Container orchestration
```

## 🧪 Testing

```bash
# Frontend type checking and linting
cd web_ui
npm run typecheck
npm run lint

# Backend type checking (optional)
mypy src/

# Integration testing
pytest tests/  # (when test suite is added)
```

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

## 🆘 Support

- **Issues**: Report bugs and request features via GitHub Issues
- **Documentation**: See `CLAUDE.md` for detailed technical documentation
- **Architecture**: See `PROJECT_CACHE.md` for comprehensive architecture overview

## 🙏 Acknowledgments

- [Hugging Face Transformers](https://huggingface.co/transformers/) for model support
- [shadcn/ui](https://ui.shadcn.com/) for UI components
- [FastAPI](https://fastapi.tiangolo.com/) for the backend framework
- [Next.js](https://nextjs.org/) for the frontend framework

---

**Made with ❤️ for the ML community**