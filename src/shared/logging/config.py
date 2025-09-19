"""
Unified logging configuration for the ML training platform.

This module provides a centralized logging setup that can be used across all services
(dashboard, agent, core) with environment-based configuration for production and development.
"""

import logging
import logging.config
import os
import sys
from typing import Optional


def setup_logging(
    service_name: str,
    log_level: Optional[str] = None,
    log_dir: Optional[str] = None,
    enable_file_logging: bool = True
) -> logging.Logger:
    """
    Configure structured logging for a service.

    Args:
        service_name: Name of the service (e.g., "dashboard", "agent", "core")
        log_level: Override log level (defaults to env var or INFO)
        log_dir: Directory for log files (defaults to /app/logs)
        enable_file_logging: Whether to enable file logging

    Returns:
        Configured logger instance for the service
    """
    # Determine log level from environment or parameter
    if log_level is None:
        log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    # Determine log directory
    if log_dir is None:
        log_dir = os.getenv("LOG_DIR", "/app/logs")

    # Ensure log directory exists
    if enable_file_logging:
        os.makedirs(log_dir, exist_ok=True)

    # Configure formatters
    formatters = {
        'standard': {
            'format': '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
            'datefmt': '%Y-%m-%d %H:%M:%S'
        },
        'detailed': {
            'format': '%(asctime)s [%(levelname)s] %(name)s:%(lineno)d: %(message)s',
            'datefmt': '%Y-%m-%d %H:%M:%S'
        },
        'simple': {
            'format': '[%(levelname)s] %(name)s: %(message)s'
        }
    }

    # Configure handlers
    handlers = {
        'console': {
            'class': 'logging.StreamHandler',
            'level': log_level,
            'formatter': 'standard' if log_level == 'DEBUG' else 'simple',
            'stream': 'ext://sys.stdout'
        }
    }

    # Add file handler if enabled
    if enable_file_logging:
        handlers['file'] = {
            'class': 'logging.handlers.RotatingFileHandler',
            'level': 'DEBUG',
            'formatter': 'detailed',
            'filename': os.path.join(log_dir, f'{service_name}.log'),
            'maxBytes': 10485760,  # 10MB
            'backupCount': 5,
            'encoding': 'utf-8'
        }

    # Build logging configuration
    config = {
        'version': 1,
        'disable_existing_loggers': False,
        'formatters': formatters,
        'handlers': handlers,
        'loggers': {
            service_name: {
                'level': 'DEBUG',
                'handlers': ['console'] + (['file'] if enable_file_logging else []),
                'propagate': False
            },
            # Reduce noise from external libraries
            'urllib3': {
                'level': 'WARNING',
                'handlers': ['console'],
                'propagate': False
            },
            'requests': {
                'level': 'WARNING',
                'handlers': ['console'],
                'propagate': False
            },
            'transformers': {
                'level': 'WARNING',
                'handlers': ['console'],
                'propagate': False
            }
        },
        'root': {
            'level': 'INFO',
            'handlers': ['console']
        }
    }

    # Apply configuration
    logging.config.dictConfig(config)

    # Return service-specific logger
    logger = logging.getLogger(service_name)
    logger.info(f"Logging initialized for {service_name} (level: {log_level})")

    return logger


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the given name.

    This should be used within modules to get sub-loggers, e.g.:
    logger = get_logger("dashboard.routers.runs")

    Args:
        name: Logger name (typically module path)

    Returns:
        Logger instance
    """
    return logging.getLogger(name)


def log_exception(logger: logging.Logger, message: str, exc_info: bool = True) -> None:
    """
    Log an exception with context.

    Args:
        logger: Logger instance
        message: Descriptive message about what failed
        exc_info: Whether to include exception traceback
    """
    logger.exception(message, exc_info=exc_info)


def configure_uvicorn_logging() -> None:
    """
    Configure uvicorn logging to integrate with our logging system.
    Should be called before starting uvicorn server.
    """
    # Disable uvicorn's default logging configuration to prevent conflicts
    # We'll handle uvicorn logs through our own logging system
    uvicorn_loggers = [
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access"
    ]

    for logger_name in uvicorn_loggers:
        uvicorn_logger = logging.getLogger(logger_name)
        uvicorn_logger.setLevel(logging.WARNING)  # Reduce verbosity
        uvicorn_logger.propagate = True  # Let root logger handle it