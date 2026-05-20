from fastapi import APIRouter, HTTPException
from app.db import fetch_all, fetch_one

router = APIRouter(tags=["work-items"])


@router.get("/work-items/{wi_id}")
def get_work_item(wi_id: str):
    wi = fetch_one("""
        SELECT id, bay, batch_code, rooms_text, qty, source_day, sequence
        FROM work_items WHERE id = :id
    """, id=wi_id)
    if not wi:
        raise HTTPException(404, "work item not found")
    wi["panels"] = {
        r["panel_code"]: r["qty"]
        for r in fetch_all(
            "SELECT panel_code, qty FROM work_item_panels WHERE work_item_id = :id",
            id=wi_id)
    }
    wi["rooms"] = [
        r["room_code"]
        for r in fetch_all(
            "SELECT room_code FROM work_item_rooms WHERE work_item_id = :id",
            id=wi_id)
    ]
    return wi
