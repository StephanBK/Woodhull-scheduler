import React, { useEffect, useMemo, useState, useRef } from 'react'
import { api } from '../api'

const PANEL_ORDER = ['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10']

/**
 * Interactive floor plan.
 *
 * The blueprint PNG is rendered at intrinsic 1600x1131. An SVG sized to the
 * same viewBox overlays it, with one tap target per bay. The container is
 * horizontally scrollable on mobile; on desktop the image fits the column.
 *
 * Bay coloring (relative to selected day):
 *   - SELECTED DAY  → warn (safety orange), filled
 *   - PAST DAYS     → ink (navy), filled (muted)
 *   - FUTURE DAYS   → ink, outline only
 *   - NEVER         → light grey outline (corridors, etc. without windows)
 */
export default function FloorPlan({ day, onPickBay, onNoSchedule }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [zoom, setZoom] = useState(1.0)
  const scrollRef = useRef(null)

  useEffect(() => {
    api.floorplan().then(setData).catch(e => setError(e.message))
  }, [])

  // Scroll-to-bay: when day changes, center the first bay of that day
  useEffect(() => {
    if (!data || !scrollRef.current) return
    const baysToday = data.bays.filter(b =>
      b.schedule.some(s => s.day === day)
    )
    if (baysToday.length === 0) return
    // Find leftmost bay of the day for scroll-into-view
    const target = baysToday.reduce((a, b) => (a.x < b.x ? a : b))
    const sx = scrollRef.current.scrollWidth / data.page.width
    const targetX = target.x * sx
    const containerW = scrollRef.current.clientWidth
    scrollRef.current.scrollTo({
      left: Math.max(0, targetX * zoom - containerW / 2),
      top: 0,
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
  if (!data) {
    return (
      <div className="border-2 border-rule p-6 text-center font-mono text-sm text-ink/50">
        loading blueprint…
      </div>
    )
  }

  const { page, bays, image } = data
  // Display dimensions — we honor the natural ratio
  const W = 1600
  const H = (page.height / page.width) * W

  // Coordinate scaling from PDF points to display pixels
  const sx = W / page.width
  const sy = H / page.height

  const dayCount = new Map() // day -> # bays on that day, for the legend
  bays.forEach(b => b.schedule.forEach(s => {
    dayCount.set(s.day, (dayCount.get(s.day) || 0) + 1)
  }))
  const baysToday = bays.filter(b => b.schedule.some(s => s.day === day))

  return (
    <div className="space-y-2">
      {/* Legend / zoom controls */}
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-warn border-2 border-warn" />
          today
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-ink border-2 border-ink" />
          done
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-ink/60" />
          future
        </span>
        <span className="ml-auto text-ink/60">
          {baysToday.length} bays · day {day}
        </span>
        <button
          onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
          className="border-2 border-ink px-2 hover:bg-ink hover:text-paper transition-colors"
          aria-label="zoom out">−</button>
        <span className="font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))}
          className="border-2 border-ink px-2 hover:bg-ink hover:text-paper transition-colors"
          aria-label="zoom in">+</button>
      </div>

      <div
        ref={scrollRef}
        className="border-2 border-ink overflow-auto bg-paper"
        style={{ maxHeight: '70vh' }}
      >
        <div
          className="relative"
          style={{
            width: W * zoom,
            height: H * zoom,
          }}
        >
          <img
            src={image}
            alt="Woodhull 5th floor blueprint"
            className="absolute inset-0 w-full h-full select-none"
            style={{ imageRendering: 'auto' }}
            draggable={false}
          />
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0 w-full h-full"
            xmlns="http://www.w3.org/2000/svg"
          >
            {bays.map(b => {
              const cx = b.x * sx
              const cy = b.y * sy
              const scheduledOnDay = b.schedule.find(s => s.day === day)
              const allDays = b.schedule.map(s => s.day)
              const hasPast   = allDays.some(d => d < day)
              const hasFuture = allDays.some(d => d > day)
              const isToday   = !!scheduledOnDay

              const r = 18
              let fill = 'transparent', stroke = '#0d3b66'
              if (isToday) {
                fill = '#f95738'    // warn
                stroke = '#0d3b66'
              } else if (hasPast && !hasFuture) {
                fill = '#0d3b66'    // ink — done
                stroke = '#0d3b66'
              } else if (hasFuture) {
                fill = '#f4f1ea'    // paper, outlined ink
                stroke = '#0d3b66'
              }

              const labelDay = isToday
                ? scheduledOnDay.day
                : (b.schedule[0]?.day ?? '')

              return (
                <g key={b.bay}
                   onClick={() => onPickBay(b)}
                   className="cursor-pointer"
                   tabIndex={0}
                   role="button"
                   aria-label={`Bay ${b.bay}`}
                >
                  <circle
                    cx={cx} cy={cy} r={r}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isToday ? 4 : 3}
                  />
                  {/* Day label inside the dot */}
                  <text
                    x={cx} y={cy + 6}
                    textAnchor="middle"
                    fontFamily="Bebas Neue, Impact, sans-serif"
                    fontSize={22}
                    fontWeight="bold"
                    fill={isToday ? '#f4f1ea' : (hasPast && !hasFuture ? '#f4f1ea' : '#0d3b66')}
                    pointerEvents="none"
                  >
                    {labelDay || ''}
                  </text>
                  {/* Bay number tag below */}
                  <text
                    x={cx} y={cy + r + 12}
                    textAnchor="middle"
                    fontFamily="IBM Plex Mono, ui-monospace, monospace"
                    fontSize={11}
                    fontWeight="600"
                    fill="#0d3b66"
                    pointerEvents="none"
                  >
                    {b.bay}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
        tap any bay for its work order · scroll/pinch to navigate
      </div>
    </div>
  )
}
