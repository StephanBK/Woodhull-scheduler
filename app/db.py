"""
Database connection layer.

Concept: The same code talks to either SQLite (locally) or Postgres (on Railway)
by reading the DATABASE_URL environment variable. SQLAlchemy hides the dialect
differences (parameter placeholders, dialect-specific SQL) behind one API.
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from contextlib import contextmanager


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "sqlite:///./woodhull.db")
    # Railway provides postgres:// (or postgresql://). SQLAlchemy's bare
    # postgresql:// dialect defaults to the psycopg2 driver, but this app ships
    # psycopg v3 (see requirements.txt). Target the psycopg-v3 dialect
    # explicitly, otherwise SQLAlchemy tries to import psycopg2 and crashes on
    # startup. SQLite (local default) is left untouched.
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


_engine: Engine | None = None


def engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(get_database_url(), future=True, pool_pre_ping=True)
    return _engine


@contextmanager
def conn():
    """Use as `with conn() as c: ...` for a transactional connection."""
    with engine().begin() as c:
        yield c


def fetch_all(sql: str, **params) -> list[dict]:
    with engine().connect() as c:
        rows = c.execute(text(sql), params).mappings().all()
        return [dict(r) for r in rows]


def fetch_one(sql: str, **params) -> dict | None:
    with engine().connect() as c:
        row = c.execute(text(sql), params).mappings().first()
        return dict(row) if row else None


def execute(sql: str, **params) -> None:
    with engine().begin() as c:
        c.execute(text(sql), params)
