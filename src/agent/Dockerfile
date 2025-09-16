FROM python:3.13-slim

# Keep Python fast and quiet
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies including git for HuggingFace model downloads
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install agent dependencies separately for better build caching
COPY src/agent/requirements.txt /tmp/agent-requirements.txt

# Use BuildKit cache for pip to speed up rebuilds
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r /tmp/agent-requirements.txt

# The application code will be mounted at runtime via a volume in docker-compose

