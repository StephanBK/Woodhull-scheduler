import React, { useEffect, useState, useRef } from 'react'
import { api } from '../api'

/**
 * Interactive floor plan with day-coded bay hotspots.
 *
 * Sizing strategy:
 *   - The blueprint is intrinsically 1600x1131. We render it at that native
 *     size inside a horizontally scrollable container. On phones we start
 *     at 'fit-to-width' zoom (auto-computed) so the whole plan is visible.
 *
 * Coloring (relative to selected day):
 *   - TODAY     → safety orange, larger, thicker stroke
 *   - DONE      → navy filled, smaller
 *   - FUTURE    → paper-filled, navy outline
 *   - never sched → light grey (rare)
 */
export default function FloorPlan({ day, onPickBay }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [zoom, setZoom] = useState(null) // null = fit-to-width on first paint
  const containerRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    api.floorplan().then(setData).catch(e => setError(e.message))
  }, [])

  // On first data load + container measure, set fit-to-width zoom
  useEffect(() => {
    if (!data || zoom !== null) return
    const cw = containerRef.current?.clientWidth || 380
    const fit = cw / 1600
    setZoom(+fit.toFixed(2))
  }, [data, zoom])

  // When the day changes, scroll today's bays into view
  useEffect(() => {
    if (!data || !scrollRef.current || zoom == null) return
    const baysToday = data.bays.filter(b => b.schedule.some(s => s.day === day))
    if (baysToday.length === 0) return
    // Center on the geometric mean of today's bays
    const sx = 1600 / data.page.width
    const sy = 1131 / data.page.height
    const cx = baysToday.reduce((s, b) => s + b.x * sx, 0) / baysToday.length
    const cy = baysToday.reduce((s, b) => s + b.y * sy, 0) / baysToday.length
    const sw = scrollRef.current.clientWidth
    const sh = scrollRef.current.clientHeight
    scrollRef.current.scrollTo({
      left: Math.max(0, cx * zoom - sw / 2),
      top:  Math.max(0, cy * zoom - sh / 2),
      behavior: 'smooth',
    })
  }, [day, data, zoom])

  if (error) {
    return (
      <div className="border-2 border-warn bg-warn/10 p-3 font-mono text-sm text-warn">
        Could not load floor plan: {error}
      </div>
    )
  }
  if (!data || zoom == null) {
    return (
      <div ref={containerRef}
           className="border-2 border-rule p-6 text-center font-mono text-sm text-ink/50">
        loading blueprint…
      </div>
    )
  }

  const { page, bays, image } = data
  const W = 1600
  const H = (page.height / page.width) * W
  const sx = W / page.width
  const sy = H / page.height
  const baysToday = bays.filter(b => b.schedule.some(s => s.day === day))

  return (
    <div ref={containerRef} className="space-y-2">
      {/* Legend + zoom controls */}
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-warn" />today
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-ink" />done
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-ink/60" />future
        </span>
        <span className="ml-auto text-ink/60">
          {baysToday.length} bays
        </span>
        <button
          onClick={() => setZoom(z => Math.max(0.2, +(z - 0.15).toFixed(2)))}
          className="border-2 border-ink w-8 hover:bg-ink hover:text-paper transition-colors"
          aria-label="zoom out">−</button>
        <button
          onClick={() => {
            const cw = containerRef.current?.clientWidth || 380
            setZoom(+(cw / W).toFixed(2))
          }}
          className="border-2 border-ink px-2 hover:bg-ink hover:text-paper transition-colors font-mono text-[10px]"
          aria-label="fit width">FIT</button>
        <button
          onClick={() => setZoom(z => Math.min(3, +(z + 0.15).toFixed(2)))}
          className="border-2 border-ink w-8 hover:bg-ink hover:text-paper transition-colors"
          aria-label="zoom in">+</button>
      </div>

      <div
        ref={scrollRef}
        className="border-2 border-ink overflow-auto bg-paper"
        style={{ maxHeight: '70vh' }}
      >
        <div
          className="relative"
          style={{ width: W * zoom, height: H * zoom }}
        >
          <img
            src={image}
            alt="Woodhull 5th floor blueprint"
            className="absolute inset-0 w-full h-full select-none"
            style={{ opacity: 0.55 }}   // fade so hotspots pop
            draggable={false}
          />
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0 w-full h-full"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Render order: future, done, then today (so today is on top) */}
            {[...bays]
              .sort((a, b) => {
                const ad = a.schedule.some(s => s.day === day) ? 2
                          : a.schedule.some(s => s.day > day) ? 1 : 0
                const bd = b.schedule.some(s => s.day === day) ? 2
                          : b.schedule.some(s => s.day > day) ? 1 : 0
                return ad - bd
              })
              .map(b => (
                <BayDot key={b.bay} bay={b} day={day} sx={sx} sy={sy} onClick={() => onPickBay(b)} />
              ))}
          </svg>
        </div>
      </div>

      <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
        tap any bay for its work order · pinch / scroll to navigate
      </div>
    </div>
  )
}

function BayDot({ bay, day, sx, sy, onClick }) {
  const cx = bay.x * sx
  const cy = bay.y * sy
  const isToday = bay.schedule.some(s => s.day === day)
  const allDays = bay.schedule.map(s => s.day)
  const hasPast = allDays.some(d => d < day)
  const hasFuture = allDays.some(d => d > day)
  const isDone = hasPast && !hasFuture && !isToday
  const noSched = allDays.length === 0

  let fill, stroke, r, strokeWidth, badgeFill, badgeText
  if (isToday) {
    fill = '#f95738'; stroke = '#0d3b66'; r = 22; strokeWidth = 4
    badgeFill = '#0d3b66'; badgeText = '#f4f1ea'
  } else if (isDone) {
    fill = '#0d3b66'; stroke = '#0d3b66'; r = 11; strokeWidth = 2
    badgeFill = '#0d3b66'; badgeText = '#f4f1ea'
  } else if (hasFuture) {
    fill = '#f4f1ea'; stroke = '#0d3b66'; r = 12; strokeWidth = 2
    badgeFill = '#f4f1ea'; badgeText = '#0d3b66'
  } else {
    // Bays with no schedule (rare) — light grey
    fill = '#dcd5c4'; stroke = '#bfb8a4'; r = 9; strokeWidth = 1.5
    badgeFill = '#dcd5c4'; badgeText = '#0d3b66'
  }

  return (
    <g onClick={onClick} className="cursor-pointer" role="button"
       aria-label={`Bay ${bay.bay}`}>
      <circle cx={cx} cy={cy} r={r} fill={fill}
              stroke={stroke} strokeWidth={strokeWidth} />
      {/* Today gets a "this day" callout — day number inside the dot */}
      {isToday && (
        <text x={cx} y={cy + 7}
              textAnchor="middle"
              fontFamily="Bebas Neue, Impact, sans-serif"
              fontSize={20}
              fill="#f4f1ea"
              pointerEvents="none">
          {day}
        </text>
      )}
      {/* Bay number readout with paper-color halo so it's legible
          over any blueprint background */}
      <text x={cx} y={cy + r + 14}
            textAnchor="middle"
            fontFamily="IBM Plex Mono, ui-monospace, monospace"
            fontSize={12}
            fontWeight="600"
            stroke="#f4f1ea"
            strokeWidth={3}
            paintOrder="stroke"
            fill="#0d3b66"
            pointerEvents="none">
        {bay.bay}
      </text>
    </g>
  )
}
