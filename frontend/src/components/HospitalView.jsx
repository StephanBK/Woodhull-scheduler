import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { dayLabel, dayDateOnly } from '../dates'
import HospitalMap from './HospitalMap'

/**
 * Hospital view: browse rooms with scheduled work, tap into a room,
 * see which days work is happening, and mark a day as unavailable.
 * Marks queue with status='pending' until INOVUES triggers a replan.
 *
 * Also has a Schedule tab: a day-by-day list of what rooms are worked
 * on when, so hospital staff can see the whole plan at a glance.
 */
export default function HospitalView({ projectStartDate }) {
  const [rooms, setRooms] = useState(null)
  const [marks, setMarks] = useState([])
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('schedule')

  const refresh = async () => {
    try {
      const [r, m] = await Promise.all([api.rooms(), api.marks('pending')])
      setRooms(r); setMarks(m)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { refresh() }, [])

  const marksByRoomDay = useMemo(() => {
    const m = {}
    for (const x of marks) {
      m[x.room_code] = m[x.room_code] || {}
      m[x.room_code][x.day] = x
    }
    return m
  }, [marks])

  const onMarkDay = async (room_code, day) => {
    try { await api.markRoom(room_code, day, 'Hospital staff', null); refresh() }
    catch (e) { setError(e.message) }
  }
  const onCancel = async (id) => {
    try { await api.cancelMark(id); refresh() }
    catch (e) { setError(e.message) }
  }

  return (
    <div className="space-y-4 pb-12">
      <div className="titleblock">
        <div className="flex items-baseline gap-2 flex-wrap">
          <div className="font-display text-2xl tracking-wider">HOSPITAL ACCESS</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink/60 ml-auto">
            mark by end of prior day
          </div>
        </div>
      </div>

      {error && (
        <div className="border-2 border-warn bg-warn/10 p-3 font-mono text-sm text-warn flex items-baseline gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="underline">dismiss</button>
        </div>
      )}

      <div className="flex border-2 border-ink rounded-sm overflow-hidden">
        {[
          { id: 'schedule', label: 'Schedule' },
          { id: 'pending', label: `Pending (${marks.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={
              'flex-1 font-mono text-xs uppercase tracking-wider py-2 transition-colors ' +
              (tab === t.id ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/5')
            }
          >{t.label}</button>
        ))}
      </div>

      {tab === 'schedule' && (
        <ScheduleTab
          projectStartDate={projectStartDate}
          marksByRoomDay={marksByRoomDay}
          onMarkDay={onMarkDay}
          onCancel={onCancel}
        />
      )}

      {tab === 'pending' && (
        <PendingList marks={marks} onCancel={onCancel} />
      )}
    </div>
  )
}

function PendingList({ marks, onCancel }) {
  if (marks.length === 0) {
    return (
      <div className="border-2 border-dashed border-ink/40 p-6 text-center">
        <div className="font-display text-2xl text-ink/70">No pending marks</div>
        <div className="font-mono text-xs text-ink/60 mt-2">
          When you mark a room unavailable it queues here until INOVUES replans.
        </div>
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {marks.map(m => (
        <li key={m.id} className="border-2 border-warn bg-warn/5 p-3">
          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
            <span className="font-display text-xl tracking-wider">DAY {m.day}</span>
            <span className="font-mono text-sm font-semibold">{m.room_code}</span>
            <span className="sticker-warn ml-auto">PENDING</span>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink/60">
            marked {new Date(m.marked_at + 'Z').toLocaleString()}
            {m.marked_by && ` · by ${m.marked_by}`}
          </div>
          <button onClick={() => onCancel(m.id)}
            className="mt-2 font-mono text-xs uppercase tracking-wider underline hover:no-underline"
          >cancel this mark</button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Schedule tab — day-by-day list of which rooms get worked on when.
 * Hospital-friendly: rooms + window counts only, no panel/bay jargon.
 * Tap a day to expand its room list.
 */
function ScheduleTab({ projectStartDate, marksByRoomDay, onMarkDay, onCancel }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [openDay, setOpenDay] = useState(null)
  const [search, setSearch] = useState('')
  const [busyChip, setBusyChip] = useState(null) // "room|day" while a toggle is in flight
  const [picker, setPicker] = useState(null)     // {roomCode, dayNum} -> replacement modal

  const reload = () => api.hospitalSchedule().then(setData).catch(e => setError(e.message))

  useEffect(() => { reload() }, [])

  // Filter days to those containing a room matching the search query.
  const days = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.days
    return data.days.filter(day =>
      day.rooms.some(r =>
        r.room_code.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      )
    )
  }, [data, search])

  // Tapping a room:
  //  - if it's already blocked (pending) -> unblock it instantly
  //  - if it's free -> open the replacement picker (flag + choose a swap)
  async function tapRoom(roomCode, dayNum) {
    const existing = marksByRoomDay[roomCode]?.[dayNum]
    if (existing && existing.status === 'pending') {
      setBusyChip(`${roomCode}|${dayNum}`)
      try {
        await onCancel(existing.id)
        await reload()
      } catch (e) { setError(e.message) }
      finally { setBusyChip(null) }
      return
    }
    if (existing) return  // applied — locked
    setPicker({ roomCode, dayNum })
  }

  if (error) {
    return (
      <div className="border-2 border-warn bg-warn/10 p-3 font-mono text-sm text-warn flex items-baseline gap-2">
        <span className="flex-1">{error}</span>
        <button onClick={() => setError(null)} className="underline">dismiss</button>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="border-2 border-rule p-6 text-center font-mono text-sm text-ink/50">
        loading schedule…
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="search a room — e.g. RM-44 — to jump to its days…"
        className="w-full border-2 border-ink bg-paper px-3 py-2 font-mono text-sm outline-none focus:bg-flag/10"
      />
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink/60 px-1">
        {search.trim()
          ? `${days.length} day${days.length === 1 ? '' : 's'} with matching rooms`
          : `${data.days.length} install days`}
        {!projectStartDate && ' · set project start date for calendar dates'}
        {' · tap a room to flag it & pick a replacement'}
      </div>
      {days.length === 0 && (
        <div className="text-center font-mono text-sm text-ink/50 py-6">
          no rooms match "{search}"
        </div>
      )}
      {days.map(day => (
        <DayRow
          key={day.day}
          day={day}
          projectStartDate={projectStartDate}
          expanded={openDay === day.day}
          onToggle={() => setOpenDay(openDay === day.day ? null : day.day)}
          searchHighlight={search.trim().toLowerCase()}
          onToggleRoom={tapRoom}
          busyChip={busyChip}
        />
      ))}

      {picker && (
        <ReplacementPicker
          roomCode={picker.roomCode}
          dayNum={picker.dayNum}
          onClose={() => setPicker(null)}
          onDone={async () => { setPicker(null); await reload() }}
        />
      )}
    </div>
  )
}

function DayRow({ day, projectStartDate, expanded, onToggle,
                 searchHighlight, onToggleRoom, busyChip }) {
  const dateStr = dayDateOnly(projectStartDate, day.day)
  const flagged = day.rooms.filter(r => r.mark_status).length

  return (
    <div className="border-2 border-ink bg-paper">
      <button
        onClick={onToggle}
        className="w-full px-3 py-3 flex items-baseline gap-2 text-left hover:bg-ink/5 transition-colors"
      >
        <span className="font-display text-2xl tracking-wider leading-none">
          DAY {day.day}
        </span>
        {dateStr && (
          <span className="font-mono text-xs text-ink/70">{dateStr}</span>
        )}
        {flagged > 0 && (
          <span className="sticker-warn">{flagged} flagged</span>
        )}
        <span className="ml-auto font-mono text-xs whitespace-nowrap text-ink/70">
          {day.room_count} room{day.room_count === 1 ? '' : 's'} · {day.total_windows}w
        </span>
        <span className="font-mono text-ink/40">{expanded ? '▼' : '►'}</span>
      </button>

      {expanded && (
        <div className="border-t-2 border-ink p-3 space-y-3">
          <HospitalMap
            highlights={[{
              rooms: day.rooms.map(r => r.room_code),
              color: 'ink',
              label: `Day ${day.day} rooms`,
            }]}
          />
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink/60">
            tap a room to flag it & pick a replacement
          </div>
          <div className="flex flex-wrap gap-1.5">
            {day.rooms.map(room => {
              const isBusy = busyChip === `${room.room_code}|${day.day}`
              const isMatch = searchHighlight &&
                room.room_code.toLowerCase().includes(searchHighlight)
              const applied = room.mark_status === 'applied'
              const pending = room.mark_status === 'pending'
              return (
                <button
                  key={room.room_code}
                  onClick={() => !applied && onToggleRoom(room.room_code, day.day)}
                  disabled={applied || isBusy}
                  title={
                    applied
                      ? 'already rescheduled — locked'
                      : (room.description || room.room_code)
                  }
                  className={
                    'font-mono text-xs px-2 py-1 border-2 rounded-sm transition-colors ' +
                    (isBusy ? 'opacity-40 ' : '') +
                    (pending
                      ? 'border-flag bg-flag/30 text-ink'
                      : applied
                        ? 'border-warn bg-warn/10 text-warn line-through cursor-not-allowed'
                        : 'border-ink/40 bg-paper text-ink hover:border-ink hover:bg-ink/5') +
                    (isMatch ? ' ring-2 ring-ink' : '')
                  }
                >
                  {room.room_code}
                  {pending && ' ⚑'}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * ReplacementPicker — shown when a hospital user taps a room to flag it.
 *
 * Instead of just queuing a block, we fetch material-matched replacement
 * bays and let the user pick one. Picking does an immediate two-way swap +
 * optimizer recalculation. Exact panel-mix matches are listed first (a
 * like-for-like swap that keeps every day's window count — and the caps —
 * unchanged).
 */
function ReplacementPicker({ roomCode, dayNum, onClose, onDone }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState(null)  // option highlighted on the map

  useEffect(() => {
    api.suggestReplacements(roomCode, dayNum)
      .then(setData)
      .catch(e => setError(e.message))
  }, [roomCode, dayNum])

  async function pick(option) {
    setBusy(true); setError(null)
    try {
      const r = await api.executeReplacement({
        room_code: roomCode,
        flagged_day: dayNum,
        locked_work_item_id: data.locked.work_item_id,
        replacement_work_item_id: option.work_item_id,
      })
      setResult(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center z-50 p-2">
      <div className="bg-paper border-2 border-ink w-full max-w-md max-h-[88vh] overflow-y-auto">
        <div className="bg-ink text-paper px-3 py-3 flex items-baseline gap-2 sticky top-0">
          <span className="font-display text-xl tracking-wider">FLAG {roomCode}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider ml-auto">
            Day {dayNum}
          </span>
        </div>

        <div className="p-3 space-y-3">
          {error && (
            <div className="border-2 border-warn bg-warn/10 p-2 font-mono text-xs text-warn">
              {error}
            </div>
          )}

          {/* RESULT STATE */}
          {result && (
            <div className="space-y-3">
              <div className="border-2 border-ok bg-ok/10 p-3">
                <div className="font-display text-lg tracking-wider text-ok">
                  REPLACEMENT APPLIED
                </div>
                <div className="font-mono text-xs text-ink/80 mt-1">
                  Bay {result.swap.swap_in_moved_to_day != null
                    ? '' : ''}work swapped into Day {dayNum}. {roomCode}'s
                  work moved to Day {result.swap.locked_moved_to_day}.
                </div>
              </div>
              {result.recalculated && (
                <div className="font-mono text-[11px] text-ink/70">
                  Schedule recalculated — {result.recalc.moves_count} item(s)
                  shifted to keep caps. The installer has the updated plan.
                </div>
              )}
              {result.warning && (
                <div className="border-2 border-warn bg-warn/10 p-2 font-mono text-[11px] text-warn">
                  {result.warning}
                </div>
              )}
              <button
                onClick={onDone}
                className="w-full border-2 border-ink bg-ink text-paper py-2 font-display text-lg tracking-wider"
              >
                DONE
              </button>
            </div>
          )}

          {/* PICKER STATE */}
          {!result && !data && !error && (
            <div className="font-mono text-sm text-ink/50 text-center py-6">
              finding replacements…
            </div>
          )}

          {!result && data && !data.locked && (
            <div className="space-y-3">
              <div className="font-mono text-xs text-ink/70">
                {data.note || 'No work scheduled for this room that day.'}
              </div>
              <button onClick={onClose}
                className="w-full border-2 border-ink py-2 font-mono text-xs uppercase tracking-wider">
                close
              </button>
            </div>
          )}

          {!result && data && data.locked && (
            <div className="space-y-2">
              <HospitalMap
                highlights={[
                  { rooms: [roomCode], color: 'flag', label: `flagged: ${roomCode}` },
                  ...(selected
                    ? [{ rooms: selected.rooms_text.match(/RM-\d+|COR-\d+/g) || [],
                         color: 'ok',
                         label: `replacement: ${selected.rooms_text.replace(/\s*\(.*?\)/g,'').trim()}` }]
                    : []),
                ]}
              />
              <div className="font-mono text-[11px] text-ink/70 leading-relaxed">
                {data.timing === 'imminent'
                  ? 'Panels are staged on the floor. Only exact-material swaps are offered — the installer moves rooms without fetching anything.'
                  : 'Tap a replacement to see it on the map. Tap again to confirm. Exact-material matches keep every day’s window count and the caps unchanged.'}
              </div>

              {data.options.length === 0 && (
                <div className="border-2 border-warn bg-warn/10 p-3 font-mono text-xs text-warn">
                  No material-matched replacement is available
                  {data.timing === 'imminent'
                    ? ' for an imminent swap. Flag it with INOVUES for a full reschedule instead.'
                    : '.'}
                </div>
              )}

              {data.options.map(o => {
                const isSel = selected?.work_item_id === o.work_item_id
                return (
                  <button
                    key={o.work_item_id}
                    disabled={busy}
                    onClick={() => isSel ? pick(o) : setSelected(o)}
                    className={
                      'w-full border-2 p-2.5 text-left transition-colors disabled:opacity-50 ' +
                      (isSel
                        ? 'border-ink bg-ink text-paper'
                        : o.exact_match
                          ? 'border-ok bg-ok/5 hover:bg-ok/15'
                          : 'border-ink/40 bg-paper hover:bg-ink/5')
                    }
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {o.rooms_text.replace(/\s*\(.*?\)/g, '').trim()}
                      </span>
                      <span className={
                        'font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 ' +
                        (o.exact_match ? 'bg-ok text-paper' : 'bg-flag text-ink')
                      }>
                        {o.exact_match ? 'exact match' : `close (±${o.panel_mix_diff})`}
                      </span>
                      <span className={'ml-auto font-mono text-[10px] ' +
                        (isSel ? 'text-paper/70' : 'text-ink/60')}>
                        Day {o.scheduled_day} · {o.qty}w
                      </span>
                    </div>
                    {isSel && (
                      <div className="font-mono text-[10px] uppercase tracking-wider mt-1">
                        tap again to confirm this swap →
                      </div>
                    )}
                  </button>
                )
              })}

              <button onClick={onClose} disabled={busy}
                className="w-full border-2 border-ink py-2 font-mono text-xs uppercase tracking-wider hover:bg-ink hover:text-paper transition-colors disabled:opacity-50">
                cancel — don’t flag
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
