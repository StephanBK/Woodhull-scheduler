"""
Same-day swap engine.

When a room is locked at install time and we already have panels on the floor,
find another bay we *can* install today using what's already loaded.

Algorithm:
  1. Get today's loaded panel inventory (sum across today's work_items)
  2. Subtract panels already consumed by completed swaps + locked bay's
     own panels (still in inventory since we couldn't install)
  3. For each future-day work item, compute "fit":
       exact_match: candidate.panels == locked.panels  (best — drop-in replacement)
       subset:      candidate.panels ⊆ inventory       (good — fully installable now)
       short_by:    sum(panel deficit)                  (lower = better)
  4. Tie-break by geographic proximity (we don't have exact coords for bays vs
     each other, but we can use the bay-position data from the floor plan)
  5. Return ranked candidates with a "fit score"
"""
import math
from collections import defaultdict
from app.db import fetch_all, fetch_one, engine
from sqlalchemy import text

# Lazy-load bay positions for geometry
_BAY_POSITIONS = None


def _bay_positions():
    global _BAY_POSITIONS
    if _BAY_POSITIONS is None:
        import json
        from pathlib import Path
        p = Path(__file__).resolve().parent / "bay_positions.json"
        data = json.loads(p.read_text())
        _BAY_POSITIONS = {b["bay"]: (b["x"], b["y"]) for b in data["bays"]}
    return _BAY_POSITIONS


def bay_distance(bay_a: str, bay_b: str) -> float:
    """Euclidean distance between two bays in PDF coordinates."""
    pos = _bay_positions()
    if bay_a not in pos or bay_b not in pos:
        return float("inf")
    ax, ay = pos[bay_a]
    bx, by = pos[bay_b]
    return math.hypot(ax - bx, ay - by)


def get_today_inventory(day: int) -> dict[str, int]:
    """Sum of all panels delivered/loaded for today's install."""
    rows = fetch_all("""
        SELECT wip.panel_code, SUM(wip.qty) AS qty
        FROM assignments a
        JOIN work_item_panels wip ON wip.work_item_id = a.work_item_id
        JOIN schedule_versions sv ON sv.id = a.version_id
        WHERE sv.is_active = TRUE AND a.day = :d
        GROUP BY wip.panel_code
    """, d=day)
    return {r["panel_code"]: r["qty"] for r in rows}


def get_consumed_inventory(day: int) -> dict[str, int]:
    """
    Panels already "consumed" today by previous same-day swaps that pulled
    in future bays. (We don't track per-install completion yet, so we treat
    every swap_in as consumed and assume the locked bay's panels remain.)
    """
    rows = fetch_all("""
        SELECT wip.panel_code, SUM(wip.qty) AS qty
        FROM same_day_swaps s
        JOIN work_item_panels wip ON wip.work_item_id = s.swap_in_work_id
        WHERE s.day = :d
        GROUP BY wip.panel_code
    """, d=day)
    return {r["panel_code"]: r["qty"] for r in rows}


def get_available_inventory(day: int) -> dict[str, int]:
    """Today's load minus what's already been consumed by earlier swaps."""
    inv = get_today_inventory(day)
    used = get_consumed_inventory(day)
    return {p: inv.get(p, 0) - used.get(p, 0) for p in inv}


def get_work_item_panels(wi_id: str) -> dict[str, int]:
    rows = fetch_all(
        "SELECT panel_code, qty FROM work_item_panels WHERE work_item_id = :id",
        id=wi_id,
    )
    return {r["panel_code"]: r["qty"] for r in rows}


def suggest_swaps(locked_wi_id: str, day: int, top_n: int = 5) -> list[dict]:
    """
    Return ranked candidate work items that could be installed instead of the
    locked one today, using already-loaded inventory.
    """
    locked = fetch_one("""
        SELECT id, bay, batch_code, qty, rooms_text
        FROM work_items WHERE id = :id
    """, id=locked_wi_id)
    if not locked:
        return []
    locked_panels = get_work_item_panels(locked_wi_id)

    # Available inventory ASSUMING the locked bay's panels remain available
    # (we couldn't install them). This is what we have to work with.
    available = get_available_inventory(day)

    # Future-day work items (and same day other items?) — candidates must be
    # AFTER today in the active schedule, so we're not double-doing today's work
    candidates = fetch_all("""
        SELECT a.day AS scheduled_day, wi.id, wi.bay, wi.batch_code,
               wi.qty, wi.rooms_text
        FROM assignments a
        JOIN work_items wi       ON wi.id = a.work_item_id
        JOIN schedule_versions sv ON sv.id = a.version_id
        WHERE sv.is_active = TRUE AND a.day > :d
          AND wi.id != :locked_id
        ORDER BY a.day
    """, d=day, locked_id=locked_wi_id)

    # Filter out any bays that are themselves under pending unavailability
    pending_rooms_today = {
        r["room_code"]
        for r in fetch_all("""
            SELECT room_code FROM room_unavailability
            WHERE day = :d AND status IN ('pending', 'applied')
        """, d=day)
    }
    wi_rooms = defaultdict(set)
    for r in fetch_all("SELECT work_item_id, room_code FROM work_item_rooms"):
        wi_rooms[r["work_item_id"]].add(r["room_code"])

    results = []
    for c in candidates:
        # Reject candidates whose rooms collide with today's unavailability
        if wi_rooms[c["id"]] & pending_rooms_today:
            continue

        c_panels = get_work_item_panels(c["id"])

        # Compute deficit: how many panels we'd need to fetch from truck
        deficit = 0
        for p, need in c_panels.items():
            have = available.get(p, 0)
            if need > have:
                deficit += (need - have)

        exact_match = (c_panels == locked_panels)
        fully_installable = deficit == 0

        # Geographic proximity score (lower = better; max value treated as worst)
        distance = bay_distance(locked["bay"], c["bay"])

        results.append({
            "candidate_id": c["id"],
            "candidate_bay": c["bay"],
            "candidate_batch": c["batch_code"],
            "candidate_rooms": c["rooms_text"],
            "candidate_qty": c["qty"],
            "candidate_scheduled_day": c["scheduled_day"],
            "panels": c_panels,
            "panel_deficit": deficit,
            "exact_match": exact_match,
            "fully_installable": fully_installable,
            "distance": None if distance == float("inf") else round(distance, 1),
        })

    # Sort by:
    #   1. exact match first (descending)
    #   2. fully installable (descending)
    #   3. lower deficit (ascending)
    #   4. closer (ascending distance)
    #   5. soonest scheduled day (ascending)
    def score(r):
        return (
            0 if r["exact_match"] else 1,
            0 if r["fully_installable"] else 1,
            r["panel_deficit"],
            r["distance"] if r["distance"] is not None else 9999,
            r["candidate_scheduled_day"],
        )
    results.sort(key=score)
    return results[:top_n]


def execute_swap(locked_wi_id: str, swap_in_wi_id: str, day: int,
                 triggered_by: str = "inovues",
                 notes: str | None = None) -> dict:
    """
    Execute a same-day swap.

    Per the Option-C design: a swap is a real schedule change, so it creates
    a NEW schedule version (it does not silently mutate the active one).
      - The new version copies every assignment from the current active version
      - swap_in_wi_id moves to `day` (today)
      - locked_wi_id moves to swap_in's original (future) day
      - The new version becomes active
      - The swap is recorded in same_day_swaps for the audit trail

    This means swaps show up in the Versions list and the INOVUES banner,
    even though they take effect immediately for the installer (no approval).
    """
    locked = fetch_one("SELECT id, bay FROM work_items WHERE id = :id", id=locked_wi_id)
    swap_in = fetch_one("SELECT id, bay FROM work_items WHERE id = :id", id=swap_in_wi_id)
    if not locked or not swap_in:
        raise ValueError("work item not found")

    active = fetch_one(
        "SELECT id FROM schedule_versions WHERE is_active = TRUE"
    )
    parent_vid = active["id"]

    locked_assign = fetch_one("""
        SELECT day, sequence FROM assignments
        WHERE version_id = :v AND work_item_id = :w
    """, v=parent_vid, w=locked_wi_id)
    swap_in_assign = fetch_one("""
        SELECT day, sequence FROM assignments
        WHERE version_id = :v AND work_item_id = :w
    """, v=parent_vid, w=swap_in_wi_id)
    if not locked_assign or not swap_in_assign:
        raise ValueError("assignment missing")
    if locked_assign["day"] != day:
        raise ValueError(
            f"locked item is not on day {day} (it's on day {locked_assign['day']})"
        )
    if swap_in_assign["day"] <= day:
        raise ValueError("swap-in item must be from a future day")

    locked_dest_day = swap_in_assign["day"]
    label = (f"Swap — Bay {swap_in['bay']} pulled into day {day}, "
             f"Bay {locked['bay']} → day {locked_dest_day}")

    with engine().begin() as c:
        # 1. Deactivate current active version
        c.execute(text(
            "UPDATE schedule_versions SET is_active = FALSE WHERE is_active = TRUE"
        ))
        # 2. Create the new version
        c.execute(text("""
            INSERT INTO schedule_versions(label, parent_id, is_active)
            VALUES (:l, :p, TRUE)
        """), {"l": label, "p": parent_vid})
        new_v = c.execute(text("""
            SELECT id FROM schedule_versions
            WHERE is_active = TRUE ORDER BY id DESC LIMIT 1
        """)).scalar()

        # 3. Copy all assignments from parent into the new version
        c.execute(text("""
            INSERT INTO assignments(version_id, work_item_id, day, sequence)
            SELECT :nv, work_item_id, day, sequence
            FROM assignments WHERE version_id = :pv
        """), {"nv": new_v, "pv": parent_vid})

        # 4. Apply the swap within the new version
        next_seq_locked = c.execute(text("""
            SELECT COALESCE(MAX(sequence), 0) + 1 FROM assignments
            WHERE version_id = :v AND day = :d
        """), {"v": new_v, "d": locked_dest_day}).scalar()
        next_seq_swap = c.execute(text("""
            SELECT COALESCE(MAX(sequence), 0) + 1 FROM assignments
            WHERE version_id = :v AND day = :d
        """), {"v": new_v, "d": day}).scalar()

        c.execute(text("""
            UPDATE assignments SET day = :d, sequence = :s
            WHERE version_id = :v AND work_item_id = :w
        """), {"v": new_v, "w": locked_wi_id, "d": locked_dest_day, "s": next_seq_locked})
        c.execute(text("""
            UPDATE assignments SET day = :d, sequence = :s
            WHERE version_id = :v AND work_item_id = :w
        """), {"v": new_v, "w": swap_in_wi_id, "d": day, "s": next_seq_swap})

        # 5. Audit row
        c.execute(text("""
            INSERT INTO same_day_swaps(day, locked_work_id, swap_in_work_id,
                                       triggered_by, notes)
            VALUES (:d, :l, :s, :t, :n)
        """), {"d": day, "l": locked_wi_id, "s": swap_in_wi_id,
               "t": triggered_by, "n": notes})

        # 6. Keep config.active_version_id in sync
        c.execute(text("""
            UPDATE config SET value = :v WHERE key = 'active_version_id'
        """), {"v": str(new_v)})

    return {
        "ok": True,
        "new_version_id": new_v,
        "locked_moved_to_day": locked_dest_day,
        "swap_in_moved_to_day": day,
    }

