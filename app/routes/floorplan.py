"""
Floor plan endpoint: returns the image dimensions, bay positions extracted from
the blueprint, and which day each bay is scheduled on (in the active schedule).

The frontend renders the image as background and an SVG overlay with one tap
target per bay, colored by day.
"""
import json
from pathlib import Path
from fastapi import APIRouter
from app.db import fetch_all

router = APIRouter(tags=["floorplan"])

POSITIONS = json.loads(
    (Path(__file__).resolve().parent.parent / "bay_positions.json").read_text()
)


@router.get("/floorplan")
def floorplan():
    """
    Combine static bay positions with the live schedule.
    Returns per-bay: x, y (in PDF coords — frontend scales to image), the days
    this bay is installed on, and the work-item IDs for those days.
    """
    rows = fetch_all("""
        SELECT a.day, a.sequence, wi.id, wi.bay, wi.batch_code, wi.qty
        FROM assignments a
        JOIN work_items wi ON wi.id = a.work_item_id
        JOIN schedule_versions sv ON sv.id = a.version_id
        WHERE sv.is_active = TRUE
        ORDER BY wi.bay, a.day
    """)
    # Group by bay (which may have multiple work items across days)
    by_bay: dict[str, list[dict]] = {}
    for r in rows:
        by_bay.setdefault(r["bay"], []).append({
            "day": r["day"],
            "work_item_id": r["id"],
            "batch": r["batch_code"],
            "qty": r["qty"],
            "sequence": r["sequence"],
        })

    bays_out = []
    for b in POSITIONS["bays"]:
        bays_out.append({
            **b,
            "schedule": by_bay.get(b["bay"], []),
        })

    return {
        "image": "/floorplan.jpg",
        "page": POSITIONS["page"],
        "bays": bays_out,
    }
