"""
Seed the database from schedule.json. Idempotent: skips if work_items already populated.

Run with: python -m app.seed
"""
import json
import re
from pathlib import Path
from app.db import engine, fetch_one
from sqlalchemy import text

ROOT = Path(__file__).resolve().parent.parent
SCHEDULE = ROOT / "schedule.json"

ROOM_RE = re.compile(r"\b(RM|COR)[-\s]?(\d+)\b", re.IGNORECASE)


def parse_rooms(rooms_text: str) -> list[tuple[str, str]]:
    cleaned = re.sub(r"\([^)]*\)", "", rooms_text)
    out, seen = [], set()
    for m in ROOM_RE.finditer(cleaned):
        prefix = m.group(1).upper()
        num = int(m.group(2))
        code = f"RM-{num:02d}" if prefix == "RM" else f"COR-{num}"
        kind = "room" if prefix == "RM" else "corridor"
        if code not in seen:
            seen.add(code)
            out.append((code, kind))
    return out


def extract_description(rooms_text: str) -> str:
    m = re.search(r"\(([^)]*)\)", rooms_text)
    return m.group(1).strip() if m else ""


def already_seeded() -> bool:
    r = fetch_one("SELECT COUNT(*) AS n FROM work_items")
    return bool(r and r["n"] > 0)


def seed():
    if already_seeded():
        print("Already seeded — skipping.")
        return
    if not SCHEDULE.exists():
        print(f"ERROR: {SCHEDULE} not found")
        return

    schedule = json.loads(SCHEDULE.read_text())

    with engine().begin() as c:
        # Panel types
        for code in ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"]:
            c.execute(text("INSERT INTO panel_types(code) VALUES (:c)"), {"c": code})

        # Batches
        batches = sorted({b["batch"] for d in schedule["days"] for b in d["install"]["bays"]})
        for b in batches:
            c.execute(text("INSERT INTO batches(code) VALUES (:c)"), {"c": b})

        # Deliveries — default 3-truck setup, user can adjust later
        for label in ["Truck 1", "Truck 2", "Truck 3"]:
            c.execute(text("INSERT INTO deliveries(label) VALUES (:l)"), {"l": label})
        default_map = {
            1: ["01", "02", "03", "04"],
            2: ["05", "06", "07"],
            3: ["08"],
        }
        for did, blist in default_map.items():
            for b in blist:
                if b in batches:
                    c.execute(text("""
                        INSERT INTO delivery_batches(delivery_id, batch_code)
                        VALUES (:d, :b)
                    """), {"d": did, "b": b})

        # Rooms
        rooms_map = {}
        for d in schedule["days"]:
            for bay in d["install"]["bays"]:
                desc = extract_description(bay["rooms"])
                for code, kind in parse_rooms(bay["rooms"]):
                    if code not in rooms_map:
                        rooms_map[code] = (kind, desc)
        for code, (kind, desc) in sorted(rooms_map.items()):
            c.execute(text("""
                INSERT INTO rooms(code, kind, description)
                VALUES (:c, :k, :d)
            """), {"c": code, "k": kind, "d": desc})

        # Two schedule versions are created on a fresh seed:
        #   * 'Original' (V2): the cap-exact schedule straight from schedule.json
        #     (bays split across days, ~23 working days). Kept for reference but
        #     INACTIVE.
        #   * 'V1 — Whole Bays (28 day)': the hospital-facing schedule. The SAME
        #     work items, re-dated onto the woodhull_walk V1 route (whole bays,
        #     no splitting, 28 days). This is the ACTIVE version.
        # Only ONE may be active at a time (partial unique index, migration 0004).
        c.execute(text(
            "INSERT INTO schedule_versions(label, is_active) VALUES ('Original', :a)"
        ), {"a": False})
        v2_id = c.execute(text(
            "SELECT id FROM schedule_versions WHERE label = 'Original'"
        )).scalar()
        c.execute(text(
            "INSERT INTO schedule_versions(label, is_active) "
            "VALUES ('V1 — Whole Bays (28 day)', :a)"
        ), {"a": True})
        v1_id = c.execute(text(
            "SELECT id FROM schedule_versions WHERE label = 'V1 — Whole Bays (28 day)'"
        )).scalar()

        # V1 ("whole bays") day layout, copied from woodhull_walk Version 1:
        # run-lengths of how many consecutive bays (ascending 01..83) install on
        # each of the 28 days. Sums to 83 bays across 28 days.
        V1_RUNS = [5, 1, 1, 1, 2, 2, 1, 1, 3, 2, 2, 2, 5, 4,
                   2, 2, 5, 6, 2, 2, 4, 5, 2, 2, 6, 6, 6, 1]
        bay_to_v1_day, _b = {}, 1
        for _day, _n in enumerate(V1_RUNS, start=1):
            for _ in range(_n):
                bay_to_v1_day[f"{_b:02d}"] = _day
                _b += 1
        v1_seq_per_day: dict[int, int] = {}

        # Work items + assignments + panels + rooms
        seq_per_day = {}
        for d in schedule["days"]:
            for bay in d["install"]["bays"]:
                seq_per_day[d["day"]] = seq_per_day.get(d["day"], 0) + 1
                seq = seq_per_day[d["day"]]
                c.execute(text("""
                    INSERT INTO work_items
                      (id, bay, batch_code, rooms_text, qty, source_day, sequence)
                    VALUES (:id, :bay, :batch, :rt, :qty, :sd, :seq)
                """), {"id": bay["id"], "bay": bay["bay"], "batch": bay["batch"],
                       "rt": bay["rooms"], "qty": bay["qty"],
                       "sd": d["day"], "seq": seq})
                c.execute(text("""
                    INSERT INTO assignments(version_id, work_item_id, day, sequence)
                    VALUES (:v, :id, :day, :seq)
                """), {"v": v2_id, "id": bay["id"], "day": d["day"], "seq": seq})
                # Same work item, placed on its V1 (whole-bays) day too.
                v1d = bay_to_v1_day[bay["bay"]]
                v1_seq_per_day[v1d] = v1_seq_per_day.get(v1d, 0) + 1
                c.execute(text("""
                    INSERT INTO assignments(version_id, work_item_id, day, sequence)
                    VALUES (:v, :id, :day, :seq)
                """), {"v": v1_id, "id": bay["id"], "day": v1d,
                       "seq": v1_seq_per_day[v1d]})
                for ptype, qty in bay["panels"].items():
                    c.execute(text("""
                        INSERT INTO work_item_panels(work_item_id, panel_code, qty)
                        VALUES (:id, :p, :q)
                    """), {"id": bay["id"], "p": ptype, "q": qty})
                for code, _kind in parse_rooms(bay["rooms"]):
                    c.execute(text("""
                        INSERT INTO work_item_rooms(work_item_id, room_code)
                        VALUES (:id, :r)
                    """), {"id": bay["id"], "r": code})

        # Config
        defaults = {
            "project_start_date": None,
            "max_panels_per_week": {"1": 65, "2": 65, "3": 65, "4": 65, "5": 65},
            "active_version_id": v1_id,
        }
        for k, v in defaults.items():
            c.execute(text("INSERT INTO config(key, value) VALUES (:k, :v)"),
                      {"k": k, "v": json.dumps(v)})

    print("Seed complete.")


if __name__ == "__main__":
    seed()
