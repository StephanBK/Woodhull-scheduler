"""
A single trivial test whose only job is to prove the test harness works:
  - the `db` fixture gives us a fresh, empty, migrated database
  - we can write to it and read the data back

If this passes, every other test can rely on the same setup. This is the
"prove the foundation before you build on it" step.
"""
from app.db import execute, fetch_one


def test_fresh_database_is_empty_then_writable(db):
    # The `db` fixture (see conftest.py) just built a brand-new database.
    # It should have the schema (tables) but no data yet.
    count = fetch_one("SELECT COUNT(*) AS n FROM schedule_versions")["n"]
    assert count == 0, "a fresh test database should start empty"

    # Now write one row and read it back — proves the connection works.
    execute(
        "INSERT INTO schedule_versions(label, is_active) VALUES (:l, :a)",
        l="harness check", a=1,
    )
    row = fetch_one("SELECT label FROM schedule_versions LIMIT 1")
    assert row["label"] == "harness check"
