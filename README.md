# Woodhull SWR Scheduler

Web app to plan and replan installation of 1,134 secondary window retrofits across 22 install days at Woodhull Hospital (5th floor, Behavioral Health).

## What it does

- **Installer view** — what to load and install today, by day
- **INOVUES view** — full Gantt, spatial floor plan, manual edits
- **Hospital view** — mark rooms unavailable by end of prior day
- **Optimizer** — reschedule with minimum number of rooms shifted
- **Same-day swap** — when a room is locked at install time, find another room that uses panels already on the floor

## Stack

- FastAPI (Python 3.11+) backend
- Postgres (Railway) in production, SQLite for local dev
- React frontend (Chunk 4+)
- Single service deploy (FastAPI serves API + static frontend)

## Local quickstart

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Run migrations + seed automatically on first startup
uvicorn app.main:app --reload
```

Visit http://localhost:8000/api/health and http://localhost:8000/api/schedule.

## Deploy on Railway

1. Create a new Railway project, connect this repo
2. Add a Postgres database — Railway injects `DATABASE_URL` automatically
3. Deploy. Migrations and seed run on first boot.

`railway.toml` configures the build, start command, and healthcheck.

## Data model overview

- `work_items` — the 93 install records (W01-001 … W22-089), each with a bay, batch, rooms, qty, panels
- `schedule_versions` — every replan is a new version; `is_active = TRUE` marks the current plan
- `assignments` — which day each work item runs, per version
- `room_unavailability` — hospital marks; triggers replan
- `config` — start date, weekly panel caps, etc.

See `app/db.py` for connection details and `migrations/` for schema.

## API summary

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | DB + service status |
| GET | `/api/schedule` | Full schedule grouped by day |
| GET | `/api/schedule/day/{day}` | One day's install plan |
| GET | `/api/schedule/versions` | List schedule versions |
| GET | `/api/work-items/{id}` | One work item detail |
| GET | `/api/rooms` | All rooms with their scheduled days |
| GET | `/api/config` | Current config |
| PUT | `/api/config` | Update a config key |

## Project status

- ✅ Chunk 1 — Schedule extracted from PDF
- ✅ Chunk 2 — DB schema + load
- ✅ Chunk 3 — FastAPI backend + Railway config
- ⏳ Chunk 4 — Installer day-view UI
- ⏳ Chunk 5 — Spatial floor-plan view
- ⏳ Chunk 6 — Hospital "mark unavailable" UI
- ⏳ Chunk 7 — Advance-notice reschedule optimizer
- ⏳ Chunk 8 — Same-day swap engine
