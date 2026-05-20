"""
Optimizer endpoints.

  POST /api/optimize/preview  → run planner, return diff without persisting
  POST /api/optimize/apply    → run planner AND persist as new active version
"""
from fastapi import APIRouter, HTTPException
from app.optimizer import plan, apply_plan
from app.db import fetch_one, fetch_all

router = APIRouter(tags=["optimizer"], prefix="/optimize")


@router.post("/preview")
def preview():
    """Compute the reshuffle without persisting. Useful for UI preview."""
    result = plan()
    # Decorate with human-readable diff info
    moves = result["moves"]
    summary = {
        "stuck_count": result["stuck_count"],
        "moves_count": len(moves),
        "unresolvable_count": len(result["unresolvable"]),
        "moves": moves[:50],  # cap for UI display
        "unresolvable": result["unresolvable"][:20],
    }
    return summary


@router.post("/apply")
def apply():
    """Run the planner and persist as a new active version."""
    result = plan()
    if result["unresolvable"]:
        raise HTTPException(
            409,
            f"Cannot apply: {len(result['unresolvable'])} work items "
            f"have no valid day under current constraints."
        )
    new_v = apply_plan(result)
    return {
        "new_version_id": new_v,
        "moves_count": len(result["moves"]),
        "applied_marks": result["applied_marks"],
    }


@router.get("/status")
def status():
    """
    Lightweight status for the INOVUES 'reschedule needed' banner.

    Returns:
      pending_marks      — count of unavailability marks awaiting a replan
      reschedule_needed  — True if there are pending marks (INOVUES must act)
      recent_swaps       — same-day swaps from the last 24h (already applied,
                           shown for awareness, not action)
      active_version     — the current active schedule version id + label
    """
    pending = fetch_all("""
        SELECT ru.id, ru.room_code, ru.day, ru.marked_by, ru.reason, ru.marked_at
        FROM room_unavailability ru
        WHERE ru.status = 'pending'
        ORDER BY ru.marked_at DESC
    """)
    recent_swaps = fetch_all("""
        SELECT s.id, s.day, s.triggered_by, s.triggered_at,
               wl.bay AS locked_bay, ws.bay AS swap_in_bay
        FROM same_day_swaps s
        JOIN work_items wl ON wl.id = s.locked_work_id
        JOIN work_items ws ON ws.id = s.swap_in_work_id
        ORDER BY s.triggered_at DESC
        LIMIT 10
    """)
    active = fetch_one("""
        SELECT id, label FROM schedule_versions
        WHERE is_active = TRUE ORDER BY id DESC LIMIT 1
    """)
    return {
        "reschedule_needed": len(pending) > 0,
        "pending_marks": pending,
        "pending_count": len(pending),
        "recent_swaps": recent_swaps,
        "active_version": active,
    }
