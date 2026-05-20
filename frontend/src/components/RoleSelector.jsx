import React from 'react'

const ROLES = [
  { id: 'installer', label: 'Installer' },
  { id: 'inovues',   label: 'INOVUES' },
  { id: 'hospital',  label: 'Hospital' },
]

export default function RoleSelector({ role, onChange }) {
  return (
    <div className="flex gap-0 border-2 border-ink rounded-sm overflow-hidden">
      {ROLES.map(r => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          className={
            'font-mono text-[11px] uppercase tracking-wider px-2.5 py-1.5 transition-colors ' +
            (role === r.id
              ? 'bg-ink text-paper'
              : 'bg-paper text-ink hover:bg-ink/5')
          }
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}
