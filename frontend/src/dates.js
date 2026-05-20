/**
 * Date helpers for the Woodhull schedule.
 *
 * The schedule is stored as relative "Day 1..22". When the project start
 * date is configured (INOVUES -> Admin), we map each day number to a real
 * calendar date. Install days are WORKING days, so we skip weekends when
 * counting forward — Day 1 = start date, Day 2 = next weekday, etc.
 */

/**
 * Convert a 1-based working-day number to a Date, skipping Sat/Sun.
 * Returns null if no start date is set.
 */
export function workingDayToDate(startDateStr, dayNumber) {
  if (!startDateStr) return null
  const d = new Date(startDateStr + 'T00:00:00')
  let remaining = dayNumber - 1
  // If the start date itself lands on a weekend, roll forward to Monday.
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1)
  }
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) remaining--
  }
  return d
}

/**
 * Human label for a day. Always shows "Day N"; appends the real date
 * when a start date is configured.
 *   no start date  -> "Day 5"
 *   with start date -> "Day 5 · Mon, Jun 8"
 */
export function dayLabel(startDateStr, dayNumber, opts = {}) {
  const { withYear = false } = opts
  const base = `Day ${dayNumber}`
  const date = workingDayToDate(startDateStr, dayNumber)
  if (!date) return base
  const formatted = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  })
  return `${base} · ${formatted}`
}

/** Just the formatted date portion, or null if no start date. */
export function dayDateOnly(startDateStr, dayNumber, opts = {}) {
  const { withYear = false } = opts
  const date = workingDayToDate(startDateStr, dayNumber)
  if (!date) return null
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}
