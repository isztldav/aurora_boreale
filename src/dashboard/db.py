from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator, CHAR


class GUID(TypeDecorator):
    """Platform-independent GUID type (stores as CHAR(36) for SQLite).

    For Postgres, you can swap to UUID().
    """

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return str(value)
        return str(uuid.UUID(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        return uuid.UUID(value)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)


class Base(DeclarativeBase):
    pass


DATABASE_URL = os.environ.get("DASHBOARD_DB_URL", "sqlite:///./dashboard.db")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    from . import models  # noqa: F401 ensure models are imported

    Base.metadata.create_all(bind=engine)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

