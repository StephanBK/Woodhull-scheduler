import React, { useEffect, useState } from 'react'
import { api } from '../api'
import DayNav from './DayNav'

/**
 * Hospital view: pick a day, see scheduled rooms, mark which are unavailable.
 *
 * Flow:
 *   1. Day picker (defaults to tomorrow once project_start_date is set;
 *      for now defaults to Day 2 so it's not "today").
 *   2. List of rooms with scheduled work that day. Each row toggles.
 *   3. Contact name + reason fields apply to the whole batch.
 *   4. Submit → POSTs one mark per selected room, all `pending`.
 *   5. Below: list of pending marks (cancelable) and applied/cancelled (read-only).
 */
export default function HospitalView({ projectStartDate }) {
  const [day, setDay] = useState(2)
  const [maxDay, setMaxDay] = useState(22)
  const [rooms, setRooms] = useState(null)
  const [marks, setMarks] = useState([])
  const [picked, setPicked] = useState(new Set())
  const [contact, setContact] = useState(() =>
    localStorage.getItem('whs.hospital.contact') || ''
  )
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    localStorage.setItem('whs.hospital.contact', contact)
  }, [contact])

  useEffect(() => {
    api.schedule().then(s => setMaxDay(s.days.length)).catch(e => setError(e.message))
  }, [])

  useEffect(() => {
    setPicked(new Set())
    setError(null)
    api.roomsForDay(day).then(setRooms).catch(e => setError(e.message))
    refreshMarks()
  }, [day])

  function refreshMarks() {
    api.listMarks().then(setMarks).catch(() => {})
  }

  async function submit() {
    if (picked.size === 0) return
    setBusy(true)
    setError(null)
    try {
      for (const rc of picked) {
        await api.createMark({
          room_code: rc, day,
          marked_by: contact || null,
          reason: reason || null,
        })
      }
      setPicked(new Set())
      setReason('')
      await Promise.all([
        api.roomsForDay(day).then(setRooms),
        refreshMarks(),
      ])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id) {
    setBusy(true)
    try {
      await api.cancelMark(id)
      await Promise.all([
        api.roomsForDay(day).then(setRooms),
        refreshMarks(),
      ])
    } finally { setBusy(false) }
  }

  function toggle(rc) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(rc)) next.delete(rc); else next.add(rc)
      return next
    })
  }

  const pendingForDay = marks.filter(m => m.status === 'pending' && m.day === day)
  const otherMarks = marks.filter(m => !(m.status === 'pending' && m.day === day))

  return (
    <div className="space-y-4 pb-12">
      <DayNav day={day} maxDay={maxDay} onChange={setDay}
              projectStartDate={projectStartDate} />

      {error && (
        <div className="border-2 border-warn bg-warn/10 p-3 font-mono text-sm text-warn">
          {error}
        </div>
      )}

      <section>
        <SectionHeader letter="A"
          title={`Rooms with install on day ${day}`}>
          {rooms && <span className="font-mono text-xs text-ink/60">
            {rooms.length} rooms · {picked.size} selected
          </span>}
        </SectionHeader>

        {rooms === null && (
          <div className="border-2 border-rule p-4 font-mono text-sm text-ink/50">
            loading…
          </div>
        )}
        {rooms && rooms.length === 0 && (
          <div className="border-2 border-rule p-4 font-mono text-sm text-ink/60">
            No install scheduled this day.
          </div>
        )}
        {rooms && rooms.length > 0 && (
          <ul className="space-y-2">
            {rooms.map(r => (
              <RoomRow
                key={r.room_code}
                room={r}
                selected={picked.has(r.room_code)}
                onToggle={() => toggle(r.room_code)}
              />
            ))}
          </ul>
        )}
      </section>

      {picked.size > 0 && (
        <section className="border-2 border-warn bg-warn/5 p-3 space-y-3">
          <div className="font-display text-2xl tracking-wider text-warn">
            CONFIRM {picked.size} {picked.size === 1 ? 'room' : 'rooms'} unavailable
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-ink/70 mb-1">
              Your name
            </label>
            <input
              type="text"
              value={contact}
              onChange={e => setContact(e.target.value)}
              placeholder="e.g. Maria Chen"
              className="w-full border-2 border-ink bg-paper px-3 py-2 font-mono text-sm focus:outline-none focus:bg-warn/5"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-ink/70 mb-1">
              Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Patient procedure scheduled"
              rows={2}
              className="w-full border-2 border-ink bg-paper px-3 py-2 font-mono text-sm focus:outline-none focus:bg-warn/5 resize-none"
            />
          </div>
          <button
            onClick={submit}
            disabled={busy}
            className="w-full bg-warn text-paper border-2 border-ink py-3 font-display text-2xl tracking-wider hover:bg-ink hover:text-paper transition-colors disabled:opacity-50"
          >
            {busy ? 'SUBMITTING…' : `MARK ${picked.size} ROOM${picked.size === 1 ? '' : 'S'} UNAVAILABLE`}
          </button>
        </section>
      )}

      {pendingForDay.length > 0 && (
        <section>
          <SectionHeader letter="B" title={`Pending marks for day ${day}`}>
            <span className="font-mono text-xs text-ink/60">awaiting reschedule</span>
          </SectionHeader>
          <ul className="space-y-2">
            {pendingForDay.map(m => (
              <MarkCard key={m.id} mark={m} onCancel={() => cancel(m.id)} />
            ))}
          </ul>
        </section>
      )}

      {otherMarks.length > 0 && (
        <section>
          <SectionHeader letter="C" title="History">
            <span className="font-mono text-xs text-ink/60">{otherMarks.length} marks</span>
          </SectionHeader>
          <ul className="space-y-2">
            {otherMarks.slice(0, 12).map(m => (
              <MarkCard key={m.id} mark={m}
                        onCancel={m.status === 'pending' ? () => cancel(m.id) : null} />
            ))}
          </ul>
        </section>
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
      <h2 className="font-display text-2xl tracking-wide leading-none">{title}</h2>
      <div className="flex-1 border-t-2 border-dashed border-ink/30" />
      <div className="text-right">{children}</div>
    </div>
  )
}

function RoomRow({ room, selected, onToggle }) {
  const disabled = room.already_marked
  return (
    <li>
      <button
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        className={
          'w-full text-left border-2 transition-colors flex items-stretch ' +
          (disabled
            ? 'border-rule bg-rule/30 cursor-not-allowed opacity-70'
            : selected
              ? 'border-warn bg-warn/10'
              : 'border-ink bg-paper hover:bg-ink/5')
        }
      >
        <div className={
          'w-12 flex items-center justify-center border-r-2 font-mono text-xl ' +
          (selected ? 'bg-warn text-paper border-warn' : 'border-ink')
        }>
          {disabled ? '✓' : (selected ? '×' : '')}
        </div>
        <div className="flex-1 p-3">
          <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
            <span className="font-display text-xl tracking-wider">
              {room.room_code}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
              {room.kind}
            </span>
            {disabled && (
              <span className="sticker-warn">already marked</span>
            )}
            <span className="ml-auto font-mono text-xs text-ink/60">
              {room.work_items.length} {room.work_items.length === 1 ? 'bay' : 'bays'}
            </span>
          </div>
          {room.room_desc && (
            <div className="font-mono text-[10px] text-ink/60 mb-1 leading-tight">
              {room.room_desc.slice(0, 90)}{room.room_desc.length > 90 ? '…' : ''}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {room.work_items.map(wi => (
              <span key={wi.id} className="sticker">
                BAY {wi.bay} · {wi.qty}w
              </span>
            ))}
          </div>
        </div>
      </button>
    </li>
  )
}

function MarkCard({ mark, onCancel }) {
  const statusColor = {
    pending: 'border-flag bg-flag/10 text-ink',
    applied: 'border-ok bg-ok/10 text-ok',
    cancelled: 'border-rule bg-rule/30 text-ink/60',
  }[mark.status] || 'border-ink'
  return (
    <li className={`border-2 p-3 ${statusColor}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-display text-xl tracking-wider">{mark.room_code}</span>
        <span className="sticker">DAY {mark.day}</span>
        <span className="sticker uppercase">{mark.status}</span>
        {onCancel && (
          <button onClick={onCancel}
            className="ml-auto border-2 border-ink px-2 py-0.5 font-mono text-[10px] uppercase hover:bg-ink hover:text-paper transition-colors">
            cancel
          </button>
        )}
      </div>
      {(mark.marked_by || mark.reason) && (
        <div className="mt-2 font-mono text-xs text-ink/70 leading-snug">
          {mark.marked_by && <div><span className="text-ink/50">By:</span> {mark.marked_by}</div>}
          {mark.reason && <div><span className="text-ink/50">Reason:</span> {mark.reason}</div>}
        </div>
      )}
    </li>
  )
}
