"""
Room unavailability endpoints — hospital marks rooms as unavailable on a day.

A mark is created in `pending` state. The optimizer (Chunk 7) reads pending
marks, replans the schedule, and flips them to `applied`. Hospital can cancel
a pending mark; applied marks are immutable history.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.db import fetch_all, fetch_one, execute, engine
from sqlalchemy import text

router = APIRouter(tags=["unavailability"])


class MarkCreate(BaseModel):
    room_code: str
    day: int = Field(ge=1, le=30)
    marked_by: Optional[str] = None
    reason: Optional[str] = None


@router.get("/unavailability")
def list_marks(day: Optional[int] = None, status: Optional[str] = None):
    """List room-unavailability marks, optionally filtered by day or status."""
    sql = """
        SELECT ru.id, ru.room_code, r.description AS room_desc,
               ru.day, ru.marked_by, ru.marked_at, ru.reason, ru.status
        FROM room_unavailability ru
        JOIN rooms r ON r.code = ru.room_code
        WHERE 1=1
    """
    params = {}
    if day is not None:
        sql += " AND ru.day = :day"
        params["day"] = day
    if status:
        sql += " AND ru.status = :status"
        params["status"] = status
    sql += " ORDER BY ru.marked_at DESC"
    return fetch_all(sql, **params)


@router.post("/unavailability")
def create_mark(payload: MarkCreate):
    """Mark a room unavailable. Idempotent on (room_code, day, status=pending)."""
    # Verify room exists
    if not fetch_one("SELECT code FROM rooms WHERE code = :c",
                     c=payload.room_code):
        raise HTTPException(404, f"unknown room {payload.room_code}")
    # Idempotent: if pending mark already exists, return it
    existing = fetch_one("""
        SELECT id FROM room_unavailability
        WHERE room_code = :c AND day = :d AND status = 'pending'
    """, c=payload.room_code, d=payload.day)
    if existing:
        return {"id": existing["id"], "idempotent": True}

    with engine().begin() as c:
        result = c.execute(text("""
            INSERT INTO room_unavailability(room_code, day, marked_by, reason, status)
            VALUES (:c, :d, :mb, :r, 'pending')
        """), {"c": payload.room_code, "d": payload.day,
               "mb": payload.marked_by, "r": payload.reason})
        # Get the new id portably (SQLite via lastrowid, Postgres via RETURNING)
        new_id = (
            result.lastrowid
            if hasattr(result, "lastrowid") and result.lastrowid
            else c.execute(text("""
                SELECT id FROM room_unavailability
                WHERE room_code = :c AND day = :d
                ORDER BY id DESC LIMIT 1
            """), {"c": payload.room_code, "d": payload.day}).scalar()
        )
    return {"id": new_id, "idempotent": False}


@router.delete("/unavailability/{mark_id}")
def cancel_mark(mark_id: int):
    """Cancel a pending mark. Applied marks cannot be cancelled — they're history."""
    m = fetch_one(
        "SELECT id, status FROM room_unavailability WHERE id = :id",
        id=mark_id,
    )
    if not m:
        raise HTTPException(404, "mark not found")
    if m["status"] != "pending":
        raise HTTPException(
            400,
            f"cannot cancel a mark in status '{m['status']}'"
        )
    execute(
        "UPDATE room_unavailability SET status = 'cancelled' WHERE id = :id",
        id=mark_id,
    )
    return {"ok": True}


@router.get("/unavailability/rooms-for-day/{day}")
def rooms_for_day(day: int):
    """
    Return all rooms (with their bay + work item context) that have scheduled
    work on this day, so the hospital UI can show what's at risk.
    """
    rows = fetch_all("""
        SELECT DISTINCT wir.room_code, r.description AS room_desc,
               r.kind, wi.id AS work_item_id, wi.bay, wi.qty
        FROM assignments a
        JOIN work_items wi      ON wi.id = a.work_item_id
        JOIN work_item_rooms wir ON wir.work_item_id = wi.id
        JOIN rooms r            ON r.code = wir.room_code
        JOIN schedule_versions sv ON sv.id = a.version_id
        WHERE sv.is_active = TRUE AND a.day = :day
        ORDER BY wir.room_code
    """, day=day)
    # Group by room_code (a room can be touched by multiple work items)
    by_room: dict[str, dict] = {}
    for r in rows:
        rc = r["room_code"]
        if rc not in by_room:
            by_room[rc] = {
                "room_code": rc,
                "room_desc": r["room_desc"],
                "kind": r["kind"],
                "work_items": [],
            }
        by_room[rc]["work_items"].append({
            "id": r["work_item_id"],
            "bay": r["bay"],
            "qty": r["qty"],
        })
    # Mark which already have pending unavailability marks
    pending = fetch_all("""
        SELECT room_code FROM room_unavailability
        WHERE day = :day AND status = 'pending'
    """, day=day)
    pending_set = {p["room_code"] for p in pending}
    for r in by_room.values():
        r["already_marked"] = r["room_code"] in pending_set
    return list(by_room.values())
