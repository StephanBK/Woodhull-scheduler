// API base — empty string means same-origin (works in dev via proxy and in prod).
const BASE = ''

async function get(path) {
  const r = await fetch(BASE + path)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${path}`)
  return r.json()
}

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    let detail = `${r.status} ${r.statusText}`
    try { const j = await r.json(); detail = j.detail || detail } catch {}
    throw new Error(detail)
  }
  return r.json()
}

async function del(path) {
  const r = await fetch(BASE + path, { method: 'DELETE' })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${path}`)
  return r.json()
}

export const api = {
  health:      () => get('/api/health'),
  schedule:    () => get('/api/schedule'),
  day:         (n) => get(`/api/schedule/day/${n}`),
  hospitalSchedule: () => get('/api/schedule/hospital'),
  rooms:       () => get('/api/rooms'),
  config:      () => get('/api/config'),
  workItem:    (id) => get(`/api/work-items/${id}`),
  floorplan:   () => get('/api/floorplan'),

  // --- Unavailability ---
  // Canonical names:
  roomsForDay: (n) => get(`/api/unavailability/rooms-for-day/${n}`),
  listMarks:   (q = '') => get(`/api/unavailability${q ? '?' + q : ''}`),
  createMark:  (body) => post('/api/unavailability', body),
  cancelMark:  (id) => del(`/api/unavailability/${id}`),

  // Back-compat aliases (some components were written against older names):
  marks:       (status) =>
    get('/api/unavailability' + (status ? `?status=${status}` : '')),
  markRoom:    (room_code, day, marked_by, reason) =>
    post('/api/unavailability', { room_code, day, marked_by, reason }),

  // --- Same-day swap ---
  suggestSwap: (locked, day, n = 5) =>
    get(`/api/swap/suggest?locked=${encodeURIComponent(locked)}&day=${day}&top_n=${n}`),
  executeSwap: (body) => post('/api/swap/execute', body),
  swapHistory: (day) => get(`/api/swap/history${day != null ? '?day=' + day : ''}`),
}
