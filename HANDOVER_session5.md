# Woodhull SWR Scheduler — Handover, Session 5

**Date:** 2026-05-21
**Focus:** First automated test suite + the four Tier 2 bug fixes
**Status:** All work complete and tested (13/13 tests green).
**One open task:** get this code onto GitHub (see Section 6).

---

## 1. What this session accomplished

This session built the project's **first automated test suite** and fixed
the **four Tier 2 issues** identified in the Session-4 audit.

### Tier 1 — confirmed (not re-fixed)

The `completion.py` roll-forward fix from the previous session was verified
by re-running its 5 tests. All pass — the fix is sound. No new Tier 1 work.

### Tier 2 — four fixes, all done

| # | The problem | The fix |
|---|-------------|---------|
| #8 | `migrate.py` split migration SQL on *every* `;`, even ones inside a string literal or a comment — which would shatter a valid statement. | New `split_sql_statements()` function: a character-by-character splitter that ignores any `;` inside a string, identifier, comment, or Postgres dollar-quoted block. |
| #7 | `active_version_id` was written to the `config` table as JSON in some places and as a bare string in others. Harmless today, but a latent trap. | All four write-sites (`seed.py`, `optimizer.py`, `completion.py`, `swap_engine.py`) now use `json.dumps`. "Every config value is valid JSON" is now true by design. |
| #6 | The optimizer read batch-availability from a hardcoded `version_id = 1`, so after any swap or roll-forward it was planning against stale data. | `get_batch_on_site_by_day()` now takes an optional `version_id` and defaults to the **active** version; `plan()` passes the version it is planning from. |
| #5 | Nothing stopped two schedule versions from being `is_active = TRUE` at once. A race between two roles could silently drop one person's change. | New migration `0004_one_active_version.sql` adds a **partial unique index** — the database itself now rejects a second active version. |

---

## 2. The test suite (13 tests, all green)

The tests live in a new top-level `tests/` folder. Run them from the repo
root with the single command:

```
pytest
```

| Test file | Tests | What it proves |
|-----------|-------|----------------|
| `tests/test_harness.py` | 1 | The test setup itself works — a fresh, empty, migrated database that tests can write to. |
| `tests/test_completion_rollforward.py` | 5 | The 4 Tier 1 roll-forward bugs are fixed, plus the mixed partial-day case. |
| `tests/test_tier2_fixes.py` | 7 | The 4 Tier 2 fixes above (3 tests for #8, 1 for #7, 1 for #6, 2 for #5). |

### How the test setup works (concepts)

- **pytest** discovers every `test_*.py` file and runs every `test_*` function.
- **`tests/conftest.py`** holds the `db` *fixture* — reusable setup code.
  Any test that lists `db` as a parameter gets its own fresh, isolated
  temp database, built by running all migrations. It can never touch the
  real `woodhull.db`.
- **`tests/helpers.py`** has `make_version()` and `make_work_item()` —
  one-line builders for test scenarios.
- **Red-green**: for a real bug, write a test that *fails* first (red =
  proof the bug exists), then fix the code until it *passes* (green).
- **Guard test**: a test that starts green and stays green; its job is to
  catch a *future* regression. Used for #7, where there is no failing
  behavior to catch today (the bug is a latent trap, not a crash).

---

## 3. Files changed or created this session

Place each file at exactly this path inside the repo:

```
app/completion.py        (changed — Tier 1 fix + #7)
app/migrate.py           (changed — #8)
app/optimizer.py         (changed — #6)
app/swap_engine.py       (changed — #7)
migrations/0004_one_active_version.sql   (new — #5)
tests/__init__.py                        (new)
tests/conftest.py                        (new)
tests/helpers.py                         (new)
tests/test_harness.py                    (new)
tests/test_completion_rollforward.py     (new)
tests/test_tier2_fixes.py                (new)
requirements-dev.txt                     (new — dev dependency: pytest)
```

---

## 4. How to run the tests on your own machine (for next time)

From the repo root, once:

```
pip install -r requirements.txt -r requirements-dev.txt
```

Then any time:

```
pytest
```

Expected result: `13 passed`.

---

## 5. Notes / things held for later

- The four Tier 2 fixes are minimal and self-contained. No behavior changed
  for the normal flow — the existing Tier 1 tests still pass.
- Migration `0004` includes a one-time repair step: if a live database
  already has more than one active version, it keeps the newest and
  deactivates the rest before building the index.
- Still no tests for the swap engine or the optimizer's `plan()` logic
  itself — a good candidate for a future session.

---

## 6. OPEN TASK — push this work to GitHub

As of this handover, all of the above exists only as downloaded files. It
is **not yet committed to the GitHub repo**
(`https://github.com/StephanBK/Woodhull-scheduler`).

Next session: place the 12 files from Section 3 into the repo, commit them,
and push. Suggested commit message:

```
Add test suite and fix four Tier 2 issues (#5–#8)
```
