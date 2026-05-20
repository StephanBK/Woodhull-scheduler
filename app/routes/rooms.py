from fastapi import APIRouter
from app.db import fetch_all

router = APIRouter(tags=["rooms"])


@router.get("/rooms")
def list_rooms():
    """Every room/corridor in the project + the days it's scheduled.

    Used by the hospital UI to pick a room and see when work happens there.
    """
    rooms = fetch_all("""
        SELECT code, kind, description FROM rooms ORDER BY code
    """)
    assignments = fetch_all("""
        SELECT wir.room_code, a.day, wi.id AS work_item_id
        FROM work_item_rooms wir
        JOIN assignments a ON a.work_item_id = wir.work_item_id
        JOIN schedule_versions sv ON sv.id = a.version_id
        JOIN work_items wi ON wi.id = wir.work_item_id
        WHERE sv.is_active = TRUE
    """)
    days_by_room: dict[str, list[dict]] = {}
    for a in assignments:
        days_by_room.setdefault(a["room_code"], []).append(
            {"day": a["day"], "work_item_id": a["work_item_id"]}
        )
    for r in rooms:
        r["scheduled"] = sorted(days_by_room.get(r["code"], []),
                                key=lambda x: x["day"])
    return rooms
