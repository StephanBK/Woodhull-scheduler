import React, { useEffect, useState } from 'react'
import { api } from '../api'
import DayNav from './DayNav'
import PanelChip from './PanelChip'
import FloorPlan from './FloorPlan'
import BaySheet from './BaySheet'

const PANEL_ORDER = ['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10']

export default function InstallerView({ projectStartDate }) {
  const [day, setDay] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [maxDay, setMaxDay] = useState(22)
  const [view, setView] = useState(
    () => localStorage.getItem('whs.installerView') || 'map'
  )
  const [pickedBay, setPickedBay] = useState(null)

  useEffect(() => { localStorage.setItem('whs.installerView', view) }, [view])
  useEffect(() => {
    api.schedule().then(s => setMaxDay(s.days.length)).catch(e => setError(e.message))
  }, [])
  useEffect(() => {
    setError(null)
    api.day(day).then(setData).catch(e => setError(e.message))
  }, [day])

  return (
    <div className="space-y-4 pb-12">
      <DayNav day={day} maxDay={maxDay} onChange={setDay} projectStartDate={projectStartDate} />

      <div className="flex items-stretch border-2 border-ink rounded-sm overflow-hidden">
        {[{id:'map',label:'Map'},{id:'list',label:'List'}].map(opt => (
          <button
            key={opt.id}
            onClick={() => setView(opt.id)}
            className={
              'flex-1 font-mono text-xs uppercase tracking-wider py-2 transition-colors ' +
              (view === opt.id ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/5')
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="border-2 border-warn bg-warn/10 p-3 font-mono text-sm text-warn">
          ERROR: {error}
        </div>
      )}

      {view === 'map' && (
        <FloorPlan day={day} onPickBay={setPickedBay} />
      )}

      {view === 'list' && data && <ListView data={data} />}

      <CompletionPanel day={day} maxDay={maxDay} />

      {pickedBay && (
        <BaySheet bay={pickedBay} currentDay={day} onClose={() => setPickedBay(null)} />
      )}
    </div>
  )
}

/**
 * CompletionPanel — installer marks each room done as they finish it,
 * then hits END DAY. Unfinished rooms roll forward to the earliest
 * cap-safe day (handled server-side). Also shows project % complete.
 */
function CompletionPanel({ day, maxDay }) {
  const [comp, setComp] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const load = () => {
    api.dayCompletion(day).then(setComp).catch(e => setError(e.message))
    api.progress().then(setProgress).catch(() => {})
  }
  useEffect(() => { setResult(null); load() }, [day])

  async function toggle(room) {
    setBusy(true); setError(null)
    try {
      await api.markRoomDone({
        work_item_id: room.work_item_id,
        room_code: room.room_code,
        day,
        done: !room.done,
      })
      load()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function endDay() {
    setBusy(true); setError(null)
    try {
      const r = await api.endDay(day)
      setResult(r)
      load()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  if (!comp) return null

  return (
    <section className="border-2 border-ink bg-paper">
      <div className="bg-ink text-paper px-3 py-2 flex items-baseline gap-2">
        <span className="font-display text-lg tracking-wider">DAY {day} PROGRESS</span>
        <span className="ml-auto font-mono text-xs">
          {comp.done}/{comp.total} rooms done
        </span>
      </div>

      <div className="p-3 space-y-3">
        {error && (
          <div className="border-2 border-warn bg-warn/10 p-2 font-mono text-xs text-warn">
            {error}
          </div>
        )}

        {/* project progress bar */}
        {progress && (
          <div>
            <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-wider text-ink/60 mb-1">
              <span>project complete</span>
              <span>{progress.percent}% · {progress.rooms_done}/{progress.rooms_total}</span>
            </div>
            <div className="h-2 border-2 border-ink bg-paper">
              <div className="h-full bg-ok" style={{width: `${progress.percent}%`}} />
            </div>
          </div>
        )}

        {/* roll-forward result */}
        {result && (
          result.all_finished ? (
            <div className="border-2 border-ok bg-ok/10 p-2 font-mono text-xs text-ok">
              All rooms finished — Day {day} closed clean. Nothing rolled over.
            </div>
          ) : (
            <div className="border-2 border-warn bg-warn/5 p-2 space-y-1">
              <div className="font-display text-base tracking-wider text-warn">
                {result.rolled_count} ROOM{result.rolled_count === 1 ? '' : 'S'} ROLLED FORWARD
              </div>
              {result.rolled.map((r,i) => (
                <div key={i} className="font-mono text-[11px] text-ink/80">
                  {r.room_code} (bay {r.bay}) → Day {r.to_day}
                </div>
              ))}
              <div className="font-mono text-[10px] text-ink/50 pt-1">
                Schedule version updated. INOVUES has been notified.
              </div>
            </div>
          )
        )}

        {/* room checklist */}
        {!result && (
          <>
            <div className="font-mono text-[10px] uppercase tracking-wider text-ink/60">
              tap a room when it's finished
            </div>
            <div className="flex flex-wrap gap-1.5">
              {comp.rooms.map((room,i) => (
                <button
                  key={`${room.work_item_id}-${room.room_code}-${i}`}
                  onClick={() => toggle(room)}
                  disabled={busy}
                  className={
                    'font-mono text-xs px-2 py-1 border-2 rounded-sm transition-colors disabled:opacity-50 ' +
                    (room.done
                      ? 'border-ok bg-ok text-paper'
                      : 'border-ink/40 bg-paper text-ink hover:border-ink')
                  }
                >
                  {room.done ? '✓ ' : ''}{room.room_code}
                </button>
              ))}
            </div>

            <button
              onClick={endDay}
              disabled={busy}
              className={
                'w-full border-2 border-ink py-2 font-display text-lg tracking-wider transition-colors disabled:opacity-50 ' +
                (comp.unfinished > 0
                  ? 'bg-warn text-paper hover:bg-ink'
                  : 'bg-ok text-paper hover:bg-ink')
              }
            >
              {comp.unfinished > 0
                ? `END DAY — ${comp.unfinished} UNFINISHED`
                : 'END DAY — ALL DONE'}
            </button>
            {comp.unfinished > 0 && (
              <div className="font-mono text-[10px] text-ink/50 text-center">
                unfinished rooms roll forward to the earliest day with capacity
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function ListView({ data }) {
  return (
    <>
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
            {PANEL_ORDER.filter(p => data.panel_totals[p]).map(p => (
              <PanelChip key={p} code={p} qty={data.panel_totals[p]} size="lg" />
            ))}
          </div>
        </div>
      </section>

      <section>
        <SectionHeader letter="B" title="Install · Bay by bay">
          <span className="font-mono text-xs text-ink/60">in order shown</span>
        </SectionHeader>
        <ol className="space-y-2">
          {data.items.map((wi, idx) => (
            <BayCard key={wi.id} wi={wi} idx={idx + 1} />
          ))}
        </ol>
      </section>
    </>
  )
}

function SectionHeader({ letter, title, children }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="w-7 h-7 flex items-center justify-center border-2 border-ink bg-flag font-display text-xl leading-none">{letter}</div>
      <h2 className="font-display text-2xl tracking-wide leading-none">{title}</h2>
      <div className="flex-1 border-t-2 border-dashed border-ink/30" />
      <div className="text-right">{children}</div>
    </div>
  )
}

function BayCard({ wi, idx }) {
  const headline = wi.rooms_text.replace(/\s*\(.*?\)/g, '').trim()
  return (
    <li className="border-2 border-ink bg-paper shadow-card">
      <div className="flex items-stretch">
        <div className="w-12 flex flex-col items-center justify-center bg-ink text-paper border-r-2 border-ink">
          <div className="font-display text-3xl leading-none">{idx}</div>
        </div>
        <div className="flex-1 p-3">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-display text-2xl tracking-wider">BAY {wi.bay}</span>
            <span className="sticker">{wi.id}</span>
            <span className="sticker">B{wi.batch}</span>
            <span className="ml-auto font-mono text-sm font-semibold">{wi.qty} units</span>
          </div>
          <div className="font-mono text-xs text-ink/80 mb-2 leading-relaxed">{headline}</div>
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
