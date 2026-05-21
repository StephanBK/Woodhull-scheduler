"""
Per-room install completion + end-of-day roll-forward.

The installer marks each room done as they finish it. At end of day, any
room scheduled that day that isn't done is "unfinished" and must move to a
later day.

Roll-forward rule (minimal change — no rat-tail cascade):
  An unfinished room moves to the EARLIEST day that
    (a) doesn't push that day over its per-day window cap, and
    (b) has no room conflict (the room isn't marked unavailable there).
  Only that one room moves. Every other day is left untouched. If the next
  day is full it keeps looking forward — possibly to the last day.

A room is moved by splitting it out of its work item into its own new
work item on the target day. The split carries an exact integer share
of the work item's windows and panels (shares always sum back to the
original -- nothing is created or lost), and the room is removed from
the original work item so it is never scheduled twice.
"""
from collections import defaultdict
import json
from sqlalchemy import text
from app.db import fetch_all, fetch_one, engine
from app.optimizer import get_daily_caps, daily_cap_for


def _active_version_id() -> int:
    r = fetch_one("""
        SELECT id FROM schedule_versions
        WHERE is_active = TRUE ORDER BY id DESC LIMIT 1
    """)
    return r["id"] if r else None


def get_day_completion(day: int) -> dict:
    """
    Completion status for every room scheduled on `day`:
    which rooms are done, which are still outstanding.
    """
    vid = _active_version_id()
    rows = fetch_all("""
        SELECT wi.id AS work_item_id, wi.bay, wir.room_code, wi.qty,
               (SELECT COUNT(*) FROM work_item_rooms wr
                WHERE wr.work_item_id = wi.id) AS room_count
        FROM assignments a
        JOIN work_items wi       ON wi.id = a.work_item_id
        JOIN work_item_rooms wir ON wir.work_item_id = wi.id
        WHERE a.version_id = :v AND a.day = :d
        ORDER BY wi.bay, wir.room_code
    """, v=vid, d=day)

    done = {
        (r["work_item_id"], r["room_code"])
        for r in fetch_all("""
            SELECT work_item_id, room_code FROM room_completion
            WHERE day = :d AND status = 'done'
        """, d=day)
    }

    rooms = []
    for r in rows:
        rooms.append({
            "work_item_id": r["work_item_id"],
            "bay": r["bay"],
            "room_code": r["room_code"],
            "done": (r["work_item_id"], r["room_code"]) in done,
        })
    n_done = sum(1 for x in rooms if x["done"])
    return {
        "day": day,
        "rooms": rooms,
        "total": len(rooms),
        "done": n_done,
        "unfinished": len(rooms) - n_done,
    }


def mark_room(work_item_id: str, room_code: str, day: int,
              done: bool = True) -> dict:
    """Mark a single room done (or undo it)."""
    with engine().begin() as c:
        if done:
            # upsert
            existing = c.execute(text("""
                SELECT id FROM room_completion
                WHERE work_item_id = :w AND room_code = :r AND day = :d
            """), {"w": work_item_id, "r": room_code, "d": day}).first()
            if not existing:
                c.execute(text("""
                    INSERT INTO room_completion(work_item_id, room_code, day,
                                                status, marked_by)
                    VALUES (:w, :r, :d, 'done', 'installer')
                """), {"w": work_item_id, "r": room_code, "d": day})
        else:
            c.execute(text("""
                DELETE FROM room_completion
                WHERE work_item_id = :w AND room_code = :r AND day = :d
            """), {"w": work_item_id, "r": room_code, "d": day})
    return {"work_item_id": work_item_id, "room_code": room_code,
            "day": day, "done": done}


def project_progress() -> dict:
    """Project-wide completion: rooms done vs. total scheduled."""
    vid = _active_version_id()
    total = fetch_one("""
        SELECT COUNT(*) AS n
        FROM assignments a
        JOIN work_item_rooms wir ON wir.work_item_id = a.work_item_id
        WHERE a.version_id = :v
    """, v=vid)["n"]
    done = fetch_one("""
        SELECT COUNT(*) AS n FROM room_completion WHERE status = 'done'
    """)["n"]
    pct = round(100 * done / total) if total else 0
    return {"rooms_done": done, "rooms_total": total, "percent": pct}


def _day_loads(vid: int) -> dict:
    """Current window load per day for the active version."""
    rows = fetch_all("""
        SELECT a.day, SUM(wi.qty) AS load
        FROM assignments a
        JOIN work_items wi ON wi.id = a.work_item_id
        WHERE a.version_id = :v
        GROUP BY a.day
    """, v=vid)
    return {r["day"]: r["load"] for r in rows}


def _split_evenly(total: int, parts: int) -> list[int]:
    """
    Divide `total` into `parts` non-negative integers that sum to EXACTLY
    `total`. The first `total % parts` parts get one extra.

      _split_evenly(7, 2) -> [4, 3]      (4 + 3 == 7)
      _split_evenly(7, 3) -> [3, 2, 2]   (3 + 2 + 2 == 7)

    This is the core of "conserve windows": rounding each part on its own
    invents or loses units; this never does.
    """
    if parts <= 0:
        return []
    base, remainder = divmod(total, parts)
    return [base + 1 if i < remainder else base for i in range(parts)]


def _partition_work_item(wi_id: str) -> dict:
    """
    Split a work item's windows (and panels, when recorded) across its
    rooms, deterministically by room code.

    Returns: { room_code: {"share": int, "panels": {panel_code: qty}} }

    The shares always sum to the work item's total, so when a room is rolled
    out the windows and panels are neither created nor lost. When the work
    item has panel records, a room's window share is the sum of its panel
    shares -- that keeps the invariant "qty == sum of panels" true for the
    split-out item as well.
    """
    rooms = [
        r["room_code"] for r in fetch_all(
            "SELECT room_code FROM work_item_rooms "
            "WHERE work_item_id = :i ORDER BY room_code", i=wi_id)
    ]
    result = {rc: {"share": 0, "panels": {}} for rc in rooms}
    n = len(rooms)
    if n == 0:
        return result

    panels = fetch_all(
        "SELECT panel_code, qty FROM work_item_panels "
        "WHERE work_item_id = :i ORDER BY panel_code", i=wi_id)

    if panels:
        # Partition every panel type across the rooms; a room's window
        # share is the sum of the panels it receives.
        for p in panels:
            split = _split_evenly(p["qty"], n)
            for i, rc in enumerate(rooms):
                if split[i]:
                    result[rc]["panels"][p["panel_code"]] = split[i]
                result[rc]["share"] += split[i]
    else:
        # No panel records -- partition the raw window count instead.
        wi = fetch_one("SELECT qty FROM work_items WHERE id = :i", i=wi_id)
        split = _split_evenly(wi["qty"] if wi else 0, n)
        for i, rc in enumerate(rooms):
            result[rc]["share"] = split[i]

    return result


def end_day(day: int) -> dict:
    """
    Close out a day. Every room scheduled that day that isn't marked done
    is rolled forward to the earliest cap-safe, conflict-free day.

    Creates ONE new schedule version capturing all the roll-forwards. If
    everything was finished, no version is created.

    Safe to call more than once: a rolled room is removed from its original
    work item, so a second call on the same day finds nothing left to roll.
    """
    vid = _active_version_id()
    comp = get_day_completion(day)
    unfinished = [r for r in comp["rooms"] if not r["done"]]

    if not unfinished:
        return {"day": day, "all_finished": True, "rolled": []}

    caps = get_daily_caps()
    loads = _day_loads(vid)
    max_day = max(loads) if loads else 22

    # Room conflicts: day -> set of rooms marked unavailable.
    unavail = defaultdict(set)
    for r in fetch_all("""
        SELECT day, room_code FROM room_unavailability
        WHERE status IN ('pending', 'applied')
    """):
        unavail[r["day"]].add(r["room_code"])

    # Partition each affected work item ONCE, before the transaction, so
    # every room's window/panel share is known and sums back to the original.
    partitions = {}
    wi_meta = {}
    for r in unfinished:
        wid = r["work_item_id"]
        if wid not in partitions:
            partitions[wid] = _partition_work_item(wid)
            m = fetch_one(
                "SELECT bay, batch_code FROM work_items WHERE id = :i", i=wid)
            wi_meta[wid] = {
                "bay": m["bay"] if m else "",
                "batch": m["batch_code"] if m else "",
            }

    rolled = []
    with engine().begin() as c:
        # New schedule version.
        c.execute(text(
            "UPDATE schedule_versions SET is_active = FALSE "
            "WHERE is_active = TRUE"))
        c.execute(text("""
            INSERT INTO schedule_versions(label, parent_id, is_active)
            VALUES (:l, :p, TRUE)
        """), {"l": f"End of Day {day} — unfinished rooms rolled forward",
               "p": vid})
        new_v = c.execute(text("""
            SELECT id FROM schedule_versions WHERE is_active = TRUE
            ORDER BY id DESC LIMIT 1
        """)).scalar()

        # Copy every assignment from the parent version into the new one.
        c.execute(text("""
            INSERT INTO assignments(version_id, work_item_id, day, sequence)
            SELECT :nv, work_item_id, day, sequence
            FROM assignments WHERE version_id = :pv
        """), {"nv": new_v, "pv": vid})

        affected_parents = set()

        for r in unfinished:
            wid = r["work_item_id"]
            room = r["room_code"]
            part = partitions[wid].get(room, {"share": 0, "panels": {}})
            share = part["share"]
            room_panels = part["panels"]
            meta = wi_meta[wid]
            affected_parents.add(wid)

            # Earliest day after `day` that is cap-safe and conflict-free.
            target = None
            for d in range(day + 1, max_day + 2):
                if loads.get(d, 0) + share > daily_cap_for(caps, d):
                    continue
                if room in unavail.get(d, set()):
                    continue
                target = d
                break
            if target is None:
                target = max_day + 1  # fallback: a fresh day at the end

            new_wid = f"{wid}-R-{room}"
            seq = c.execute(text("""
                SELECT COALESCE(MAX(sequence), 0) + 1 FROM assignments
                WHERE version_id = :v AND day = :d
            """), {"v": new_v, "d": target}).scalar()

            # Create the split work item (with its rooms and panels) if it
            # does not already exist.
            exists = c.execute(
                text("SELECT 1 FROM work_items WHERE id = :i"),
                {"i": new_wid}).first()
            if not exists:
                c.execute(text("""
                    INSERT INTO work_items(id, bay, batch_code, rooms_text,
                                           qty, source_day, sequence)
                    VALUES (:i, :b, :bt, :rt, :q, :sd, :sq)
                """), {"i": new_wid, "b": meta["bay"], "bt": meta["batch"],
                       "rt": f"{room} (rolled from Day {day})",
                       "q": share, "sd": target, "sq": seq})
                c.execute(text("""
                    INSERT INTO work_item_rooms(work_item_id, room_code)
                    VALUES (:w, :r)
                """), {"w": new_wid, "r": room})
                for pc, pq in room_panels.items():
                    c.execute(text("""
                        INSERT INTO work_item_panels(work_item_id,
                                                     panel_code, qty)
                        VALUES (:w, :p, :q)
                    """), {"w": new_wid, "p": pc, "q": pq})

            # Remove the room from its ORIGINAL work item, so it is no longer
            # scheduled on the old day. This is also what makes end_day safe
            # to call twice: the room can't be re-found on the closed day.
            c.execute(text("""
                DELETE FROM work_item_rooms
                WHERE work_item_id = :w AND room_code = :r
            """), {"w": wid, "r": room})

            # Take the room's panel share off the parent, and reduce the
            # parent's window count by exactly the rolled share -- so windows
            # and panels are conserved, never duplicated.
            for pc, pq in room_panels.items():
                c.execute(text("""
                    UPDATE work_item_panels SET qty = qty - :q
                    WHERE work_item_id = :w AND panel_code = :p
                """), {"q": pq, "w": wid, "p": pc})
            c.execute(text("""
                DELETE FROM work_item_panels
                WHERE work_item_id = :w AND qty <= 0
            """), {"w": wid})
            c.execute(text("""
                UPDATE work_items SET qty = MAX(0, qty - :s) WHERE id = :i
            """), {"s": share, "i": wid})

            # Place the split item on the target day in the new version.
            c.execute(text("""
                INSERT INTO assignments(version_id, work_item_id, day,
                                        sequence)
                VALUES (:v, :w, :d, :sq)
            """), {"v": new_v, "w": new_wid, "d": target, "sq": seq})

            # Audit trail.
            c.execute(text("""
                INSERT INTO unfinished_rollovers(work_item_id, room_code,
                                                 from_day, to_day, version_id)
                VALUES (:w, :r, :fd, :td, :v)
            """), {"w": wid, "r": room, "fd": day, "td": target, "v": new_v})

            loads[target] = loads.get(target, 0) + share
            rolled.append({"room_code": room, "bay": meta["bay"],
                           "from_day": day, "to_day": target,
                           "windows": share})

        # Keep each affected parent's human-readable rooms_text honest after
        # rooms were removed from it.
        for wid in affected_parents:
            remaining = [
                row[0] for row in c.execute(text(
                    "SELECT room_code FROM work_item_rooms "
                    "WHERE work_item_id = :w ORDER BY room_code"),
                    {"w": wid})
            ]
            c.execute(text(
                "UPDATE work_items SET rooms_text = :t WHERE id = :w"),
                {"t": ", ".join(remaining), "w": wid})

        # Keep config.active_version_id in sync. Written via json.dumps so it
        # matches seed.py and apply_plan -- every config value is stored as
        # JSON, the format get_config() expects (Tier-2 #7).
        c.execute(text("""
            UPDATE config SET value = :v WHERE key = 'active_version_id'
        """), {"v": json.dumps(new_v)})

    return {
        "day": day,
        "all_finished": False,
        "new_version_id": new_v,
        "rolled": rolled,
        "rolled_count": len(rolled),
    }
