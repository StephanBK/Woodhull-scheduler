"""
FastAPI application entry point.

On startup we run migrations and (if empty) seed data, so deploying to
Railway with a fresh Postgres just works.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.migrate import apply_all
from app.seed import seed
from app.routes import (schedule, work_items, rooms, config, health,
                        floorplan, unavailability, optimizer, swap)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Running migrations...")
    new = apply_all()
    if new:
        print(f"  Applied: {new}")
    print("Seeding (if empty)...")
    seed()
    yield
    # Shutdown (nothing to clean up)


app = FastAPI(title="Woodhull SWR Scheduler", lifespan=lifespan)

# Permissive CORS for development. Tighten when we know the frontend origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(health.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
app.include_router(work_items.router, prefix="/api")
app.include_router(rooms.router, prefix="/api")
app.include_router(config.router, prefix="/api")
app.include_router(floorplan.router, prefix="/api")
app.include_router(unavailability.router, prefix="/api")
app.include_router(optimizer.router, prefix="/api")
app.include_router(swap.router, prefix="/api")

# Static frontend (will exist after `npm run build` in /frontend).
# In dev, /frontend/dist doesn't exist yet — skip silently.
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
else:
    @app.get("/")
    def root():
        return {"service": "Woodhull Scheduler API", "frontend": "not yet built"}
