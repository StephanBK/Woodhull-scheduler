import React, { useEffect, useState } from 'react'
import { api } from '../api'
import DayNav from './DayNav'
import PanelChip from './PanelChip'

const PANEL_ORDER = ['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10']

export default function InstallerView({ projectStartDate }) {
  const [day, setDay] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [maxDay, setMaxDay] = useState(22)

  // Load schedule once to know the day range
  useEffect(() => {
    api.schedule().then(s => {
      setMaxDay(s.days.length)
    }).catch(e => setError(e.message))
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.day(day)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [day])

  return (
    <div className="space-y-4 pb-12">
      <DayNav
        day={day}
        maxDay={maxDay}
        onChange={setDay}
        projectStartDate={projectStartDate}
      />

      {error && (
        <div className="border-2 border-warn bg-warn/10 p-3 font-mono text-sm text-warn">
          ERROR: {error}
        </div>
      )}

      {loading && !data && (
        <div className="border-2 border-rule p-6 text-center font-mono text-sm text-ink/50">
          loading day {day}…
        </div>
      )}

      {data && (
        <>
          {/* Title block — like a drawing's title block */}
          <div className="titleblock">
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono uppercase tracking-wider">
              <div>
                <div className="text-ink/50">project</div>
                <div className="font-semibold text-sm">Woodhull · 5th Fl</div>
              </div>
              <div>
                <div className="text-ink/50">scope today</div>
                <div className="font-semibold text-sm">
                  {data.items.length} bays · {data.total_windows} units
                </div>
              </div>
              <div className="text-right">
                <div className="text-ink/50">version</div>
                <div className="font-semibold text-sm">v{data.version_id}</div>
              </div>
            </div>
          </div>

          {/* AM unload section */}
          <section>
            <SectionHeader letter="A" title="AM · Unload from truck">
              <span className="font-mono text-xs text-ink/60">
                {Object.values(data.panel_totals).reduce((a,b)=>a+b,0)} units total
              </span>
            </SectionHeader>
            <div className="border-2 border-ink bg-paper p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink/60 mb-2">
                pick these from the truck:
              </div>
              <div className="flex flex-wrap gap-2">
                {PANEL_ORDER
                  .filter(p => data.panel_totals[p])
                  .map(p => (
                    <PanelChip key={p} code={p} qty={data.panel_totals[p]} size="lg" />
                  ))}
              </div>
            </div>
          </section>

          {/* PM install section */}
          <section>
            <SectionHeader letter="B" title="Install · Bay by bay">
              <span className="font-mono text-xs text-ink/60">
                in order shown
              </span>
            </SectionHeader>
            <ol className="space-y-2">
              {data.items.map((wi, idx) => (
                <BayCard key={wi.id} wi={wi} idx={idx + 1} />
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  )
}

function SectionHeader({ letter, title, children }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="w-7 h-7 flex items-center justify-center border-2 border-ink bg-flag font-display text-xl leading-none">
        {letter}
      </div>
      <h2 className="font-display text-2xl tracking-wide leading-none">
        {title}
      </h2>
      <div className="flex-1 border-t-2 border-dashed border-ink/30" />
      <div className="text-right">{children}</div>
    </div>
  )
}

function BayCard({ wi, idx }) {
  // Strip the parenthesized description from rooms_text for the headline
  // (we still show full string below)
  const headline = wi.rooms_text.replace(/\s*\(.*?\)/g, '').trim()
  return (
    <li className="border-2 border-ink bg-paper shadow-card">
      <div className="flex items-stretch">
        {/* Sequence number — visible at a glance */}
        <div className="w-12 flex flex-col items-center justify-center bg-ink text-paper border-r-2 border-ink">
          <div className="font-display text-3xl leading-none">{idx}</div>
        </div>

        <div className="flex-1 p-3">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-display text-2xl tracking-wider">
              BAY {wi.bay}
            </span>
            <span className="sticker">{wi.id}</span>
            <span className="sticker">B{wi.batch}</span>
            <span className="ml-auto font-mono text-sm font-semibold">
              {wi.qty} units
            </span>
          </div>

          <div className="font-mono text-xs text-ink/80 mb-2 leading-relaxed">
            {headline}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PANEL_ORDER.filter(p => wi.panels[p]).map(p => (
              <PanelChip key={p} code={p} qty={wi.panels[p]} />
            ))}
          </div>
        </div>
      </div>
    </li>
  )
}
