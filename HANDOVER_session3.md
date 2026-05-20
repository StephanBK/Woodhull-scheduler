# HANDOVER — Woodhull SWR Scheduler — Session 3

Current as of 2026-05-20 (afternoon). Read this first.
The repo root also has `HANDOVER_woodhull_scheduler.md` (full architecture /
data model / algorithm reference) and `HANDOVER_session2_deployment.md`
(deployment day). This file = where we are right now + what's pending.

---

## STATUS

- **Live:** https://woodhull-scheduler-production.up.railway.app
- **Repo:** https://github.com/StephanBK/Woodhull-scheduler (branch `main`)
- **Latest commit:** `52a105b` (optimizer capacity fix)
- **DEPLOY IS BEHIND.** Railway paused deployments mid-incident. The live
  site is running commit `271e675` (Hospital 2-tab consolidation). The two
  newest commits are NOT yet deployed:
    - `8588ca3` installer block + swap versioning + reschedule banner
    - `52a105b` optimizer capacity fix (per-day window cap)

---

## RESUME HERE — first thing to do

1. Railway → Woodhull-scheduler → Deployments. If "Deploys have been paused"
   is gone, hit **Redeploy** so it picks up `52a105b` (or later).
2. Once the active deployment shows the capacity-fix commit, **hard-refresh**
   the app (Cmd+Shift+R) — browser caches the old JS bundle every deploy.
3. Confirm the fix is live: INOVUES → Admin tab should read
   **"Max windows installed per day, by week"** (default 60). If it still
   says "Max panels per day" / 65, you're on stale code or stale cache.

---

## WHAT WAS DONE THIS SESSION (all committed, not all deployed)

### Hospital "Schedule" tab + view consolidation (`2644e19`, `271e675`)
- New `/api/schedule/hospital` endpoint: day-by-day room list, no panel/bay
  jargon. New `dates.js` helper (working-day → calendar date, skips weekends).
- Hospital view consolidated from 3 tabs to 2: **Schedule** + **Pending**.
  Browse Rooms tab removed.
- Schedule tab: expandable day rows; room chips are tappable to block/unblock
  a room for that day (instant toggle); search box filters days to those
  containing a matched room. Shows "Day N" + real date when start date set.

### Installer room-block + swap versioning + banner (`8588ca3`)
- Installer can block a room on-site: BaySheet → "CAN'T DO THIS ROOM —
  BLOCK IT" → posts unavailability marks for all rooms the work item touches
  (marked_by = "Installer"). Approval-gated like a hospital mark.
- After blocking, offers same-day swap as an opportunistic follow-up
  ("FIND A BAY TO INSTALL NOW").
- `execute_swap` rewritten: a swap now CREATES A NEW schedule version
  (copies all assignments, applies the swap, activates it) instead of
  silently mutating the active version. Per the agreed "Option C": swaps
  take effect immediately for the installer, but are versioned + surfaced.
- New `/api/optimize/status` endpoint powers the INOVUES banner.
- INOVUES view: prominent orange "⚠ RESCHEDULE NEEDED" banner across all
  tabs whenever pending marks exist; quieter "swaps applied" note otherwise.

### Optimizer capacity fix (`52a105b`) — important
- BUG FOUND: `fits_capacity` checked a whole-WEEK total, never a single day.
  Moving Day 1's work to Day 2 keeps it in the same week, so the weekly total
  never changed and the check always passed → 8 items dumped on Day 2 and the
  preview wrongly said "0 unresolvable".
- FIX: capacity is now a real PER-DAY window cap, indexed by week (ramp-able).
  Stored in config `max_windows_per_day`, default 60 every week.
  `fits_capacity` now checks `daily_load[day] + qty <= daily_cap_for(day)`.
- Optimizer also now treats OVER-CAPACITY days as needing rescheduling
  (peels items off any day above its cap), not just room-conflict days.
- Admin tab: field relabeled "Max windows installed per day, by week";
  changing a cap surfaces a "RECALCULATE SCHEDULE" prompt → preview →
  confirm & apply (approval-gated).
- Verified locally: blocking all of Day 1 now spreads work across Days
  2/3/4+; lowering caps to 50 correctly flags unfit items as unresolvable.

---

## DECISIONS MADE THIS SESSION (so they aren't relitigated)

- Installer block = same as a hospital mark (room unavailable that one day),
  feeds the same optimizer.
- Installer block stays APPROVAL-GATED (INOVUES previews + applies).
  NOTE FOR FUTURE: reconsider auto-applying installer blocks.
- Same-day swap = Option C: immediate for the installer, but creates a
  version and raises the INOVUES banner. No approval (too slow for on-site).
- Capacity model = per-day window cap, all weeks default 60, editable to
  create a week-by-week ramp. Cap change → recalculate (preview + confirm).
- UI consolidation / "general plan" view = its own future chunk, deferred
  until AFTER the coworker's revised schedule is loaded.

---

## THE COWORKER'S NEW SCHEDULE — analysis done, NOT yet loaded

File: `Woodhull_Hospital_Installation_Schedule_05202026_combined.pdf`
(coworker's v2; the desktop file was `INOVUES_Glazers_v2.xlsx`).

Same format, same 1,134 windows, same rooms/bays/panels/batches, 22 install
days. It is a RE-SEQUENCING, not a redesign.

**Internal inconsistency to flag to the coworker:** Day 7's QTY column says
66 but its description says "(TOTAL=60 WINDOWS)". The panel line items sum
to 66, and the grand total (1,134) only works with 66. So 66 is correct and
"(TOTAL=60)" is a typo. Also: Day 7 at 66 windows exceeds a 60/day cap.

**Old vs New — only Days 1–15 differ, 16–22 identical:**
  Day 1: 42→36   Day 3: 44→51   Day 4: 42→39   Day 7: 56→66
  Day 8: 54→44   Day 10: 54→59  Day 12: 54→49  Day 14: 54→57  Day 15: 52→49
  (Days 2,5,6,9,11,13,16–22 unchanged. Total stays 1,134.)
Two real moves: gentler start (Day 1 lighter) and a Day 7/8 swap.

**To load it:** re-import as a new schedule version using the same extractor
that built `schedule.json`. Minor extractor tweaks expected. It becomes a
new `schedule_versions` row so it can be diffed against the original.

---

## OUTSTANDING WORK (priority order)

1. Get Railway to redeploy `52a105b` (blocked on Railway's deploy pause).
2. Hard-refresh + verify the capacity fix is live (Admin tab label).
3. Load the coworker's v2 schedule as a new version (after the Day 7
   typo is confirmed with the coworker).
4. UI consolidation / "general plan" view — the deferred simplification chunk.
5. FUTURE NOTE: reconsider auto-applying installer room-blocks instead of
   requiring INOVUES approval.
6. Optional, never built: Slack/email notifications on reschedule/swap;
   full Gantt horizontal-scroll polish; real auth.

---

## QUICK REFERENCE

```
Production:   https://woodhull-scheduler-production.up.railway.app
Repo:         https://github.com/StephanBK/Woodhull-scheduler (main)
Latest commit: 52a105b

Health:   /api/health           -> {"status":"ok","db":true}
Seed:     /api/schedule/day/1    -> 42 windows, 6 items
Status:   /api/optimize/status   -> pending marks + swaps + active version

Local dev:
  uvicorn app.main:app --reload          # SQLite, auto migrate+seed
  cd frontend && npm install && npm run build   # rebuild after UI changes

Push (need fresh PAT from 1Password — old ones revoked):
  git push https://StephanBK:<PAT>@github.com/StephanBK/Woodhull-scheduler.git main
```

Every UI change needs `npm run build` before commit — `frontend/dist/` is
committed and served as static files.

---

## THE 3-ROLE FLOW (reminder)

```
HOSPITAL                INSTALLER                 INOVUES
Schedule tab: tap a     BaySheet: "BLOCK IT"      Replan tab: orange banner
room to block it for    on a locked room.         "RESCHEDULE NEEDED" ->
a day. -> pending mark  -> pending mark.          preview the optimizer
                        Optional same-day swap     diff -> CONFIRM & APPLY
                        = immediate + versioned.   -> new schedule version
```
Hospital/Installer flag problems. INOVUES decides (approval-gated replan).
Swaps are the one immediate path — versioned and surfaced, no approval.
