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
work item on the target day, carrying its proportional share of windows.
"""
from collections import defaultdict
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


def end_day(day: int) -> dict:
    """
    Close out a day. Every room scheduled that day that isn't marked done
    is rolled forward to the earliest cap-safe, conflict-free day.

    Creates ONE new schedule version capturing all the roll-forwards.
    Returns a summary. If everything was finished, no version is created.
    """
    vid = _active_version_id()
    comp = get_day_completion(day)
    unfinished = [r for r in comp["rooms"] if not r["done"]]

    if not unfinished:
        return {"day": day, "all_finished": True, "rolled": []}

    caps = get_daily_caps()
    loads = _day_loads(vid)
    max_day = max(loads) if loads else 22

    # Room conflicts: day -> set of rooms marked unavailable
    unavail = defaultdict(set)
    for r in fetch_all("""
        SELECT day, room_code FROM room_unavailability
        WHERE status IN ('pending', 'applied')
    """):
        unavail[r["day"]].add(r["room_code"])

    # window qty for each unfinished room = proportional share of its
    # work item's qty across that work item's rooms
    wi_info = {}
    for r in unfinished:
        wid = r["work_item_id"]
        if wid not in wi_info:
            wi = fetch_one("SELECT bay, batch_code, qty FROM work_items WHERE id = :i",
                           i=wid)
            rc = fetch_one("""SELECT COUNT(*) AS n FROM work_item_rooms
                              WHERE work_item_id = :i""", i=wid)["n"]
            wi_info[wid] = {"bay": wi["bay"], "batch": wi["batch_code"],
                            "qty": wi["qty"], "room_count": rc}

    rolled = []
    label_bits = []
    with engine().begin() as c:
        # new version
        c.execute(text("UPDATE schedule_versions SET is_active = FALSE WHERE is_active = TRUE"))
        parent = vid
        c.execute(text("""
            INSERT INTO schedule_versions(label, parent_id, is_active)
            VALUES (:l, :p, TRUE)
        """), {"l": f"End of Day {day} — unfinished rooms rolled forward",
               "p": parent})
        new_v = c.execute(text("""
            SELECT id FROM schedule_versions WHERE is_active = TRUE
            ORDER BY id DESC LIMIT 1
        """)).scalar()
        # copy all assignments
        c.execute(text("""
            INSERT INTO assignments(version_id, work_item_id, day, sequence)
            SELECT :nv, work_item_id, day, sequence
            FROM assignments WHERE version_id = :pv
        """), {"nv": new_v, "pv": parent})

        for r in unfinished:
            wid = r["work_item_id"]
            info = wi_info[wid]
            # proportional window share for this one room
            share = max(1, round(info["qty"] / info["room_count"]))

            # find earliest day > current that is cap-safe AND conflict-free
            target = None
            for d in range(day + 1, max_day + 2):
                cap = daily_cap_for(caps, d)
                load = loads.get(d, 0)
                if load + share > cap:
                    continue
                if r["room_code"] in unavail.get(d, set()):
                    continue
                target = d
                break
            if target is None:
                target = max_day + 1  # fallback: a fresh day at the end

            # split this room into its own new work item on the target day
            new_wid = f"{wid}-R-{r['room_code']}"
            seq = c.execute(text("""
                SELECT COALESCE(MAX(sequence),0)+1 FROM assignments
                WHERE version_id = :v AND day = :d
            """), {"v": new_v, "d": target}).scalar()

            # create the split work item if it doesn't exist
            exists = c.execute(text("SELECT 1 FROM work_items WHERE id = :i"),
                               {"i": new_wid}).first()
            if not exists:
                c.execute(text("""
                    INSERT INTO work_items(id, bay, batch_code, rooms_text,
                                           qty, source_day, sequence)
                    VALUES (:i, :b, :bt, :rt, :q, :sd, :sq)
                """), {"i": new_wid, "b": info["bay"], "bt": info["batch"],
                       "rt": f"{r['room_code']} (rolled from Day {day})",
                       "q": share, "sd": target, "sq": seq})
                c.execute(text("""
                    INSERT INTO work_item_rooms(work_item_id, room_code)
                    VALUES (:w, :r)
                """), {"w": new_wid, "r": r["room_code"]})

            # reduce the original work item's qty by the moved room's share
            c.execute(text("""
                UPDATE work_items SET qty = MAX(0, qty - :s) WHERE id = :i
            """), {"s": share, "i": wid})

            # assign the split item to the target day in the new version
            c.execute(text("""
                INSERT INTO assignments(version_id, work_item_id, day, sequence)
                VALUES (:v, :w, :d, :sq)
            """), {"v": new_v, "w": new_wid, "d": target, "sq": seq})

            # audit
            c.execute(text("""
                INSERT INTO unfinished_rollovers(work_item_id, room_code,
                                                 from_day, to_day, version_id)
                VALUES (:w, :r, :fd, :td, :v)
            """), {"w": wid, "r": r["room_code"], "fd": day,
                   "td": target, "v": new_v})

            loads[target] = loads.get(target, 0) + share
            rolled.append({"room_code": r["room_code"], "bay": info["bay"],
                           "from_day": day, "to_day": target,
                           "windows": share})
            label_bits.append(f"{r['room_code']}→D{target}")

        # keep config.active_version_id in sync if present
        c.execute(text("""
            UPDATE config SET value = :v WHERE key = 'active_version_id'
        """), {"v": str(new_v)})

    return {
        "day": day,
        "all_finished": False,
        "new_version_id": new_v,
        "rolled": rolled,
        "rolled_count": len(rolled),
    }
