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

        # Initial version (Original).
        #
        # seed() must NOT assume it is the first thing to create a schedule
        # version. Migrations run before seed() on startup, and a migration may
        # legitimately pre-create another version (e.g. 0005 adds V1). Because a
        # partial unique index allows only ONE active version (migration 0004),
        # blindly inserting this row as active would collide. So claim "active"
        # only if nothing else already holds it.
        existing_active = c.execute(text(
            "SELECT COUNT(*) FROM schedule_versions WHERE is_active"
        )).scalar()
        c.execute(text("""
            INSERT INTO schedule_versions(label, is_active)
            VALUES ('Original', :active)
        """), {"active": existing_active == 0})
        v1 = c.execute(text(
            "SELECT id FROM schedule_versions WHERE label = 'Original'"
        )).scalar()

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
                """), {"v": v1, "id": bay["id"], "day": d["day"], "seq": seq})
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
            "active_version_id": v1,
        }
        for k, v in defaults.items():
            c.execute(text("INSERT INTO config(key, value) VALUES (:k, :v)"),
                      {"k": k, "v": json.dumps(v)})

    print("Seed complete.")


if __name__ == "__main__":
    seed()
