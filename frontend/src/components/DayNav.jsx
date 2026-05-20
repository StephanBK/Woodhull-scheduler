import React from 'react'

export default function DayNav({ day, maxDay, onChange, projectStartDate }) {
  const canPrev = day > 1
  const canNext = day < maxDay

  // Compute calendar date from project start + day offset
  const dateLabel = (() => {
    if (!projectStartDate) return 'Start date TBD'
    const d = new Date(projectStartDate + 'T00:00:00')
    // Skip weekends if project_start_date is a weekday — for now we just add days
    d.setDate(d.getDate() + (day - 1))
    return d.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    })
  })()

  return (
    <div className="flex items-stretch gap-2 select-none">
      <button
        onClick={() => canPrev && onChange(day - 1)}
        disabled={!canPrev}
        className="border-2 border-ink px-3 font-mono text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-ink hover:text-paper transition-colors"
        aria-label="Previous day"
      >
        ◄
      </button>

      <div className="flex-1 border-2 border-ink bg-ink text-paper px-3 py-1.5 leading-tight">
        <div className="font-display text-3xl tracking-wider">
          DAY {String(day).padStart(2, '0')} <span className="text-flag/90">/</span>{' '}
          <span className="text-paper/60 text-2xl">{String(maxDay).padStart(2, '0')}</span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-paper/70">
          {dateLabel}
        </div>
      </div>

      <button
        onClick={() => canNext && onChange(day + 1)}
        disabled={!canNext}
        className="border-2 border-ink px-3 font-mono text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-ink hover:text-paper transition-colors"
        aria-label="Next day"
      >
        ►
      </button>
    </div>
  )
}
