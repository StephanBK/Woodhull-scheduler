from fastapi import APIRouter
from app.db import fetch_one

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    """Returns service status and DB connectivity. Used by Railway healthchecks."""
    try:
        r = fetch_one("SELECT 1 AS ok")
        db_ok = r is not None and r["ok"] == 1
    except Exception as e:
        return {"status": "degraded", "db": False, "error": str(e)}
    return {"status": "ok", "db": db_ok}
