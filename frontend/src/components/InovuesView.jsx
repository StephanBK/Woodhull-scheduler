import React, { useEffect, useState } from 'react'
import { api } from '../api'

/**
 * INOVUES view — full project overview, replan trigger, admin config.
 *
 * Tabs:
 *   - Gantt    : compact 22-day view of all work items, color-coded by batch
 *   - Replan   : preview + apply optimizer; show pending marks
 *   - Admin    : project start date, weekly panel caps, delivery batches
 *   - Versions : audit log of schedule_versions
 */
export default function InovuesView() {
  const [tab, setTab] = useState(
    () => localStorage.getItem('whs.inovuesTab') || 'gantt'
  )
  useEffect(() => { localStorage.setItem('whs.inovuesTab', tab) }, [tab])

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-stretch border-2 border-ink rounded-sm overflow-hidden">
        {[
          { id: 'gantt',    label: 'Gantt' },
          { id: 'replan',   label: 'Replan' },
          { id: 'admin',    label: 'Admin' },
          { id: 'versions', label: 'Versions' },
        ].map(opt => (
          <button
            key={opt.id}
            onClick={() => setTab(opt.id)}
            className={
              'flex-1 font-mono text-xs uppercase tracking-wider py-2 transition-colors ' +
              (tab === opt.id ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/5')
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {tab === 'gantt'    && <GanttTab />}
      {tab === 'replan'   && <ReplanTab />}
      {tab === 'admin'    && <AdminTab />}
      {tab === 'versions' && <VersionsTab />}
    </div>
  )
}

// ---------- GANTT ----------

const BATCH_HUE = {
  '01': '#0d3b66', '02': '#1d4e89', '03': '#4a7ba6', '04': '#5a8fb3',
  '05': '#a13670', '06': '#7a2d5a', '07': '#c44a73', '08': '#892644',
}

function GanttTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.schedule().then(setData).catch(e => setError(e.message))
  }, [])

  if (error) return <Err msg={error} />
  if (!data) return <Loading />

  // Compute max items in any day for sizing
  const maxItems = Math.max(...data.days.map(d => d.items.length))
  const cellH = 18

  return (
    <section>
      <div className="flex items-baseline gap-3 mb-2">
        <h2 className="font-display text-2xl tracking-wide leading-none">Gantt</h2>
        <span className="font-mono text-xs text-ink/60">
          v{data.version_id} · {data.days.length} days
        </span>
      </div>
      <div className="border-2 border-ink overflow-x-auto bg-paper">
        <div className="inline-block min-w-full">
          <div className="flex border-b-2 border-ink bg-ink text-paper">
            {data.days.map(d => (
              <div key={d.day}
                   className="w-12 sm:w-14 shrink-0 border-r border-paper/20 px-1 py-1 text-center">
                <div className="font-display text-base leading-none">{d.day}</div>
                <div className="font-mono text-[8px] leading-tight opacity-70">
                  {d.total_windows}w
                </div>
              </div>
            ))}
          </div>
          <div className="flex">
            {data.days.map(d => (
              <div key={d.day}
                   className="w-12 sm:w-14 shrink-0 border-r border-ink/20"
                   style={{ minHeight: maxItems * (cellH + 2) }}>
                {d.items.map(wi => (
                  <div
                    key={wi.id}
                    title={`${wi.id} · Bay ${wi.bay} · ${wi.qty}w · B${wi.batch}`}
                    style={{
                      backgroundColor: BATCH_HUE[wi.batch] || '#444',
                      height: cellH,
                    }}
                    className="m-0.5 text-paper font-mono text-[9px] px-1 flex items-center justify-between"
                  >
                    <span>{wi.bay}</span>
                    <span className="opacity-70">{wi.qty}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-wider">
        {Object.entries(BATCH_HUE).map(([b, c]) => (
          <span key={b} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3" style={{ backgroundColor: c }} />
            B{b}
          </span>
        ))}
      </div>
    </section>
  )
}

// ---------- REPLAN ----------

function ReplanTab() {
  const [marks, setMarks] = useState([])
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  function refresh() {
    api.listMarks('status=pending').then(setMarks).catch(e => setError(e.message))
  }
  useEffect(() => { refresh() }, [])

  async function runPreview() {
    setBusy(true); setError(null); setSuccessMsg(null)
    try {
      const r = await fetch('/api/optimize/preview', { method: 'POST' })
      if (!r.ok) throw new Error(`${r.status}`)
      setPreview(await r.json())
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function applyPreview() {
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/optimize/apply', { method: 'POST' })
      if (!r.ok) throw new Error((await r.text()) || `${r.status}`)
      const j = await r.json()
      setSuccessMsg(`Applied. New version v${j.new_version_id} (${j.moves_count} items shifted).`)
      setPreview(null)
      refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-2xl tracking-wide leading-none mb-2">
          Pending unavailability ({marks.length})
        </h2>
        {marks.length === 0 ? (
          <div className="border-2 border-rule p-4 font-mono text-sm text-ink/60">
            No pending marks. Schedule is settled.
          </div>
        ) : (
          <ul className="space-y-2">
            {marks.map(m => (
              <li key={m.id} className="border-2 border-flag bg-flag/10 p-3">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-display text-lg tracking-wider">{m.room_code}</span>
                  <span className="sticker">DAY {m.day}</span>
                  {m.marked_by && <span className="font-mono text-xs text-ink/70">by {m.marked_by}</span>}
                </div>
                {m.reason && (
                  <div className="font-mono text-xs text-ink/60 mt-1">{m.reason}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <Err msg={error} />}
      {successMsg && (
        <div className="border-2 border-ok bg-ok/10 p-3 font-mono text-sm text-ok">
          {successMsg}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={runPreview}
          disabled={busy || marks.length === 0}
          className="flex-1 border-2 border-ink py-3 font-display text-xl tracking-wider hover:bg-ink hover:text-paper transition-colors disabled:opacity-50"
        >
          {busy ? 'WORKING…' : 'PREVIEW RESCHEDULE'}
        </button>
      </div>

      {preview && (
        <div className="border-2 border-warn bg-warn/5 p-3 space-y-3">
          <div className="font-display text-2xl tracking-wider text-warn">
            REPLAN PREVIEW
          </div>
          <div className="grid grid-cols-3 gap-2 text-center font-mono text-[10px] uppercase tracking-wider">
            <Stat n={preview.stuck_count} label="stuck" />
            <Stat n={preview.moves_count} label="will move" />
            <Stat n={preview.unresolvable_count} label="unresolvable" warn={preview.unresolvable_count > 0} />
          </div>

          {preview.moves.length > 0 && (
            <ol className="space-y-1">
              {preview.moves.map((m, i) => (
                <li key={i} className="border border-ink/30 bg-paper px-2 py-1 font-mono text-xs flex items-baseline gap-2 flex-wrap">
                  <span className="sticker">{m.work_item_id}</span>
                  <span>B{m.batch}</span>
                  <span>{m.qty}w</span>
                  <span className="ml-auto">
                    DAY <span className="font-bold">{m.from_day}</span>
                    {' → '}
                    <span className="font-bold text-warn">{m.to_day}</span>
                    <span className="ml-2 text-ink/50">
                      ({m.to_day - m.from_day > 0 ? '+' : ''}{m.to_day - m.from_day})
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {preview.unresolvable_count > 0 && (
            <div className="border-2 border-warn bg-warn/20 p-2 font-mono text-xs">
              {preview.unresolvable_count} items cannot be rescheduled under current
              constraints. Adjust weekly caps or extend the project to resolve.
            </div>
          )}

          <button
            onClick={applyPreview}
            disabled={busy || preview.unresolvable_count > 0}
            className="w-full bg-warn text-paper border-2 border-ink py-3 font-display text-2xl tracking-wider hover:bg-ink hover:text-paper transition-colors disabled:opacity-50"
          >
            {busy ? 'APPLYING…' : 'CONFIRM & APPLY'}
          </button>
        </div>
      )}
    </section>
  )
}

function Stat({ n, label, warn }) {
  return (
    <div className={'border-2 p-2 ' + (warn ? 'border-warn bg-warn/10' : 'border-ink bg-paper')}>
      <div className="font-display text-3xl leading-none">{n}</div>
      <div className="text-ink/60">{label}</div>
    </div>
  )
}

// ---------- ADMIN ----------

function AdminTab() {
  const [cfg, setCfg] = useState(null)
  const [error, setError] = useState(null)
  const [savedMsg, setSavedMsg] = useState(null)

  useEffect(() => { api.config().then(setCfg).catch(e => setError(e.message)) }, [])

  async function save(key, value) {
    setError(null); setSavedMsg(null)
    try {
      const r = await fetch('/api/config', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({key, value}),
      })
      if (!r.ok) throw new Error(`${r.status}`)
      setSavedMsg(`Saved ${key}.`)
      setCfg({...cfg, [key]: value})
    } catch (e) { setError(e.message) }
  }

  if (!cfg) return <Loading />

  return (
    <section className="space-y-4">
      {error && <Err msg={error} />}
      {savedMsg && (
        <div className="border-2 border-ok bg-ok/10 p-3 font-mono text-sm text-ok">{savedMsg}</div>
      )}

      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-ink/70 mb-1">
          Project start date
        </label>
        <input
          type="date"
          value={cfg.project_start_date || ''}
          onChange={e => save('project_start_date', e.target.value || null)}
          className="w-full border-2 border-ink bg-paper px-3 py-2 font-mono text-sm"
        />
      </div>

      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-ink/70 mb-1">
          Max panels per day, by week
        </label>
        <div className="grid grid-cols-5 gap-1">
          {[1,2,3,4,5].map(w => (
            <div key={w} className="border-2 border-ink bg-paper p-2 text-center">
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink/60">wk {w}</div>
              <input
                type="number"
                value={cfg.max_panels_per_week?.[w] ?? cfg.max_panels_per_week?.[String(w)] ?? 65}
                onChange={e => {
                  const v = parseInt(e.target.value || '0', 10)
                  const next = {...(cfg.max_panels_per_week || {})}
                  next[w] = v
                  save('max_panels_per_week', next)
                }}
                className="w-full font-display text-2xl text-center bg-paper focus:outline-none"
              />
            </div>
          ))}
        </div>
        <div className="mt-1 font-mono text-[10px] text-ink/50">
          Panels per day × 5 days = weekly cap. Observed peak: 61.
        </div>
      </div>
    </section>
  )
}

// ---------- VERSIONS ----------

function VersionsTab() {
  const [vs, setVs] = useState(null)
  useEffect(() => {
    fetch('/api/schedule/versions').then(r => r.json()).then(setVs)
  }, [])
  if (!vs) return <Loading />
  return (
    <section>
      <h2 className="font-display text-2xl tracking-wide leading-none mb-2">Versions</h2>
      <ul className="space-y-2">
        {vs.map(v => (
          <li key={v.id} className={
            'border-2 p-3 flex items-baseline gap-2 flex-wrap ' +
            (v.is_active ? 'border-warn bg-warn/5' : 'border-ink')
          }>
            <span className="font-display text-xl">v{v.id}</span>
            {v.is_active === 1 || v.is_active === true ? (
              <span className="sticker-warn">ACTIVE</span>
            ) : (
              <span className="sticker">archived</span>
            )}
            <span className="font-mono text-xs">{v.label}</span>
            {v.parent_id && (
              <span className="font-mono text-[10px] text-ink/50">parent v{v.parent_id}</span>
            )}
            <span className="ml-auto font-mono text-[10px] text-ink/50">{v.created_at}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Loading() {
  return (
    <div className="border-2 border-rule p-6 text-center font-mono text-sm text-ink/50">
      loading…
    </div>
  )
}
function Err({ msg }) {
  return (
    <div className="border-2 border-warn bg-warn/10 p-3 font-mono text-sm text-warn">
      {msg}
    </div>
  )
}
