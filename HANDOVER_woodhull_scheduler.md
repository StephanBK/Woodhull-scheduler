# HANDOVER — Woodhull SWR Scheduler

Pick up where we left off. Read this top to bottom and you're caught up in ~2 minutes.

---

## TL;DR

A web app that plans installation of 1,134 secondary window retrofits (SWRs) across 22 install days at Woodhull Hospital 5th floor (NYC Behavioral Health). Three user roles: **installer** (knows what to load/install today, on the floor plan), **INOVUES** (sees everything, triggers replans), **hospital** (marks rooms unavailable).

- **Repo:** https://github.com/StephanBK/Woodhull-scheduler
- **Branch:** `main`
- **Stack:** FastAPI + Postgres (Railway) + React/Vite/Tailwind, single-service
- **Status:** All 8 core chunks built and pushed. Ready to deploy.
- **Not deployed yet** as of last session — Railway was having an outage during build.

---

## To resume in one command

```bash
git clone https://github.com/StephanBK/Woodhull-scheduler.git
cd Woodhull-scheduler
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Visit http://localhost:8000. Migrations + seed run automatically. SQLite by default (zero config).

For frontend changes:
```bash
cd frontend && npm install && npm run dev   # Vite on :5173, proxies /api to :8000
# When done editing: npm run build (commits go with dist/)
```

---

## Deploy to Railway (when Railway is up)

1. Railway → New project → Deploy from GitHub repo `StephanBK/Woodhull-scheduler`
2. Add a Postgres database in the same project — Railway auto-injects `DATABASE_URL`
3. Hit Deploy. `railway.toml` defines build + start (`uvicorn app.main:app --host 0.0.0.0 --port $PORT`) + healthcheck at `/api/health`
4. First boot: migrations create tables, seed loads 1,134 windows from `schedule.json`
5. Frontend is pre-built in `frontend/dist/` and served as static files by FastAPI — no Node step needed on Railway

To swap to "build frontend on Railway" later: add a `nixpacks.toml` with a Node phase + `cd frontend && npm install && npm run build`, then remove `frontend/dist/` from git.

---

## Architecture at a glance

```
woodhull-scheduler/
├── app/                          # FastAPI backend
│   ├── main.py                   # entry — mounts routes, runs migrate+seed on boot
│   ├── db.py                     # DATABASE_URL-aware SQLAlchemy engine
│   ├── migrate.py                # simple SQL-file migration runner with dialect adapter
│   ├── seed.py                   # loads schedule.json into DB (idempotent)
│   ├── optimizer.py              # greedy reschedule algorithm (Chunk 7)
│   ├── swap_engine.py            # same-day swap candidate scoring (Chunk 8)
│   ├── bay_positions.json        # extracted 83 bay (x,y) coords for the blueprint
│   └── routes/
│       ├── health.py             # GET /api/health
│       ├── schedule.py           # GET /api/schedule, /api/schedule/day/{n}, /versions
│       ├── work_items.py         # GET /api/work-items/{id}
│       ├── rooms.py              # GET /api/rooms
│       ├── config.py             # GET, PUT /api/config
│       ├── floorplan.py          # GET /api/floorplan (image url + bay coords + schedule)
│       ├── unavailability.py     # /api/unavailability — list/create/cancel + rooms-for-day
│       ├── optimizer.py          # POST /api/optimize/preview, /apply
│       └── swap.py               # /api/swap/suggest, /execute, /history
├── migrations/
│   ├── 0001_initial.sql          # all base tables
│   └── 0002_swaps.sql            # same_day_swaps audit table
├── frontend/
│   ├── public/floorplan.jpg      # rasterized blueprint (1600×1131)
│   ├── dist/                     # pre-built React bundle (committed)
│   └── src/
│       ├── App.jsx               # role selector + view router
│       ├── api.js                # fetch wrappers
│       └── components/
│           ├── RoleSelector.jsx
│           ├── DayNav.jsx
│           ├── PanelChip.jsx     # color-coded per-panel-type badge
│           ├── FloorPlan.jsx     # blueprint + SVG hotspots
│           ├── BaySheet.jsx      # bottom modal w/ work order + swap trigger
│           ├── InstallerView.jsx # Map/List toggle
│           ├── HospitalView.jsx  # day pick → mark rooms unavailable
│           └── InovuesView.jsx   # Gantt + Replan + Admin + Versions tabs
├── schedule.json                 # 93 work items extracted from the PDF
├── railway.toml                  # build/deploy config
├── requirements.txt
└── README.md
```

---

## Data model

Versioned schedule design — the trick that makes "minimum rooms shifted" tractable.

```
panel_types       (S1..S10)
batches           (01..08 — from the PDF)
deliveries        (3 default trucks, configurable dates) ─┐
delivery_batches  many-to-many                            │
                                                          ▼
rooms             (118 — 111 RM + 7 corridors)            ┐
                                                          │
work_items (93)   id (W01-001..), bay, batch, qty,        │
                  rooms_text, source_day, sequence        │
   │                                                      │
   ├──> work_item_rooms   (M:N → rooms)  ─────────────────┘
   └──> work_item_panels  (id, panel_code, qty)

schedule_versions (id, label, parent_id, is_active)
   │
   └──> assignments (version_id, work_item_id, day, sequence)
                     ^ for each version, where each work item runs

room_unavailability (room, day, marked_by, reason, status: pending|applied|cancelled)
same_day_swaps      (day, locked_work_id, swap_in_work_id, triggered_by, notes)
config              (key TEXT, value JSON)
```

**Why versioned?** Replans create a new `schedule_versions` row + a full new set of `assignments`. We can diff v1 vs v_new with a SQL JOIN to compute the "minimum rooms shifted" metric. Old versions stick around as audit history.

---

## The optimizer (Chunk 7) — pseudo-code

`app/optimizer.py::plan()`

```
1. Read active version's assignments → {work_item: day}
2. Read pending unavailability marks → {room: {days unavailable}}
3. Compute batch_on_site_by[batch] = min(install day) for that batch
   (current heuristic — replace with delivery dates when available)
4. Identify "stuck" work items: any item whose rooms collide with a mark
   on its currently-assigned day

5. For each stuck item, in order:
     candidates = []
     for d in batch_on_site_by[batch] .. (max_day + 5):  # allow 5d project extension
         if d == original_day: continue
         if any(room in unavailable[room] for room in item.rooms): continue
         if weekly_panel_total(d) + item.qty > weekly_cap * 5: continue
         candidates.append(d)
     pick d in candidates minimizing (|d - original_day|, week_distance, d)

6. If candidates empty → add to unresolvable list

Returns: {moves, unresolvable, new_assignments, applied_marks}
```

`apply_plan(plan_result)` persists by creating a new `schedule_versions` row, copying all assignments (changed and unchanged) into it, deactivating the previous version, and flipping contributing marks to status='applied'.

**Test verified:** Mark RM-44 day 9 + RM-02 day 1 → 3 work items shifted by 1 day each, 0 unresolvable. Same-week preference observed (RM-02→day 2, RM-44 items→day 8).

---

## The swap engine (Chunk 8) — pseudo-code

`app/swap_engine.py::suggest_swaps(locked_wi, day)`

```
1. inventory = sum of all today's loaded panels
2. consumed = sum of panels used by earlier same-day swaps
3. available = inventory - consumed
   (locked bay's panels are assumed still in inventory since we couldn't install)

4. candidates = work_items scheduled on day > today, in active version
   filtered by: NOT touching any room with active unavailability

5. For each candidate, compute:
     panel_deficit = sum(max(0, need - have) for each panel in candidate)
     exact_match   = candidate.panels == locked.panels
     fully_installable = panel_deficit == 0
     distance      = euclidean(locked.bay_xy, candidate.bay_xy) from PDF coords

6. Sort by: (exact_match desc, fully_installable desc, deficit asc, distance asc, day asc)
7. Return top N
```

`execute_swap` does a clean two-way swap: locked item → swap-in's original day; swap-in → today. Records in `same_day_swaps` audit table.

**Test verified:** Bay 03 locked on Day 1 (needs S1×2, S2×4, S3×2, S4×2 = 10w) → returned 5 exact-panel-match candidates ranked by geographic distance. Top was Bay 29 (W10-033, distance 96 PDF units).

---

## API reference

```
GET    /api/health                            health + DB check (used by Railway)

GET    /api/schedule[?version_id=N]           full schedule grouped by day
GET    /api/schedule/day/{n}                  one day's plan
GET    /api/schedule/versions                 all schedule versions

GET    /api/work-items/{id}                   single work item details
GET    /api/rooms                             all rooms + their scheduled days
GET    /api/config                            all config keys
PUT    /api/config                            { key, value } — upsert one

GET    /api/floorplan                         image url + bay coords + schedule

GET    /api/unavailability?day=N&status=X     list marks
POST   /api/unavailability                    { room_code, day, marked_by, reason }
DELETE /api/unavailability/{id}               cancel a pending mark
GET    /api/unavailability/rooms-for-day/{n}  rooms with install on day N (+ marked flag)

POST   /api/optimize/preview                  diff without persisting
POST   /api/optimize/apply                    creates new version, flips marks to applied

GET    /api/swap/suggest?locked={id}&day=N    ranked swap candidates
POST   /api/swap/execute                      { locked, swap_in, day, triggered_by, notes }
GET    /api/swap/history[?day=N]              swap audit log
```

---

## Frontend behavior map

```
Role: Installer  (default)
  └─ Map view (default) — floor plan, today's bays in orange, tap any bay
      ↓ tap a bay
      BaySheet → Work order detail
        ↓ if scheduled today
        "ROOM LOCKED — FIND SWAP" button
          ↓
          SwapPicker → 5 ranked candidates with EXACT/EXTRAS/FROM_DAY badges
            ↓ "INSTALL THIS INSTEAD"
            two-way day swap

  └─ List view (toggle) — original bay cards from Chunk 4

Role: INOVUES
  ├─ Gantt tab (default) — 22 days × work items, color-coded by batch
  ├─ Replan tab — pending marks + PREVIEW → diff table → CONFIRM & APPLY
  ├─ Admin tab — project start date, weekly panel caps per week
  └─ Versions tab — audit log of every schedule version

Role: Hospital
  └─ Day picker → list of scheduled rooms → tap to multi-select → name + reason → submit
       Below: pending marks (cancelable) + history (read-only)
```

---

## Design tokens (in case you tweak the UI)

```
Colors:   paper #f4f1ea (vellum) · ink #0d3b66 (blueprint navy)
          warn #f95738 (safety orange) · flag #fac748 (amber)
          ok #3a7d44 · rule #dcd5c4
Fonts:    display = Bebas Neue, sans = IBM Plex Sans, mono = IBM Plex Mono
          (all from Google Fonts, loaded via <link> in index.html)
Style:    industrial / blueprint reference — high contrast, technical, no AI sloppiness
```

---

## Known issues & open decisions

1. **Project start date is null by default** — admin must set it for date labels to show real dates (currently shows "Start Date TBD").
2. **Weekly panel cap default = 65/day × 5 days = 325/week.** Observed peak: 61. Adjustable per-week in Admin tab.
3. **Batch on-site dates are heuristic** — currently inferred from earliest install day per batch. Replace with explicit delivery dates from `deliveries` table when set. See `optimizer.py::get_batch_on_site_by_day()`.
4. **No real auth** — role is a localStorage dropdown. Per spec ("find something simpler").
5. **No notifications** — Slack + email mentioned in spec but not built. Hooking it in: add a `notify()` call in `optimizer.apply_plan` and `swap.execute_swap`.
6. **Some bays have multiple work items on the same day** (Bay 24, 50, 53, 60, 66). Handled in data model; each is a separate work_item ID.
7. **Mobile floor plan starts at fit-to-width** — small at first, installers can pinch-zoom or tap FIT/+/− buttons.
8. **Frontend dist is committed** — quick deploy. Every UI change needs `npm run build` before push.
9. **Schedule numbering is relative (Day 1..22)** — `projectStartDate` config maps to calendar dates client-side. Weekends aren't yet skipped — calendar math just adds `(day - 1)` to the start date.
10. **Bay-to-bay distance** uses the label position from the blueprint, not a perfect "physical bay" centroid. Close enough for ranking; can refine with manual offset data later.

---

## Useful local commands

```bash
# Fresh DB + reload
rm -f woodhull.db && python -m app.migrate && python -m app.seed

# Hit the API
curl -s http://localhost:8000/api/health
curl -s http://localhost:8000/api/schedule/day/9 | python -m json.tool

# Create an unavailability mark
curl -s -X POST -H Content-Type:application/json http://localhost:8000/api/unavailability \
  -d '{"room_code":"RM-44","day":9,"marked_by":"Test","reason":"OR"}'

# Preview a reschedule
curl -s -X POST http://localhost:8000/api/optimize/preview | python -m json.tool

# Get swap candidates for bay 03 (W01-003) locked on day 1
curl -s "http://localhost:8000/api/swap/suggest?locked=W01-003&day=1&top_n=3"

# Push from /home/claude
git push https://StephanBK:<NEW_PAT>@github.com/StephanBK/Woodhull-scheduler.git main
```

PATs: per the standing rule, always grab a fresh one from 1Password — old ones get revoked and committed-PAT histories are a security risk.

---

## Where to take it next (priority order)

1. **Set the project start date** — unblocks calendar labels. Admin tab.
2. **Deploy to Railway** — when Railway recovers. Connect repo, add Postgres, deploy.
3. **Real delivery dates** — fill in `deliveries.delivery_date` from the Admin UI (need to add UI for this; API already supports config-style upsert).
4. **Slack/email notifications** — hook into `optimizer.apply_plan` and `swap.execute_swap`. INOVUES `inovues_outreach`-style helper already exists in your other repos.
5. **Stress test** — what the user mentioned: try lots of unavailability marks, edge cases (cancellations, mark-then-unmark, multi-day procedures).
6. **Tighten CORS** — `allow_origins=["*"]` is fine for prototype, lock to the Railway URL before sharing widely.
7. **Auth** — if going beyond prototype, replace the role dropdown with magic-link email auth (no passwords).

---

## Conversation pointer

Last touched: 2026-05-20. Built in one session over 8 chunks across ~5–6 hours.

All commit history is on `main`. Each chunk has a labeled commit message.
