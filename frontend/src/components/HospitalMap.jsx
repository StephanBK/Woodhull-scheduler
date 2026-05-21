import React, { useEffect, useState } from 'react'
import { api } from '../api'

/**
 * HospitalMap — a self-contained floor plan for the hospital view.
 *
 * Rooms don't have their own coordinates, so we highlight the BAY each
 * room sits in (a bay is 1–3 adjacent rooms — a close approximation).
 *
 * Props:
 *   highlights: [{ rooms: ['RM-44'], color: 'flag'|'ok'|'ink', label: '...' }]
 *     each group is drawn in its own color with an optional legend label.
 *
 * Mobile-first: the map scales to its container width; never a fixed sidebar.
 * Kept standalone on purpose — the hospital view will become its own site.
 */
export default function HospitalMap({ highlights = [] }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.hospitalFloorplan().then(setData).catch(e => setError(e.message))
  }, [])

  if (error) {
    return (
      <div className="border-2 border-rule p-3 font-mono text-[11px] text-ink/50">
        floor map unavailable
      </div>
    )
  }
  if (!data) {
    return (
      <div className="border-2 border-rule p-6 text-center font-mono text-xs text-ink/40">
        loading floor map…
      </div>
    )
  }

  const { page, bays, room_to_bays } = data
  const byBay = Object.fromEntries(bays.map(b => [b.bay, b]))

  const COLORS = {
    flag: '#f95738',  // warn — flagged room
    ok:   '#3a7d44',  // ok — replacement room
    ink:  '#0d3b66',  // default highlight
  }

  // Resolve each highlight group to bay coordinates.
  const groups = highlights.map(h => {
    const baySet = new Set()
    for (const room of h.rooms || []) {
      for (const bay of (room_to_bays[room] || [])) baySet.add(bay)
    }
    const points = [...baySet]
      .map(b => byBay[b])
      .filter(Boolean)
    return { ...h, points }
  })

  return (
    <div className="border-2 border-ink bg-paper">
      <div
        className="relative w-full"
        style={{ aspectRatio: `${page.width} / ${page.height}` }}
      >
        <img
          src={data.image}
          alt="5th floor plan"
          className="absolute inset-0 w-full h-full object-contain opacity-90"
        />
        <svg
          viewBox={`0 0 ${page.width} ${page.height}`}
          className="absolute inset-0 w-full h-full"
        >
          {groups.map((g, gi) =>
            g.points.map((p, pi) => (
              <g key={`${gi}-${pi}`}>
                <circle
                  cx={p.x} cy={p.y} r="26"
                  fill={COLORS[g.color] || COLORS.ink}
                  fillOpacity="0.35"
                  stroke={COLORS[g.color] || COLORS.ink}
                  strokeWidth="3"
                />
                <circle
                  cx={p.x} cy={p.y} r="9"
                  fill={COLORS[g.color] || COLORS.ink}
                />
              </g>
            ))
          )}
        </svg>
      </div>
      {/* legend */}
      {groups.some(g => g.label) && (
        <div className="flex flex-wrap gap-3 px-2 py-1.5 border-t-2 border-ink">
          {groups.filter(g => g.label).map((g, i) => (
            <span key={i} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ background: COLORS[g.color] || COLORS.ink }}
              />
              {g.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
