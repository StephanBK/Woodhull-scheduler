"""
Hospital room-replacement endpoints.

  GET  /api/replace/suggest?room=RM-44&day=9
       -> ranked replacement bays (material-matched) for a flagged room
  POST /api/replace/execute
       -> perform the two-way swap the hospital picked, then re-run the
          optimizer so caps hold and the installer gets a fresh schedule
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.room_replace import suggest_replacements, current_working_day
from app.swap_engine import execute_swap
from app.optimizer import plan, apply_plan

router = APIRouter(tags=["replace"], prefix="/replace")


@router.get("/suggest")
def suggest(room: str, day: int):
    """Replacement options for a flagged room on a given day."""
    return suggest_replacements(room, day)


@router.get("/today")
def today():
    """The current working-day number, for imminent/advance classification."""
    return {"current_working_day": current_working_day()}


class ReplacePayload(BaseModel):
    room_code: str
    flagged_day: int
    locked_work_item_id: str
    replacement_work_item_id: str


@router.post("/execute")
def execute(p: ReplacePayload):
    """
    The hospital picked a replacement. Do the two-way swap immediately
    (creates a new schedule version), then run the optimizer to enforce
    caps downstream. The installer's schedule reflects the new version.
    """
    try:
        swap = execute_swap(
            locked_wi_id=p.locked_work_item_id,
            swap_in_wi_id=p.replacement_work_item_id,
            day=p.flagged_day,
            triggered_by="hospital",
            notes=f"Hospital replacement for {p.room_code}",
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Re-run the optimizer on the new active version to enforce caps.
    result = plan()
    recalced = None
    if result["moves"]:
        if result["unresolvable"]:
            # Swap succeeded but caps can't be satisfied — surface it.
            return {
                "swap": swap,
                "recalculated": False,
                "warning": (
                    f"Swap applied, but {len(result['unresolvable'])} work "
                    f"items now exceed capacity. INOVUES must resolve this "
                    f"in the Replan tab."
                ),
            }
        new_v = apply_plan(result)
        recalced = {"new_version_id": new_v,
                    "moves_count": len(result["moves"])}

    return {
        "swap": swap,
        "recalculated": recalced is not None,
        "recalc": recalced,
    }
