"""
Simple migration runner.

Concept: Migrations are SQL files in /migrations applied in filename order.
A `_migrations` table records which files have been applied so we never
run the same one twice. Run at startup (idempotent) or via CLI.
"""
import os
import re
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


# Matches a Postgres dollar-quote opening tag: $$ or $name$
_DOLLAR_TAG = re.compile(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$")


def split_sql_statements(sql: str) -> list[str]:
    """
    Split a SQL script into its individual statements on ';' — but only on a
    ';' that is real syntax, never one sitting inside a string literal, a
    quoted identifier, a comment, or a Postgres dollar-quoted block.

    A naive sql.split(';') breaks the instant a migration contains something
    like  INSERT INTO t VALUES ('a; b')  — it shatters that one statement
    into two invalid fragments. This walks the text one character at a time,
    tracking whether we are currently "inside" anything, and only treats ';'
    as a separator when we are inside nothing.
    """
    statements: list[str] = []
    buf: list[str] = []
    i, n = 0, len(sql)

    in_single = False        # inside '...' string literal
    in_double = False        # inside "..." quoted identifier
    in_line_comment = False  # inside -- ... up to newline
    in_block_comment = False # inside /* ... */
    dollar_tag = None        # the opening tag if inside $tag$ ... $tag$

    while i < n:
        ch = sql[i]
        pair = sql[i:i + 2]

        if in_line_comment:
            buf.append(ch)
            if ch == "\n":
                in_line_comment = False
            i += 1
        elif in_block_comment:
            buf.append(ch)
            if pair == "*/":
                buf.append(sql[i + 1])
                in_block_comment = False
                i += 2
            else:
                i += 1
        elif in_single:
            buf.append(ch)
            if ch == "'":
                # '' is an escaped quote — stay inside the string.
                if i + 1 < n and sql[i + 1] == "'":
                    buf.append("'")
                    i += 2
                    continue
                in_single = False
            i += 1
        elif in_double:
            buf.append(ch)
            if ch == '"':
                in_double = False
            i += 1
        elif dollar_tag is not None:
            if sql.startswith(dollar_tag, i):
                buf.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
            else:
                buf.append(ch)
                i += 1
        else:
            # Not inside anything — look for something to enter, or a ';'.
            if pair == "--":
                in_line_comment = True
                buf.append(pair)
                i += 2
            elif pair == "/*":
                in_block_comment = True
                buf.append(pair)
                i += 2
            elif ch == "'":
                in_single = True
                buf.append(ch)
                i += 1
            elif ch == '"':
                in_double = True
                buf.append(ch)
                i += 1
            elif ch == "$" and _DOLLAR_TAG.match(sql, i):
                dollar_tag = _DOLLAR_TAG.match(sql, i).group(0)
                buf.append(dollar_tag)
                i += len(dollar_tag)
            elif ch == ";":
                stmt = "".join(buf).strip()
                if stmt:
                    statements.append(stmt)
                buf = []
                i += 1
            else:
                buf.append(ch)
                i += 1

    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


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
            for stmt in split_sql_statements(sql):
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
