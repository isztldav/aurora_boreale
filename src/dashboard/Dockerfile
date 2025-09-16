FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies including git for HuggingFace model downloads
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install dashboard dependencies with caching for faster rebuilds
COPY src/dashboard/requirements.txt /tmp/dashboard-requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r /tmp/dashboard-requirements.txt

# App code is bind-mounted in docker-compose for fast iteration

