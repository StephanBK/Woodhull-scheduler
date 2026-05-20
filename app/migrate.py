"""
Simple migration runner.

Concept: Migrations are SQL files in /migrations applied in filename order.
A `_migrations` table records which files have been applied so we never
run the same one twice. Run at startup (idempotent) or via CLI.
"""
import os
from pathlib import Path
from sqlalchemy import text
from app.db import engine

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def adapt_sql_for_dialect(sql: str, dialect_name: str) -> str:
    """
    SQLite doesn't recognize SERIAL — but `INTEGER PRIMARY KEY` autoincrements.
    Postgres recognizes SERIAL but not the SQLite shortcut. Translate per dialect.
    BOOLEAN is also worth normalizing: SQLite accepts it but stores as INTEGER.
    """
    if dialect_name == "sqlite":
        # SERIAL PRIMARY KEY → INTEGER PRIMARY KEY (autoincrement via rowid alias)
        sql = sql.replace("SERIAL PRIMARY KEY", "INTEGER PRIMARY KEY")
        # TRUE/FALSE literals — SQLite accepts both since 3.23 but be explicit
        sql = sql.replace(" DEFAULT TRUE", " DEFAULT 1")
        sql = sql.replace(" DEFAULT FALSE", " DEFAULT 0")
    return sql


def ensure_migrations_table():
    with engine().begin() as c:
        c.execute(text("""
            CREATE TABLE IF NOT EXISTS _migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))


def applied_set() -> set[str]:
    with engine().connect() as c:
        return {r[0] for r in c.execute(text("SELECT filename FROM _migrations"))}


def apply_all() -> list[str]:
    ensure_migrations_table()
    done = applied_set()
    dialect = engine().dialect.name
    applied_now = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name in done:
            continue
        sql = adapt_sql_for_dialect(path.read_text(), dialect)
        with engine().begin() as c:
            for stmt in [s.strip() for s in sql.split(";") if s.strip()]:
                c.execute(text(stmt))
            c.execute(text("INSERT INTO _migrations(filename) VALUES (:f)"),
                      {"f": path.name})
        applied_now.append(path.name)
    return applied_now


if __name__ == "__main__":
    new = apply_all()
    if new:
        print(f"Applied {len(new)} migrations: {new}")
    else:
        print("All migrations already applied.")
