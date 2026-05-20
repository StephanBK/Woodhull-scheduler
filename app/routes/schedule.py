"""
Schedule endpoints.

Concept: We always read from the *active* schedule version (latest accepted
plan). Historic versions are queryable by id for audit / diffing.
"""
from fastapi import APIRouter, HTTPException
from app.db import fetch_all, fetch_one

router = APIRouter(tags=["schedule"])


def active_version_id() -> int:
    r = fetch_one("""
        SELECT id FROM schedule_versions
        WHERE is_active = TRUE
        ORDER BY id DESC LIMIT 1
    """)
    if not r:
        raise HTTPException(500, "no active schedule version")
    return r["id"]


@router.get("/schedule")
def get_schedule(version_id: int | None = None):
    """Full schedule grouped by day, for INOVUES Gantt view."""
    vid = version_id or active_version_id()

    items = fetch_all("""
        SELECT a.day, a.sequence, wi.id, wi.bay, wi.batch_code,
               wi.rooms_text, wi.qty
        FROM assignments a
        JOIN work_items wi ON wi.id = a.work_item_id
        WHERE a.version_id = :v
        ORDER BY a.day, a.sequence
    """, v=vid)

    # Panels per work item
    panels = fetch_all("""
        SELECT wip.work_item_id, wip.panel_code, wip.qty
        FROM work_item_panels wip
        JOIN assignments a ON a.work_item_id = wip.work_item_id
        WHERE a.version_id = :v
    """, v=vid)
    panel_map: dict[str, dict[str, int]] = {}
    for p in panels:
        panel_map.setdefault(p["work_item_id"], {})[p["panel_code"]] = p["qty"]

    # Rooms per work item
    rooms = fetch_all("""
        SELECT wir.work_item_id, wir.room_code
        FROM work_item_rooms wir
        JOIN assignments a ON a.work_item_id = wir.work_item_id
        WHERE a.version_id = :v
    """, v=vid)
    room_map: dict[str, list[str]] = {}
    for r in rooms:
        room_map.setdefault(r["work_item_id"], []).append(r["room_code"])

    # Group by day
    by_day: dict[int, dict] = {}
    for it in items:
        d = it["day"]
        if d not in by_day:
            by_day[d] = {"day": d, "items": [], "total_windows": 0,
                         "panel_totals": {}}
        wi = {
            "id": it["id"],
            "bay": it["bay"],
            "batch": it["batch_code"],
            "rooms_text": it["rooms_text"],
            "rooms": room_map.get(it["id"], []),
            "qty": it["qty"],
            "panels": panel_map.get(it["id"], {}),
            "sequence": it["sequence"],
        }
        by_day[d]["items"].append(wi)
        by_day[d]["total_windows"] += it["qty"]
        for p, q in wi["panels"].items():
            by_day[d]["panel_totals"][p] = by_day[d]["panel_totals"].get(p, 0) + q

    return {"version_id": vid, "days": [by_day[k] for k in sorted(by_day.keys())]}


@router.get("/schedule/day/{day}")
def get_day(day: int, version_id: int | None = None):
    """One day's plan — what the installer sees in the morning."""
    vid = version_id or active_version_id()
    items = fetch_all("""
        SELECT a.sequence, wi.id, wi.bay, wi.batch_code, wi.rooms_text, wi.qty
        FROM assignments a
        JOIN work_items wi ON wi.id = a.work_item_id
        WHERE a.version_id = :v AND a.day = :d
        ORDER BY a.sequence
    """, v=vid, d=day)
    if not items:
        raise HTTPException(404, f"no items on day {day}")

    out_items = []
    total = 0
    panel_totals: dict[str, int] = {}
    for it in items:
        panels = fetch_all("""
            SELECT panel_code, qty FROM work_item_panels
            WHERE work_item_id = :id
        """, id=it["id"])
        panel_dict = {p["panel_code"]: p["qty"] for p in panels}
        rooms = fetch_all("""
            SELECT room_code FROM work_item_rooms WHERE work_item_id = :id
        """, id=it["id"])
        out_items.append({
            "id": it["id"],
            "bay": it["bay"],
            "batch": it["batch_code"],
            "rooms_text": it["rooms_text"],
            "rooms": [r["room_code"] for r in rooms],
            "qty": it["qty"],
            "panels": panel_dict,
            "sequence": it["sequence"],
        })
        total += it["qty"]
        for p, q in panel_dict.items():
            panel_totals[p] = panel_totals.get(p, 0) + q

    return {
        "version_id": vid,
        "day": day,
        "total_windows": total,
        "panel_totals": panel_totals,
        "items": out_items,
    }


@router.get("/schedule/versions")
def list_versions():
    return fetch_all("""
        SELECT id, label, created_at, parent_id, is_active
        FROM schedule_versions
        ORDER BY id DESC
    """)
