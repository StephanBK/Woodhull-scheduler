import React, { useEffect, useState } from 'react'
import { api } from '../api'
import PanelChip from './PanelChip'

const PANEL_ORDER = ['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10']

/**
 * Bottom sheet showing one bay's work item(s).
 *
 * When the bay's currently-shown item is scheduled TODAY (the day the user
 * is viewing), we also show a "ROOM LOCKED — SWAP" action that opens the
 * same-day swap finder.
 */
export default function BaySheet({ bay, currentDay, onClose, onAfterSwap }) {
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(true)
  const [swapFor, setSwapFor] = useState(null) // work_item being swapped out

  useEffect(() => {
    if (!bay) return
    setLoading(true)
    Promise.all(bay.schedule.map(s => api.workItem(s.work_item_id)))
      .then(setItems)
      .finally(() => setLoading(false))
  }, [bay])

  if (!bay) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40">
      <button
        aria-label="close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-md bg-paper border-t-4 sm:border-4 border-ink shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-ink text-paper px-4 py-3 flex items-center z-10">
          <div className="flex-1 leading-tight">
            <div className="font-display text-3xl tracking-wider">BAY {bay.bay}</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-paper/60">
              {bay.schedule.length === 0
                ? 'no install scheduled'
                : bay.schedule.length === 1
                  ? `1 install · day ${bay.schedule[0].day}`
                  : `${bay.schedule.length} installs across days ${bay.schedule.map(s=>s.day).join(', ')}`}
            </div>
          </div>
          <button
            onClick={onClose}
            className="border-2 border-paper px-2 py-1 font-mono text-xs hover:bg-paper hover:text-ink transition-colors"
          >
            CLOSE
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading && (
            <div className="font-mono text-sm text-ink/50">loading…</div>
          )}
          {items && items.length === 0 && (
            <div className="font-mono text-sm text-ink/60">
              This bay has no install items in the active schedule.
            </div>
          )}
          {items?.map((wi, idx) => {
            const sched = bay.schedule[idx]
            const isToday = sched?.day === currentDay
            return (
              <div key={wi.id}>
                <WorkItemBlock wi={wi} highlight={isToday} />
                {isToday && (
                  <button
                    onClick={() => setSwapFor(wi)}
                    className="mt-2 w-full border-2 border-warn bg-warn/5 text-warn py-2 font-display text-lg tracking-wider hover:bg-warn hover:text-paper transition-colors"
                  >
                    ROOM LOCKED — FIND SWAP
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {swapFor && (
        <SwapPicker
          lockedWi={swapFor}
          day={currentDay}
          onClose={() => setSwapFor(null)}
          onSwapped={() => {
            setSwapFor(null)
            onClose()
            onAfterSwap?.()
          }}
        />
      )}
    </div>
  )
}

function WorkItemBlock({ wi, highlight }) {
  const headline = wi.rooms_text.replace(/\s*\(.*?\)/g, '').trim()
  const description = (wi.rooms_text.match(/\(([^)]*)\)/) || [, ''])[1]
  return (
    <div className={
      'border-2 p-3 ' +
      (highlight ? 'border-warn bg-warn/5' : 'border-ink')
    }>
      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
        <span className="font-display text-2xl tracking-wider">DAY {wi.source_day}</span>
        <span className="sticker">{wi.id}</span>
        <span className="sticker">B{wi.batch_code}</span>
        {highlight && <span className="sticker-warn">TODAY</span>}
        <span className="ml-auto font-mono text-sm font-semibold">{wi.qty} units</span>
      </div>
      <div className="font-mono text-xs text-ink mb-1">{headline}</div>
      {description && (
        <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50 mb-2">
          {description}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {PANEL_ORDER.filter(p => wi.panels[p]).map(p => (
          <PanelChip key={p} code={p} qty={wi.panels[p]} />
        ))}
      </div>
    </div>
  )
}

function SwapPicker({ lockedWi, day, onClose, onSwapped }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.suggestSwap(lockedWi.id, day, 5)
      .then(setData)
      .catch(e => setError(e.message))
  }, [lockedWi, day])

  async function execute(candidateId, notes = '') {
    setBusy(true); setError(null)
    try {
      await api.executeSwap({
        locked: lockedWi.id,
        swap_in: candidateId,
        day,
        triggered_by: 'installer',
        notes,
      })
      onSwapped()
    } catch (e) {
      setError(e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink/60">
      <button className="absolute inset-0" onClick={onClose} aria-label="close" />
      <div className="relative w-full sm:max-w-md bg-paper border-t-4 sm:border-4 border-warn shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-warn text-paper px-4 py-3 flex items-center z-10">
          <div className="flex-1 leading-tight">
            <div className="font-display text-2xl tracking-wider">SWAP IN</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-paper/80">
              Bay {lockedWi.bay} locked · using on-floor panels
            </div>
          </div>
          <button onClick={onClose}
            className="border-2 border-paper px-2 py-1 font-mono text-xs hover:bg-paper hover:text-warn transition-colors">
            CLOSE
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="border-2 border-warn bg-warn/10 p-3 font-mono text-sm text-warn">
              {error}
            </div>
          )}
          {!data && !error && (
            <div className="font-mono text-sm text-ink/50">finding candidates…</div>
          )}
          {data && data.candidates.length === 0 && (
            <div className="border-2 border-warn p-3 font-mono text-sm">
              No future bays match. INOVUES will need to manually decide.
            </div>
          )}
          {data?.candidates.map((c, idx) => (
            <div key={c.candidate_id}
                 className={
                   'border-2 p-3 ' +
                   (idx === 0 ? 'border-ok bg-ok/5' : 'border-ink bg-paper')
                 }>
              <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                {idx === 0 && <span className="sticker-warn">BEST</span>}
                <span className="font-display text-2xl tracking-wider">
                  BAY {c.candidate_bay}
                </span>
                <span className="sticker">{c.candidate_id}</span>
                <span className="sticker">B{c.candidate_batch}</span>
                <span className="ml-auto font-mono text-sm">{c.candidate_qty} units</span>
              </div>
              <div className="grid grid-cols-3 gap-2 my-2 text-center font-mono text-[10px] uppercase tracking-wider">
                <Badge label="match" value={c.exact_match ? 'exact' : 'partial'}
                       ok={c.exact_match} />
                <Badge label="extra panels" value={c.panel_deficit}
                       ok={c.panel_deficit === 0} />
                <Badge label="from day" value={c.candidate_scheduled_day} />
              </div>
              <div className="font-mono text-xs text-ink/80 mb-2">
                {c.candidate_rooms.replace(/\s*\(.*?\)/g, '').trim()}
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {PANEL_ORDER.filter(p => c.panels[p]).map(p => (
                  <PanelChip key={p} code={p} qty={c.panels[p]} />
                ))}
              </div>
              <button
                disabled={busy}
                onClick={() => execute(c.candidate_id)}
                className={
                  'w-full border-2 border-ink py-2 font-display text-lg tracking-wider transition-colors disabled:opacity-50 ' +
                  (idx === 0
                    ? 'bg-ok text-paper hover:bg-ink'
                    : 'bg-paper text-ink hover:bg-ink hover:text-paper')
                }
              >
                {busy ? 'SWAPPING…' : 'INSTALL THIS INSTEAD'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Badge({ label, value, ok }) {
  return (
    <div className={
      'border-2 p-1 ' +
      (ok === true ? 'border-ok bg-ok/10 text-ok'
       : ok === false ? 'border-warn bg-warn/10 text-warn'
       : 'border-ink bg-paper text-ink')
    }>
      <div className="font-display text-xl leading-none">{value}</div>
      <div className="text-[9px] opacity-80">{label}</div>
    </div>
  )
}
