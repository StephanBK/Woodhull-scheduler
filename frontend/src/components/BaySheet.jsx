import React, { useEffect, useState } from 'react'
import { api } from '../api'
import PanelChip from './PanelChip'

const PANEL_ORDER = ['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10']

/**
 * Bottom sheet showing one bay's work item(s). A bay can have multiple work
 * items if its rooms are split across two install passes (rare, but real:
 * bays 24, 50, 53, 60, 66).
 */
export default function BaySheet({ bay, currentDay, onClose }) {
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(true)

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
      {/* Tap-outside-to-close */}
      <button
        aria-label="close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-md bg-paper border-t-4 sm:border-4 border-ink shadow-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-ink text-paper px-4 py-3 flex items-center">
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
          {items?.map((wi, idx) => (
            <WorkItemBlock key={wi.id} wi={wi} highlight={
              bay.schedule[idx]?.day === currentDay
            }/>
          ))}
        </div>
      </div>
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
        {highlight && (
          <span className="sticker-warn">TODAY</span>
        )}
        <span className="ml-auto font-mono text-sm font-semibold">
          {wi.qty} units
        </span>
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
