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
