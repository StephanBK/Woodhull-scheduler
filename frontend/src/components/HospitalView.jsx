import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { dayLabel, dayDateOnly } from '../dates'

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

  useEffect(() => {
    api.hospitalSchedule()
      .then(d => setData(d))
      .catch(e => setError(e.message))
  }, [])

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

  // Toggle a room's block status for a day. Uses the live marks map so we
  // always have the current mark id for cancellation.
  async function toggleRoom(roomCode, dayNum) {
    const key = `${roomCode}|${dayNum}`
    setBusyChip(key)
    try {
      const existing = marksByRoomDay[roomCode]?.[dayNum]
      if (existing && existing.status === 'pending') {
        await onCancel(existing.id)         // unblock
      } else if (!existing) {
        await onMarkDay(roomCode, dayNum)   // block
      }
      // applied marks can't be toggled — ignored
      // Re-pull the schedule so chip mark_status reflects reality
      const fresh = await api.hospitalSchedule()
      setData(fresh)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyChip(null)
    }
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
        {' · tap a room to block / unblock it'}
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
          onToggleRoom={toggleRoom}
          busyChip={busyChip}
        />
      ))}
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
        <div className="border-t-2 border-ink p-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink/60 mb-2">
            tap a room to block it for this day
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
