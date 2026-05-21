# HANDOVER — Woodhull SWR Scheduler — Session 4

Current as of 2026-05-20 (evening). Read this first.

Earlier handovers in the repo root, oldest to newest:
- `HANDOVER_woodhull_scheduler.md` — original build, full architecture /
  data model / algorithm reference
- `HANDOVER_session2_deployment.md` — deployment day
- `HANDOVER_session3.md` — capacity fix + v2 schedule analysis
- `HANDOVER_session4.md` — THIS FILE — flag-and-swap, completion, floor map

---

## STATUS

- **Live:** https://woodhull-scheduler-production.up.railway.app
- **Repo:** https://github.com/StephanBK/Woodhull-scheduler (branch `main`)
- **Latest commit:** `67fadb8`
- **DEPLOY IS BEHIND — but partially caught up.** Railway had paused
  deployments. As of the last screenshot the hospital flag-and-swap +
  floor map ARE live in production (confirmed working). Verify the latest
  commit `67fadb8` is the active deployment; if Railway shows an older
  commit, hit Redeploy once the pause is fully lifted, then hard-refresh
  (Cmd+Shift+R) — the browser caches the old JS bundle every deploy.

---

## WHAT WAS BUILT THIS SESSION (commits 10f1f54 → 67fadb8)

### 1. Hospital flag-and-swap — material-matched replacements (`10f1f54`)
The hospital no longer just flags a room. Tapping a room opens a
ReplacementPicker offering replacement rooms whose bay needs the SAME
materials, so the installer moves rooms without fetching panels downstairs.
- New `app/room_replace.py`: resolves room → bay/work-item, ranks other
  bays by panel-mix match (exact first, then closest by mix difference).
- Imminent vs advance: `current_working_day()` computed from the project
  start date. Imminent (flagged day within 1 working day) = exact panel
  mix only — panels staged, like-for-like keeps caps safe. Advance =
  exact first, then close matches. No start date set → everything advance.
- New endpoints: `/api/replace/suggest`, `/api/replace/execute`,
  `/api/replace/today`.
- `execute` does the two-way swap (new schedule version) then re-runs the
  optimizer to enforce caps; surfaces a warning if caps can't be met.
- Candidates restricted to days AFTER the flagged day (the swap pulls a
  future bay forward — you can't pull from the past).
- Picks are IMMEDIATE (Option C) — INOVUES notified via the banner, not
  asked to approve.

### 2. Installer per-room completion + end-of-day roll-forward (`c85e57b`)
The "really important" one — handles the crew not finishing a day.
- New migration `0003_room_completion.sql`: tables `room_completion`
  (per work_item+room+day done status) and `unfinished_rollovers` (audit).
- New `app/completion.py`:
  - `mark_room` — installer marks each room done as they finish it
  - `end_day` — closes a day; every room not marked done rolls forward
    to the EARLIEST day that is cap-safe AND conflict-free. **Minimal
    change rule: only that one room moves, no cascade / rat-tail.** If
    the next day is full it keeps looking forward, possibly to the last
    day. A room is split out of its work item into its own new work item
    carrying its proportional window share.
  - `project_progress` — rooms done vs total, % complete
  - `end_day` creates one new schedule version (immediate, like a swap).
- New endpoints: `/api/completion/day/{day}`, `/mark`, `/end-day`,
  `/progress`.
- InstallerView: `CompletionPanel` below the map/list — tap a room to
  mark it done (green ✓), project % progress bar, END DAY button showing
  the unfinished count, roll-forward result summary.

### 3. Hospital floor map (`67fadb8`)
- New `/api/floorplan/hospital` endpoint: bay coordinates + a
  room→bay(s) lookup.
- New `HospitalMap` component (self-contained — hospital view will
  become its own site later). Renders the floor plan image + SVG bay
  highlights grouped by color with a legend. Mobile-first.
- Expanded day in the Schedule tab shows the map with that day's rooms
  highlighted.
- ReplacementPicker shows the map: flagged room ORANGE, selected
  replacement GREEN, with legend. Options are select-then-confirm —
  first tap highlights the candidate on the map (see walk distance),
  second tap executes the swap.

---

## KNOWN LIMITATION

Rooms do NOT have their own blueprint coordinates — only bays do. So the
floor map highlights at BAY granularity (a bay is 1–3 adjacent rooms). It
shows roughly where a room is and how far the installer would walk, but
not an exact room outline. Room-precise highlighting would need room-level
coordinates extracted from the blueprint — a separate future task.

---

## SEPARATE DELIVERABLE — the re-sequenced schedule PDF

Not part of the app. A standalone re-planned schedule was generated this
session per Stephan's constraints:
- Hard daily caps: weeks 1–2 = 42/day, weeks 3–4 = 56/day, week 5 = 64/day
- Each bay finished in one day (no returning), bays in ascending order
  (least walking), batch delivery weeks IGNORED (assume materials always
  on site), project may run 1–2 days longer than 22.
- RESULT: **24 install days**, 0 cap violations, 0 split bays, 1,134
  windows. 22 days is mathematically impossible (capacity 1,108 < 1,134);
  23 is the theoretical minimum; 24 needed because Week 5's bays don't
  divide evenly into 64-window days without splitting a bay.
- Output: `Woodhull_Hospital_Installation_Schedule_RESEQUENCED.pdf`,
  same column format as the original (TIME column removed per request,
  START DAY column shows the day number).
- Re-sequencer scripts live in `/tmp` (`reseq9.py`, `units_merged.json`,
  `new_days_final.json`, `make_pdf.py`) — NOT in the repo. If this needs
  regenerating, the bay data source is the verified `schedule.json`
  (1,134 windows, all bay qty == panel sum).

---

## DECISIONS MADE THIS SESSION

- Hospital flag now = flag + offered material-matched replacement (was a
  bare flag — that was the "logic mistake").
- Replacement match bar: exact panel mix for imminent; exact-first then
  forgiving for advance. Exact swaps are cap-safe (like-for-like window
  counts); looser swaps trigger the optimizer recalculation.
- Hospital picks are immediate + versioned + surfaced (Option C),
  consistent with installer swaps.
- Completion is per-ROOM (not per-bay). Explicit END DAY button.
- Unfinished roll-forward = minimal change: one room moves to the
  earliest cap-safe/conflict-free day; nothing else cascades.
- End-of-day roll-forward is immediate + versioned (like a swap).
- Hospital view kept mobile-first; map stacks, never a sidebar.
- Views will eventually split into separate websites — HospitalMap and
  the hospital components are being kept self-contained for that.

---

## OUTSTANDING / FUTURE WORK

1. Confirm Railway has deployed `67fadb8`; hard-refresh to verify.
2. Load the coworker's v2 schedule (or the new re-sequenced one) into the
   app as a schedule version — still not done. (Day 7 "(TOTAL=60)" typo
   should be confirmed with the coworker first; correct value is 66.)
3. UI consolidation / "general plan" view — the deferred simplification
   chunk. Do it after a schedule is loaded.
4. Room-precise map highlighting — needs room-level blueprint coords.
5. FUTURE NOTE: reconsider auto-applying installer room-blocks instead of
   requiring INOVUES approval.
6. FUTURE: capacity-learning — if the crew consistently misses the daily
   cap, flag that the cap is set too high. (Explicitly deferred.)
7. Optional, never built: Slack/email notifications; full Gantt
   horizontal-scroll polish; real auth.

---

## QUICK REFERENCE

```
Production:    https://woodhull-scheduler-production.up.railway.app
Repo:          https://github.com/StephanBK/Woodhull-scheduler (main)
Latest commit: 67fadb8

Key endpoints added this session:
  /api/replace/suggest?room=&day=     replacement options for a room
  /api/replace/execute                hospital picks a replacement
  /api/replace/today                  current working-day number
  /api/completion/day/{day}           per-room done status
  /api/completion/mark                mark a room done / undo
  /api/completion/end-day             close a day, roll unfinished fwd
  /api/completion/progress            project % complete
  /api/floorplan/hospital             bay coords + room->bay lookup

Local dev:
  uvicorn app.main:app --reload                 # SQLite, auto migrate+seed
  cd frontend && npm install && npm run build   # rebuild after UI changes

Push (need fresh PAT from 1Password — old ones revoked):
  git push https://StephanBK:<PAT>@github.com/StephanBK/Woodhull-scheduler.git main
```

Every UI change needs `npm run build` before commit — `frontend/dist/` is
committed and served as static files.

---

## NEW FILES THIS SESSION

```
app/room_replace.py              hospital replacement engine
app/completion.py                per-room completion + roll-forward
app/routes/replace.py            replacement endpoints
app/routes/completion.py         completion endpoints
migrations/0003_room_completion.sql
frontend/src/components/HospitalMap.jsx
```

Modified: `app/routes/floorplan.py` (+hospital endpoint), `app/main.py`
(router registration), `frontend/src/api.js`, `frontend/src/components/
HospitalView.jsx` (ReplacementPicker, map wiring), `InstallerView.jsx`
(CompletionPanel).

---

## THE FULL FLOW NOW (3 roles)

```
HOSPITAL                      INSTALLER                  INOVUES
Schedule tab: tap a room →    Map/List + CompletionPanel  Replan tab:
ReplacementPicker shows a     - mark each room done       orange "RESCHEDULE
floor map + material-matched  - END DAY button            NEEDED" banner when
replacements. Pick one →      - unfinished rooms roll     pending marks exist
immediate two-way swap +        forward (minimal change)  → preview optimizer
optimizer recalc.             BaySheet: "BLOCK IT" on a   diff → CONFIRM &
                              locked room.                APPLY → new version.
```
Hospital flag-and-swap, installer end-of-day roll-forward, and installer
swaps are all IMMEDIATE + versioned + surfaced to INOVUES via the banner.
Room blocks (hospital or installer) are still approval-gated through the
INOVUES Replan tab.
