"""Config endpoint — start date, weekly panel caps."""
import json
from fastapi import APIRouter
from pydantic import BaseModel
from app.db import fetch_all, execute

router = APIRouter(tags=["config"])


@router.get("/config")
def get_config():
    rows = fetch_all("SELECT key, value FROM config")
    return {r["key"]: json.loads(r["value"]) for r in rows}


class ConfigUpdate(BaseModel):
    key: str
    value: object


@router.put("/config")
def set_config(payload: ConfigUpdate):
    execute("""
        INSERT INTO config(key, value) VALUES (:k, :v)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    """, k=payload.key, v=json.dumps(payload.value))
    return {"ok": True, "key": payload.key}
