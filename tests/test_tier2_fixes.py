"""
Tests for the four Tier 2 fixes.

Tier 2 issues are not crashes-today bugs -- they are fragile spots: code
that is correct under current data but breaks the moment the data gets
slightly less convenient. Each test below pins down the correct behavior
so it can never silently regress.

  #8  split_sql_statements -- must not split on a ';' inside a string/comment
  #7  active_version_id    -- config must always hold valid JSON
  #6  batch availability   -- must read the ACTIVE version, not hardcoded v1
  #5  one active version   -- the schema must forbid two active versions
"""
import pytest


# ---------------------------------------------------------------------------
# #8 -- SQL statement splitter
# ---------------------------------------------------------------------------
from app.migrate import split_sql_statements


def test_splitter_ignores_semicolon_inside_string_literal():
    """
    A ';' inside a quoted string is DATA, not a statement separator.
    Naive splitting shatters this single INSERT into broken fragments.
    """
    sql = (
        "INSERT INTO config(key, value) VALUES('motd', 'hello; world');"
        "CREATE TABLE t (a INT);"
    )
    stmts = split_sql_statements(sql)
    assert len(stmts) == 2, f"expected 2 statements, got {len(stmts)}: {stmts}"
    # The string literal must arrive intact, semicolon and all.
    assert "hello; world" in stmts[0]


def test_splitter_ignores_semicolon_inside_line_comment():
    """A ';' inside a -- comment must not be treated as a separator."""
    sql = (
        "CREATE TABLE a (x INT);  -- first table; very important\n"
        "CREATE TABLE b (y INT);"
    )
    stmts = split_sql_statements(sql)
    assert len(stmts) == 2, f"expected 2 statements, got {len(stmts)}: {stmts}"


def test_splitter_still_splits_ordinary_statements():
    """The fix must not break the normal, simple case."""
    sql = "CREATE TABLE a (x INT); CREATE TABLE b (y INT); CREATE TABLE c (z INT);"
    stmts = split_sql_statements(sql)
    assert len(stmts) == 3


# ---------------------------------------------------------------------------
# #7 -- config.active_version_id must always be valid JSON
# ---------------------------------------------------------------------------
import json
from app.db import execute, fetch_all, fetch_one
from app.completion import end_day
from tests.helpers import make_version, make_work_item


def test_config_values_stay_valid_json_after_end_day(db):
    """
    GUARD TEST (not red-green -- see the chat note). The config table's
    contract is "every value is JSON". get_config() runs json.loads() on
    every row, so a single non-JSON value crashes the whole endpoint.

    After end_day writes active_version_id, every config row must still
    parse as JSON, and active_version_id must decode to the new version id.
    This pins the invariant so a future regression to str()/repr() is caught.
    """
    v1 = make_version("v1", active=True)
    make_work_item(v1, "W1", day=5, qty=7, rooms=["RM-01", "RM-02"])
    # The row must exist for end_day's UPDATE to land on it.
    execute("INSERT INTO config(key, value) VALUES('active_version_id', :v)",
            v=json.dumps(v1))

    result = end_day(5)

    # Exactly what get_config() does -- none of these may raise.
    for r in fetch_all("SELECT key, value FROM config"):
        json.loads(r["value"])

    stored = fetch_one(
        "SELECT value FROM config WHERE key = 'active_version_id'")["value"]
    assert json.loads(stored) == result["new_version_id"]


# ---------------------------------------------------------------------------
# #6 -- batch availability must read the ACTIVE version, not hardcoded v1
# ---------------------------------------------------------------------------
from app.optimizer import get_batch_on_site_by_day


def test_batch_availability_reads_the_active_version(db):
    """
    get_batch_on_site_by_day computes "earliest day each batch is needed on
    site". The buggy version hardcodes version_id = 1, so after any
    roll-forward or swap (each of which creates a newer version) it reads
    STALE day-1 data. It must read the currently-active version instead.
    """
    # v1 (id 1): the stale version -- batch "01" earliest on day 3.
    v1 = make_version("v1 (stale)", active=False)
    make_work_item(v1, "W1", day=3, qty=5, rooms=["RM-01"], batch="01")
    # v2 (id 2): the ACTIVE version -- batch "01" has since moved to day 8.
    v2 = make_version("v2 (active)", active=True)
    make_work_item(v2, "W2", day=8, qty=5, rooms=["RM-02"], batch="01")

    avail = get_batch_on_site_by_day()

    assert avail.get("01") == 8, (
        f"batch availability read the wrong version: got {avail.get('01')}, "
        f"expected 8 (the active version's earliest day for batch 01)"
    )


# ---------------------------------------------------------------------------
# #5 -- the database must forbid two active schedule versions
# ---------------------------------------------------------------------------
from sqlalchemy.exc import IntegrityError


def test_database_forbids_two_active_versions(db):
    """
    A partial unique index must make a SECOND active version impossible at
    the database level. Without it, a race between two roles can leave two
    rows with is_active = TRUE and the app silently picks one. With it, the
    database itself rejects the second -- the race fails loudly, not silently.
    """
    make_version("v1", active=True)
    with pytest.raises(IntegrityError):
        make_version("v2", active=True)


def test_normal_version_switch_still_works(db):
    """
    GUARD TEST: the one-active constraint must NOT break the legitimate
    flow. end_day deactivates the old version and inserts a new active one
    in the same transaction -- there is never a moment with two active
    rows, so this must succeed and leave exactly one active version.
    """
    v1 = make_version("v1", active=True)
    make_work_item(v1, "W1", day=5, qty=7, rooms=["RM-01", "RM-02"])

    end_day(5)

    n = fetch_one(
        "SELECT COUNT(*) AS n FROM schedule_versions WHERE is_active"
    )["n"]
    assert n == 1, f"expected exactly 1 active version, found {n}"

