"""
Installer completion endpoints.

  GET  /api/completion/day/{day}   -> per-room done status for a day
  POST /api/completion/mark        -> mark one room done / undo
  POST /api/completion/end-day     -> close a day, roll unfinished rooms fwd
  GET  /api/completion/progress    -> project-wide % complete
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.completion import (get_day_completion, mark_room, end_day,
                            project_progress)

router = APIRouter(tags=["completion"], prefix="/completion")


@router.get("/day/{day}")
def day_completion(day: int):
    return get_day_completion(day)


class MarkPayload(BaseModel):
    work_item_id: str
    room_code: str
    day: int
    done: bool = True


@router.post("/mark")
def mark(p: MarkPayload):
    return mark_room(p.work_item_id, p.room_code, p.day, p.done)


class EndDayPayload(BaseModel):
    day: int


@router.post("/end-day")
def close_day(p: EndDayPayload):
    try:
        return end_day(p.day)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/progress")
def progress():
    return project_progress()
