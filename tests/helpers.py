"""
Small helper functions for building test scenarios.

These let a test say "give me a work item with 7 windows across 2 rooms"
in one line, instead of writing six INSERT statements every time. Keeping
this setup in one place means every test builds its data the same way.
"""
from app.db import execute, fetch_one


def make_version(label="Test version", active=True):
    """Create a schedule version. Returns its database id."""
    execute(
        "INSERT INTO schedule_versions(label, is_active) VALUES (:l, :a)",
        l=label, a=1 if active else 0,
    )
    return fetch_one(
        "SELECT id FROM schedule_versions ORDER BY id DESC LIMIT 1"
    )["id"]


def make_work_item(version_id, wi_id, day, qty, rooms,
                    bay="B1", batch="01", panels=None):
    """
    Create one work item, place it on `day` in `version_id`, and attach its
    rooms and (optionally) its panels.

      wi_id  : id string for the work item, e.g. "W1"
      qty    : number of windows in this work item
      rooms  : list of room codes, e.g. ["RM-01", "RM-02"]
      panels : dict of panel_code -> qty, e.g. {"S1": 4, "S2": 3}

    INSERT OR IGNORE is used for the reference tables so calling this helper
    twice (e.g. two work items sharing a batch) does not error.
    """
    execute("INSERT OR IGNORE INTO batches(code) VALUES (:c)", c=batch)
    for r in rooms:
        execute("INSERT OR IGNORE INTO rooms(code, kind) VALUES (:c, 'room')",
                c=r)
    for p in (panels or {}):
        execute("INSERT OR IGNORE INTO panel_types(code) VALUES (:c)", c=p)

    # The work item itself.
    execute("""
        INSERT INTO work_items(id, bay, batch_code, rooms_text, qty,
                               source_day, sequence)
        VALUES (:i, :b, :bt, :rt, :q, :sd, 1)
    """, i=wi_id, b=bay, bt=batch, rt=", ".join(rooms), q=qty, sd=day)

    # Place it on a day within this schedule version.
    execute("""
        INSERT INTO assignments(version_id, work_item_id, day, sequence)
        VALUES (:v, :i, :d, 1)
    """, v=version_id, i=wi_id, d=day)

    # Its rooms.
    for r in rooms:
        execute("""
            INSERT INTO work_item_rooms(work_item_id, room_code)
            VALUES (:i, :r)
        """, i=wi_id, r=r)

    # Its panels.
    for p, q in (panels or {}).items():
        execute("""
            INSERT INTO work_item_panels(work_item_id, panel_code, qty)
            VALUES (:i, :p, :q)
        """, i=wi_id, p=p, q=q)
