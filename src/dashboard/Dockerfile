FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies including git for HuggingFace model downloads
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies in layers for better caching
# Layer 1: Core lightweight dependencies (change infrequently)
COPY src/dashboard/requirements-base.txt /tmp/requirements-base.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r /tmp/requirements-base.txt

# Layer 2: PyTorch ecosystem (large, stable packages)
COPY src/dashboard/requirements-pytorch.txt /tmp/requirements-pytorch.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r /tmp/requirements-pytorch.txt

# Layer 3: ML and data processing dependencies (moderate size, change occasionally)
COPY src/dashboard/requirements-ml.txt /tmp/requirements-ml.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r /tmp/requirements-ml.txt

# App code is bind-mounted in docker-compose for fast iteration

