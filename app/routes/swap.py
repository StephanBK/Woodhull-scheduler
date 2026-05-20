"""
Same-day swap endpoints.

  GET  /api/swap/suggest?locked={wi_id}&day={n}  → top candidates
  POST /api/swap/execute                         → perform a swap
  GET  /api/swap/history                         → past swaps audit log
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.swap_engine import suggest_swaps, execute_swap
from app.db import fetch_all

router = APIRouter(tags=["swap"], prefix="/swap")


@router.get("/suggest")
def suggest(locked: str = Query(...),
            day: int = Query(...),
            top_n: int = Query(5, ge=1, le=20)):
    """Return ranked swap candidates for a locked bay on a given day."""
    results = suggest_swaps(locked, day, top_n=top_n)
    return {
        "locked_id": locked,
        "day": day,
        "count": len(results),
        "candidates": results,
    }


class SwapExecute(BaseModel):
    locked: str
    swap_in: str
    day: int
    triggered_by: Optional[str] = "inovues"
    notes: Optional[str] = None


@router.post("/execute")
def execute(payload: SwapExecute):
    try:
        return execute_swap(
            locked_wi_id=payload.locked,
            swap_in_wi_id=payload.swap_in,
            day=payload.day,
            triggered_by=payload.triggered_by or "inovues",
            notes=payload.notes,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/history")
def history(day: Optional[int] = None):
    sql = """
        SELECT s.id, s.day, s.locked_work_id, s.swap_in_work_id,
               s.triggered_by, s.triggered_at, s.notes,
               wl.bay AS locked_bay, ws.bay AS swap_in_bay
        FROM same_day_swaps s
        JOIN work_items wl ON wl.id = s.locked_work_id
        JOIN work_items ws ON ws.id = s.swap_in_work_id
    """
    params = {}
    if day is not None:
        sql += " WHERE s.day = :d"
        params["d"] = day
    sql += " ORDER BY s.triggered_at DESC LIMIT 100"
    return fetch_all(sql, **params)
