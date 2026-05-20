"""
Hospital-side room replacement engine.

When a hospital user flags a room as unavailable, we don't just queue a
mark — we offer them concrete replacement rooms whose bay needs the SAME
materials (panel mix), so the installer can move to a different room
without fetching new panels from downstairs.

Two modes, decided by how far out the flagged day is from "today":
  - imminent (flagged day is today or the next ~1 working day): panels are
    staged on the floor. Only EXACT panel-mix matches are offered — a
    like-for-like swap that doesn't change any day's window count, so caps
    stay safe.
  - advance (flagged day is further out): nothing staged yet. Exact matches
    are still offered first (cap-safe), then close matches as fallbacks.

Picking a replacement performs a two-way swap (see swap_engine.execute_swap)
and then the optimizer re-runs to enforce caps downstream.
"""
from datetime import date, datetime, timedelta
from app.db import fetch_all, fetch_one
from app.swap_engine import get_work_item_panels, bay_distance


# How many working days out still counts as "imminent" (panels staged).
IMMINENT_HORIZON = 1


def _project_start() -> date | None:
    r = fetch_one("SELECT value FROM config WHERE key = 'project_start_date'")
    if not r or not r["value"]:
        return None
    raw = r["value"].strip().strip('"')
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return None


def current_working_day() -> int | None:
    """
    Today's working-day number (1-based), computed from the project start
    date. Weekends don't count. Returns None if no start date is set, or 0
    if the project hasn't started yet.
    """
    start = _project_start()
    if not start:
        return None
    today = date.today()
    if today < start:
        return 0
    # Count working days from start to today inclusive
    d = start
    # roll start forward off a weekend
    while d.weekday() >= 5:
        d += timedelta(days=1)
    count = 1
    while d < today:
        d += timedelta(days=1)
        if d.weekday() < 5:
            count += 1
    return count


def classify_timing(flagged_day: int) -> str:
    """'imminent' | 'advance' | 'past'. No start date set -> always 'advance'."""
    today = current_working_day()
    if today is None or today == 0:
        return "advance"
    if flagged_day < today:
        return "past"
    if flagged_day - today <= IMMINENT_HORIZON:
        return "imminent"
    return "advance"


def _active_version_id() -> int:
    r = fetch_one("""
        SELECT id FROM schedule_versions
        WHERE is_active = TRUE ORDER BY id DESC LIMIT 1
    """)
    return r["id"] if r else None


def _panel_mix_distance(a: dict, b: dict) -> int:
    """Total absolute difference between two panel mixes (0 == identical)."""
    keys = set(a) | set(b)
    return sum(abs(a.get(k, 0) - b.get(k, 0)) for k in keys)


def suggest_replacements(room_code: str, flagged_day: int,
                         top_n: int = 6) -> dict:
    """
    For a flagged room, return ranked replacement options.

    Each option is a BAY scheduled on a different day whose work could be
    pulled into `flagged_day` instead. Ranked by panel-mix match (exact
    first), then proximity, then soonest day.
    """
    vid = _active_version_id()
    timing = classify_timing(flagged_day)

    # Resolve the room -> the work item(s) scheduled on the flagged day that
    # touch this room.
    locked_rows = fetch_all("""
        SELECT DISTINCT wi.id, wi.bay, wi.batch_code, wi.qty, wi.rooms_text
        FROM assignments a
        JOIN work_items wi        ON wi.id = a.work_item_id
        JOIN work_item_rooms wir  ON wir.work_item_id = wi.id
        WHERE a.version_id = :v AND a.day = :d AND wir.room_code = :rc
    """, v=vid, d=flagged_day, rc=room_code)

    if not locked_rows:
        return {
            "room_code": room_code, "flagged_day": flagged_day,
            "timing": timing, "locked": None, "options": [],
            "note": "No work is scheduled for this room on that day.",
        }

    # Use the first work item as the thing being displaced.
    locked = locked_rows[0]
    locked_panels = get_work_item_panels(locked["id"])

    # Candidate bays: work items on LATER days in the active schedule.
    # The swap pulls a future bay forward into the flagged day, so the
    # candidate must be scheduled after it (you can't pull from the past).
    candidates = fetch_all("""
        SELECT a.day AS scheduled_day, wi.id, wi.bay, wi.batch_code,
               wi.qty, wi.rooms_text
        FROM assignments a
        JOIN work_items wi ON wi.id = a.work_item_id
        WHERE a.version_id = :v AND a.day > :d AND wi.id != :lid
        ORDER BY a.day
    """, v=vid, d=flagged_day, lid=locked["id"])

    # Exclude candidates whose rooms are themselves under a pending mark.
    blocked = {
        r["room_code"] for r in fetch_all("""
            SELECT room_code FROM room_unavailability
            WHERE status IN ('pending', 'applied')
        """)
    }
    from collections import defaultdict
    wi_rooms = defaultdict(set)
    for r in fetch_all("SELECT work_item_id, room_code FROM work_item_rooms"):
        wi_rooms[r["work_item_id"]].add(r["room_code"])

    options = []
    for c in candidates:
        if wi_rooms[c["id"]] & blocked:
            continue
        c_panels = get_work_item_panels(c["id"])
        mix_diff = _panel_mix_distance(locked_panels, c_panels)
        exact = (mix_diff == 0)

        # In imminent mode, only exact matches are valid (panels staged).
        if timing == "imminent" and not exact:
            continue

        distance = bay_distance(locked["bay"], c["bay"])
        options.append({
            "work_item_id": c["id"],
            "bay": c["bay"],
            "batch": c["batch_code"],
            "rooms_text": c["rooms_text"],
            "qty": c["qty"],
            "scheduled_day": c["scheduled_day"],
            "panels": c_panels,
            "panel_mix_diff": mix_diff,
            "exact_match": exact,
            "distance": None if distance == float("inf") else round(distance, 1),
        })

    # Rank: exact first, then smallest mix difference, then closest, soonest.
    def score(o):
        return (
            0 if o["exact_match"] else 1,
            o["panel_mix_diff"],
            o["distance"] if o["distance"] is not None else 9999,
            o["scheduled_day"],
        )
    options.sort(key=score)

    return {
        "room_code": room_code,
        "flagged_day": flagged_day,
        "timing": timing,
        "locked": {
            "work_item_id": locked["id"],
            "bay": locked["bay"],
            "rooms_text": locked["rooms_text"],
            "qty": locked["qty"],
            "panels": locked_panels,
        },
        "options": options[:top_n],
        "exact_count": sum(1 for o in options if o["exact_match"]),
    }
