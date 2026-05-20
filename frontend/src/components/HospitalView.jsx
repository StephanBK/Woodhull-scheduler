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
  const [search, setSearch] = useState('')
  const [openRoom, setOpenRoom] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('schedule')

  const refresh = async () => {
    try {
      const [r, m] = await Promise.all([api.rooms(), api.marks('pending')])
      setRooms(r); setMarks(m)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { refresh() }, [])

  const filtered = useMemo(() => {
    if (!rooms) return []
    const q = search.trim().toLowerCase()
    let list = rooms.filter(r => r.scheduled.length > 0)
    if (q) list = list.filter(r =>
      r.code.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q)
    )
    return list
  }, [rooms, search])

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
          { id: 'browse',  label: 'Browse rooms' },
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
        <ScheduleTab projectStartDate={projectStartDate} />
      )}

      {tab === 'browse' && (
        <>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search room or description…"
            className="w-full border-2 border-ink bg-paper px-3 py-2 font-mono text-sm outline-none focus:bg-flag/10"
          />
          {!rooms && (
            <div className="border-2 border-rule p-6 text-center font-mono text-sm text-ink/50">
              loading rooms…
            </div>
          )}
          <ul className="space-y-2">
            {filtered.map(room => (
              <RoomRow
                key={room.code}
                room={room}
                marks={marksByRoomDay[room.code] || {}}
                expanded={openRoom === room.code}
                onToggle={() => setOpenRoom(openRoom === room.code ? null : room.code)}
                onMarkDay={onMarkDay}
                onCancel={onCancel}
              />
            ))}
            {filtered.length === 0 && rooms && (
              <li className="text-center font-mono text-sm text-ink/50 py-6">
                no rooms match "{search}"
              </li>
            )}
          </ul>
        </>
      )}

      {tab === 'pending' && (
        <PendingList marks={marks} onCancel={onCancel} />
      )}
    </div>
  )
}

function RoomRow({ room, marks, expanded, onToggle, onMarkDay, onCancel }) {
  const markedDays = Object.keys(marks).map(Number)
  return (
    <li className="border-2 border-ink bg-paper">
      <button
        onClick={onToggle}
        className="w-full px-3 py-3 flex items-baseline gap-2 text-left hover:bg-ink/5 transition-colors"
      >
        <span className="font-mono text-sm font-semibold">{room.code}</span>
        {room.description && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink/60 truncate">
            {room.description}
          </span>
        )}
        <span className="ml-auto font-mono text-xs whitespace-nowrap">
          {room.scheduled.length} day{room.scheduled.length === 1 ? '' : 's'}
        </span>
        {markedDays.length > 0 && (
          <span className="sticker-warn">{markedDays.length}!</span>
        )}
        <span className="font-mono text-ink/40">{expanded ? '▼' : '►'}</span>
      </button>

      {expanded && (
        <div className="border-t-2 border-ink p-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink/60 mb-2">
            scheduled days — tap to mark unavailable
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set(room.scheduled.map(s => s.day)))
              .sort((a, b) => a - b)
              .map(d => {
                const mark = marks[d]
                return (
                  <DayButton
                    key={d}
                    day={d}
                    marked={!!mark}
                    onMark={() => onMarkDay(room.code, d)}
                    onCancel={() => onCancel(mark.id)}
                  />
                )
              })}
          </div>
        </div>
      )}
    </li>
  )
}

function DayButton({ day, marked, onMark, onCancel }) {
  if (marked) {
    return (
      <button onClick={onCancel}
        className="border-2 border-warn bg-warn text-paper px-3 py-2 leading-tight hover:opacity-90"
      >
        <div className="font-display text-xl">DAY {day}</div>
        <div className="font-mono text-[9px] uppercase tracking-wider opacity-90">
          marked · tap to cancel
        </div>
      </button>
    )
  }
  return (
    <button onClick={onMark}
      className="border-2 border-ink bg-paper px-3 py-2 leading-tight hover:bg-ink hover:text-paper transition-colors"
    >
      <div className="font-display text-xl">DAY {day}</div>
      <div className="font-mono text-[9px] uppercase tracking-wider opacity-60">
        tap to mark
      </div>
    </button>
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
function ScheduleTab({ projectStartDate }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [openDay, setOpenDay] = useState(null)

  useEffect(() => {
    api.hospitalSchedule()
      .then(d => setData(d))
      .catch(e => setError(e.message))
  }, [])

  if (error) {
    return (
      <div className="border-2 border-warn bg-warn/10 p-3 font-mono text-sm text-warn">
        {error}
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
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink/60 px-1">
        {data.days.length} install days
        {!projectStartDate && ' · set project start date for calendar dates'}
      </div>
      {data.days.map(day => (
        <DayRow
          key={day.day}
          day={day}
          projectStartDate={projectStartDate}
          expanded={openDay === day.day}
          onToggle={() => setOpenDay(openDay === day.day ? null : day.day)}
        />
      ))}
    </div>
  )
}

function DayRow({ day, projectStartDate, expanded, onToggle }) {
  const dateStr = dayDateOnly(projectStartDate, day.day)
  // Count how many rooms on this day are already flagged unavailable
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
            rooms worked on this day
          </div>
          <div className="flex flex-wrap gap-1.5">
            {day.rooms.map(room => (
              <span
                key={room.room_code}
                className={
                  'font-mono text-xs px-2 py-1 border-2 rounded-sm ' +
                  (room.mark_status === 'pending'
                    ? 'border-flag bg-flag/20 text-ink'
                    : room.mark_status === 'applied'
                      ? 'border-warn bg-warn/10 text-warn line-through'
                      : 'border-ink/30 bg-paper text-ink')
                }
                title={room.description || room.room_code}
              >
                {room.room_code}
                {room.mark_status === 'pending' && ' ⚑'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
