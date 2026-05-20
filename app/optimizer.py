"""
Reschedule optimizer.

Given pending room-unavailability marks, produce a new schedule version with
the minimum number of work items shifted from their original day.

Algorithm (greedy):
  1. Identify "stuck" work items — those whose rooms collide with pending marks
     on their currently-assigned day.
  2. For each stuck item, find candidate days that satisfy hard constraints:
       (a) batch_on_site_by[batch] <= candidate_day      (panels physically there)
       (b) no room collisions on candidate day from active marks
       (c) panels-installed-on-candidate-day + this item's qty <= weekly cap
  3. Pick the candidate day minimizing |candidate - original_day|, with ties
     broken by "earlier within the same week".
  4. If no candidate exists in the current 22-day window, append day 23, 24, …
     and re-try (project extension — allowed per spec).
  5. Mark the contributing unavailability rows as 'applied' and create a new
     active schedule_version with all assignments (changed and unchanged).

Returns a diff summary: items_moved, items_unchanged, before/after pairs.
"""
import json
from collections import defaultdict
from app.db import engine, fetch_all, fetch_one
from sqlalchemy import text


def get_batch_on_site_by_day():
    """
    Map batch_code -> the earliest day on which it's physically on-site.

    Right now we don't have explicit delivery dates (project_start_date is TBD).
    Heuristic: each batch's earliest install-day in v1 is when it must be
    on-site. The user will replace this with actual delivery dates from the
    deliveries table when those are set.
    """
    rows = fetch_all("""
        SELECT batch_code, MIN(a.day) AS earliest_day
        FROM assignments a
        JOIN work_items wi ON wi.id = a.work_item_id
        WHERE a.version_id = 1
        GROUP BY batch_code
    """)
    return {r["batch_code"]: r["earliest_day"] for r in rows}


def get_daily_caps():
    """
    Per-day window-install cap, indexed by week (1..5+).

    The crew can install at most N windows in a single day; N can ramp up
    week by week. Stored in config under 'max_windows_per_day' as a JSON
    object {week: cap}. Default 60 for every week.

    (Legacy key 'max_panels_per_week' is read as a fallback so older configs
    don't break, but the value is treated as a per-day cap.)
    """
    r = fetch_one("SELECT value FROM config WHERE key = 'max_windows_per_day'")
    if not r:
        r = fetch_one("SELECT value FROM config WHERE key = 'max_panels_per_week'")
    if not r:
        return {w: 60 for w in range(1, 8)}
    raw = json.loads(r["value"])
    # Normalise keys to ints
    caps = {}
    for k, v in raw.items():
        try:
            caps[int(k)] = int(v)
        except (ValueError, TypeError):
            continue
    return caps


def daily_cap_for(caps: dict, day: int) -> int:
    """The per-day window cap that applies to a given install day."""
    wk = week_of(day)
    if wk in caps:
        return caps[wk]
    # Beyond the configured weeks (project extension): use the last known cap
    if caps:
        return caps[max(caps)]
    return 60


def week_of(day: int) -> int:
    """22 install days span ~5 weeks of 5 working days each."""
    return (day - 1) // 5 + 1


def plan(version_id: int | None = None) -> dict:
    """
    Compute a new schedule version that resolves all pending unavailability
    marks. Returns the diff. Does not commit — call apply_plan() to persist.
    """
    # Start from the active version's assignments
    if version_id is None:
        active = fetch_one(
            "SELECT id FROM schedule_versions WHERE is_active = TRUE"
        )
        version_id = active["id"]

    assignments = {
        r["work_item_id"]: r["day"]
        for r in fetch_all("""
            SELECT work_item_id, day FROM assignments
            WHERE version_id = :v
        """, v=version_id)
    }

    # Work items with their rooms and qty
    wi_rooms = defaultdict(set)
    for r in fetch_all("SELECT work_item_id, room_code FROM work_item_rooms"):
        wi_rooms[r["work_item_id"]].add(r["room_code"])

    wi_meta = {
        r["id"]: {"batch": r["batch_code"], "qty": r["qty"]}
        for r in fetch_all("SELECT id, batch_code, qty FROM work_items")
    }

    # Active pending unavailability marks: room -> set of unavailable days
    unavailable: dict[str, set[int]] = defaultdict(set)
    pending_marks = fetch_all("""
        SELECT id, room_code, day FROM room_unavailability
        WHERE status = 'pending'
    """)
    for m in pending_marks:
        unavailable[m["room_code"]].add(m["day"])

    batch_avail = get_batch_on_site_by_day()
    daily_caps = get_daily_caps()

    # Compute current per-day window load (for capacity checks)
    daily_load: dict[int, int] = defaultdict(int)
    for wi_id, d in assignments.items():
        daily_load[d] += wi_meta[wi_id]["qty"]

    def has_room_conflict(wi_id: str, day: int) -> bool:
        return any(day in unavailable[rc] for rc in wi_rooms[wi_id])

    def fits_capacity(day: int, qty: int) -> bool:
        """
        True if adding `qty` windows to `day` keeps that day at or under its
        per-day cap. This is the real constraint — a single day cannot exceed
        the crew's daily install throughput.
        """
        cap = daily_cap_for(daily_caps, day)
        return daily_load[day] + qty <= cap

    # 1. Identify stuck items.
    #    (a) room conflict — a room is marked unavailable on its day
    #    (b) over-capacity — the day exceeds its per-day window cap; we peel
    #        items off the day (largest first) until it's back under cap
    stuck = []
    seen = set()
    for wi_id, day in assignments.items():
        if has_room_conflict(wi_id, day):
            stuck.append(wi_id)
            seen.add(wi_id)

    # Over-capacity days: peel items until the day fits.
    items_by_day: dict[int, list[str]] = defaultdict(list)
    for wi_id, day in assignments.items():
        items_by_day[day].append(wi_id)
    for day, ids in items_by_day.items():
        cap = daily_cap_for(daily_caps, day)
        load = daily_load[day]
        if load <= cap:
            continue
        # Peel largest items first until under cap; skip already-stuck ones
        peelable = sorted(
            (i for i in ids if i not in seen),
            key=lambda i: -wi_meta[i]["qty"],
        )
        for wi_id in peelable:
            if load <= cap:
                break
            stuck.append(wi_id)
            seen.add(wi_id)
            load -= wi_meta[wi_id]["qty"]

    # 2. For each stuck item, search for a new day
    max_day = max(assignments.values()) if assignments else 22
    moves: list[dict] = []
    unresolvable: list[str] = []

    for wi_id in stuck:
        original_day = assignments[wi_id]
        meta = wi_meta[wi_id]
        batch_ready_from = batch_avail.get(meta["batch"], 1)

        # Search candidate days in order of distance from original day
        candidates = []
        search_horizon = max_day + 5  # allow up to 5 days of project extension
        for d in range(batch_ready_from, search_horizon + 1):
            if d == original_day:
                continue
            if has_room_conflict(wi_id, d):
                continue
            if not fits_capacity(d, meta["qty"]):
                continue
            candidates.append(d)

        if not candidates:
            unresolvable.append(wi_id)
            continue

        # Pick the day closest to original; tie-break: same week first
        def score(d):
            return (
                abs(d - original_day),
                0 if week_of(d) == week_of(original_day) else 1,
                d,  # earlier days preferred among ties
            )
        new_day = min(candidates, key=score)
        moves.append({
            "work_item_id": wi_id,
            "from_day": original_day,
            "to_day": new_day,
            "batch": meta["batch"],
            "qty": meta["qty"],
        })
        # Update working state so subsequent items see the new load
        daily_load[original_day] -= meta["qty"]
        daily_load[new_day] += meta["qty"]
        assignments[wi_id] = new_day

    return {
        "base_version_id": version_id,
        "stuck_count": len(stuck),
        "moves": moves,
        "unresolvable": unresolvable,
        "new_assignments": assignments,
        "applied_marks": [m["id"] for m in pending_marks],
    }


def apply_plan(plan_result: dict, label: str | None = None) -> int:
    """
    Persist a plan result as a new schedule version, activate it, and flip
    contributing unavailability marks to 'applied'. Returns the new version id.
    """
    if plan_result.get("unresolvable"):
        # Caller should check before applying — but we surface the error here
        # as well to be safe.
        raise ValueError(
            f"cannot apply: {len(plan_result['unresolvable'])} unresolvable items"
        )

    parent_id = plan_result["base_version_id"]
    moves = plan_result["moves"]
    new_assignments = plan_result["new_assignments"]
    applied_marks = plan_result["applied_marks"]

    label = label or f"Replan ({len(moves)} items shifted)"

    with engine().begin() as c:
        # Deactivate previous active version
        c.execute(text("UPDATE schedule_versions SET is_active = FALSE WHERE is_active = TRUE"))
        # Insert new version
        c.execute(text("""
            INSERT INTO schedule_versions(label, parent_id, is_active)
            VALUES (:l, :p, TRUE)
        """), {"l": label, "p": parent_id})
        new_v = c.execute(text("""
            SELECT id FROM schedule_versions
            WHERE is_active = TRUE
            ORDER BY id DESC LIMIT 1
        """)).scalar()

        # Build per-day sequence ordering (preserve original within-day order
        # where possible; new arrivals append to the end)
        parent_seq = {
            r[0]: r[1] for r in c.execute(text("""
                SELECT work_item_id, sequence FROM assignments
                WHERE version_id = :v
            """), {"v": parent_id})
        }
        moved_ids = {m["work_item_id"] for m in moves}
        next_seq: dict[int, int] = defaultdict(int)
        # Reserve seq numbers for non-moved items first
        sorted_items = sorted(
            new_assignments.items(),
            key=lambda kv: (kv[0] in moved_ids, parent_seq.get(kv[0], 9999))
        )
        for wi_id, day in sorted_items:
            next_seq[day] += 1
            c.execute(text("""
                INSERT INTO assignments(version_id, work_item_id, day, sequence)
                VALUES (:v, :w, :d, :s)
            """), {"v": new_v, "w": wi_id, "d": day, "s": next_seq[day]})

        # Flip applied marks
        for mid in applied_marks:
            c.execute(text("""
                UPDATE room_unavailability SET status = 'applied' WHERE id = :id
            """), {"id": mid})

        # Bump active_version_id in config
        c.execute(text("""
            UPDATE config SET value = :v WHERE key = 'active_version_id'
        """), {"v": json.dumps(new_v)})

    return new_v
