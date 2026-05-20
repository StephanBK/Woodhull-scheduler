// API base — empty string means same-origin (works in dev via proxy and in prod).
const BASE = ''

async function get(path) {
  const r = await fetch(BASE + path)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${path}`)
  return r.json()
}

export const api = {
  health: () => get('/api/health'),
  schedule: () => get('/api/schedule'),
  day: (n) => get(`/api/schedule/day/${n}`),
  rooms: () => get('/api/rooms'),
  config: () => get('/api/config'),
  workItem: (id) => get(`/api/work-items/${id}`),
  floorplan: () => get('/api/floorplan'),
}
