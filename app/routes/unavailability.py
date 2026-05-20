"""
Room unavailability marks (hospital-driven).

A "mark" is the hospital saying: room X is not accessible on day Y.
Marks queue with status='pending' until the optimizer (Chunk 7) consumes
them and produces a new schedule version. Once applied, status flips
to 'applied'. The hospital can also cancel a pending mark.
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.db import fetch_all, fetch_one, execute, engine
from sqlalchemy import text

router = APIRouter(tags=["unavailability"])


class MarkPayload(BaseModel):
    room_code: str
    day: int
    marked_by: Optional[str] = None
    reason: Optional[str] = None


@router.get("/unavailability")
def list_marks(status: Optional[str] = None):
    """All marks, optionally filtered by status (pending|applied|cancelled)."""
    if status:
        rows = fetch_all("""
            SELECT id, room_code, day, marked_by, marked_at, reason, status
            FROM room_unavailability
            WHERE status = :s
            ORDER BY marked_at DESC
        """, s=status)
    else:
        rows = fetch_all("""
            SELECT id, room_code, day, marked_by, marked_at, reason, status
            FROM room_unavailability
            ORDER BY marked_at DESC
        """)
    return rows


@router.post("/unavailability")
def add_mark(payload: MarkPayload):
    """Create a pending unavailability mark."""
    room = fetch_one("SELECT code FROM rooms WHERE code = :c", c=payload.room_code)
    if not room:
        raise HTTPException(404, f"room {payload.room_code} not found")
    if payload.day < 1 or payload.day > 22:
        raise HTTPException(400, "day must be 1..22")

    existing = fetch_one("""
        SELECT id FROM room_unavailability
        WHERE room_code = :c AND day = :d AND status = 'pending'
    """, c=payload.room_code, d=payload.day)
    if existing:
        raise HTTPException(409,
            f"already a pending mark for {payload.room_code} on day {payload.day}")

    with engine().begin() as c:
        c.execute(text("""
            INSERT INTO room_unavailability(room_code, day, marked_by, reason, status)
            VALUES (:rc, :d, :mb, :r, 'pending')
        """), {"rc": payload.room_code, "d": payload.day,
               "mb": payload.marked_by, "r": payload.reason})

    row = fetch_one("""
        SELECT id, room_code, day, marked_by, marked_at, reason, status
        FROM room_unavailability
        WHERE room_code = :c AND day = :d
        ORDER BY id DESC LIMIT 1
    """, c=payload.room_code, d=payload.day)
    return row


@router.delete("/unavailability/{mark_id}")
def cancel_mark(mark_id: int):
    """Cancel a pending mark."""
    existing = fetch_one("SELECT status FROM room_unavailability WHERE id = :i",
                         i=mark_id)
    if not existing:
        raise HTTPException(404, "mark not found")
    if existing["status"] != "pending":
        raise HTTPException(400, f"cannot cancel mark in status {existing['status']}")
    execute("UPDATE room_unavailability SET status = 'cancelled' WHERE id = :i",
            i=mark_id)
    return {"ok": True, "id": mark_id}


@router.get("/unavailability/impact")
def impact_summary():
    """For each pending mark, return which work items it affects."""
    marks = fetch_all("""
        SELECT id, room_code, day FROM room_unavailability
        WHERE status = 'pending'
    """)
    out = []
    for m in marks:
        affected = fetch_all("""
            SELECT wi.id, wi.bay, wi.qty, wi.rooms_text
            FROM assignments a
            JOIN work_items wi ON wi.id = a.work_item_id
            JOIN work_item_rooms wir ON wir.work_item_id = wi.id
            JOIN schedule_versions sv ON sv.id = a.version_id
            WHERE sv.is_active = TRUE
              AND a.day = :d
              AND wir.room_code = :c
        """, d=m["day"], c=m["room_code"])
        out.append({
            "mark_id": m["id"],
            "room_code": m["room_code"],
            "day": m["day"],
            "affected_work_items": affected,
            "affected_qty": sum(a["qty"] for a in affected),
        })
    return out
