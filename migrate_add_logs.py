#!/usr/bin/env python3
"""Migration to add RunLog table for training log storage."""

import os
import sys

# Add the src directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from dashboard.db import engine, Base


def create_run_logs_table():
    """Create the run_logs table."""
    print("Creating run_logs table...")

    # Import all models to ensure they're registered
    from dashboard import models

    # Create only the new table
    models.RunLog.__table__.create(engine, checkfirst=True)

    print("✓ run_logs table created successfully")


if __name__ == "__main__":
    create_run_logs_table()