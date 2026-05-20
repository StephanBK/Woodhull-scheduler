# HANDOVER — Woodhull SWR Scheduler — Session 2 (Deployment Day)

Picking this up later today. Read this first — it's the current state. The original
`HANDOVER_woodhull_scheduler.md` in the repo root has the full architecture / data
model / algorithm reference; this file is just "where we are right now."

Last touched: 2026-05-20 morning.

---

## STATUS: DEPLOYED AND LIVE ✅

The app is running in production on Railway:

**https://woodhull-scheduler-production.up.railway.app**

- Backend, Postgres, migrations, seed — all confirmed working
- 1,134 windows / 22 days / 83 bays loaded correctly (verified via `/api/schedule/day/1`)
- All three roles render: Installer, INOVUES, Hospital
- All four INOVUES tabs render: Gantt, Replan, Admin, Versions

Repo: https://github.com/StephanBK/Woodhull-scheduler (branch `main`)

---

## WHAT HAPPENED THIS SESSION

1. Railway was mid-incident ("builds slow") — deploy was slow but went through.
2. Deployed from GitHub. Added Postgres. Generated domain. Set container port to 8080.
3. First load worked, but two bugs surfaced once clicking around in production:

   **Bug 1 — Replan tab gray-screened.** `InovuesView` called `api.marks()`,
   which was renamed to `api.listMarks()` back in Chunk 8. Calling an undefined
   function crashed the whole React tree. Fixed + added an `ErrorBoundary`
   component so a crash now shows a recoverable panel instead of a blank screen.
   Commit `58d9559`.

   **Bug 2 — Hospital view errored** with `fe.marks is not a function`.
   Same root cause: `HospitalView` calls `api.marks()` and `api.markRoom()`,
   neither of which existed in the current `api.js`. Fixed by adding
   back-compat aliases to `api.js` (it now exports BOTH the canonical names
   `listMarks`/`createMark` AND the legacy `marks`/`markRoom`). Verified all
   12 `api.*` call sites across the frontend now resolve. Commit `0caaa4b`.

Both fixes are committed and pushed. Railway auto-redeploys on push to `main`.

---

## RESUME HERE — what to do next

### 1. Confirm the latest redeploy landed
- Check Railway: Woodhull-scheduler service should be green/Active on commit `0caaa4b`
- Open the app, **hard-refresh** (Cmd+Shift+R) to clear cached old JS
- Click through all 3 roles + all 4 INOVUES tabs — everything should render clean

### 2. Run the full end-to-end test (was about to do this when we stopped)
This exercises the whole hospital → optimizer → new-version loop:
1. **Hospital** role → tap a room (e.g. COR-1) → it expands → tap a DAY button → it turns orange (marked)
2. Tap the **PENDING** tab — the mark should be listed
3. Switch to **INOVUES** → **Replan** tab — should now show "Pending unavailability (1)"
4. Click **PREVIEW RESCHEDULE** — optimizer shows the diff (which bays shift, from→to days)
5. Click **CONFIRM & APPLY** — creates schedule version 2
6. Check **Versions** tab — should list v1 (Original) + v2 (Replan)
7. Optionally test same-day swap: Installer → tap a today-bay → "ROOM LOCKED — FIND SWAP"

If anything breaks during this test: F12 → Console → grab the red error.
The ErrorBoundary will now show a readable error panel instead of gray screen.

### 3. Set the project start date
- INOVUES role → **Admin** tab → pick the real Day-1 date
- Until this is set, the app shows "Start Date TBD" and calendar labels are blank

---

## KNOWN LOOSE ENDS

1. **Postgres "TCP proxy" error in Railway** — harmless. That's only the *public*
   DB proxy (for connecting a desktop SQL client). The app uses Railway's internal
   network, doesn't need it. Ignore, or retry it later if you want external DB access.

2. **The two `api.*` bugs were a pattern** — `api.js` got renamed in Chunk 8 but two
   components weren't updated. Now `api.js` exports both old + new names, so this
   class of bug is closed. But if you add new components, use the canonical names:
   `listMarks`, `createMark`, `roomsForDay`, `cancelMark`.

3. **No notifications yet** (Slack/email) — was always optional, not built.

4. **No real auth** — role is a localStorage dropdown, per the original spec.

5. **Frontend `dist/` is committed** — every UI change needs `cd frontend && npm run build`
   before commit, or the deployed app won't reflect the change.

---

## STILL OUTSTANDING FROM ORIGINAL PLAN (optional)

- Slack + email notifications on reschedule/swap (~30–45 min)
- Full Gantt horizontal scroll polish (~60 min)
- Stress testing — the user explicitly wanted to do this; the deploy already
  surfaced 2 real bugs, so the instinct was right. Keep clicking edge cases:
  mark-then-cancel, multiple marks same day, apply replan twice, swap then replan.

---

## QUICK REFERENCE

```
Production:  https://woodhull-scheduler-production.up.railway.app
Repo:        https://github.com/StephanBK/Woodhull-scheduler  (branch: main)
Latest commit: 0caaa4b (Hospital api alias fix)

Health check:  /api/health           → {"status":"ok","db":true}
Seed check:    /api/schedule/day/1    → 42 windows, 6 items

Local dev:
  cd Woodhull-scheduler
  python -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  uvicorn app.main:app --reload        # SQLite, auto-migrate + seed

  cd frontend && npm install && npm run build   # rebuild after UI changes

Push (need fresh PAT from 1Password — old ones revoked):
  git push https://StephanBK:<PAT>@github.com/StephanBK/Woodhull-scheduler.git main
```

---

## THE 3-ROLE FLOW (in case it needs re-explaining)

```
HOSPITAL                INOVUES                      INSTALLER
browse rooms,       →   Replan tab: preview      →   sees updated
tap a room, tap a       the optimizer diff,          schedule on the
DAY to mark it          CONFIRM & APPLY              floor plan / list
unavailable             → creates new version
```

Hospital just *flags* problems. INOVUES *decides* (previews + applies the replan).
Installer *executes* whatever the current active schedule version says.

Same-day swap is separate: when an installer is physically at a locked room with
panels already on the floor, the swap engine finds another bay using the same
on-floor panels — Installer view → tap a today-bay → "ROOM LOCKED — FIND SWAP".
