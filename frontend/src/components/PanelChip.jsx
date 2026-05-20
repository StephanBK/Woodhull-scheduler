import React from 'react'

// Each panel type gets a distinct hue so the installer can recognize them at a glance.
// Hues chosen to be distinguishable in glove + bright light conditions.
const PANEL_HUES = {
  S1:  '#0d3b66',
  S2:  '#1d4e89',
  S3:  '#4a7ba6',
  S4:  '#5a8fb3',
  S5:  '#a13670',  // pink-magenta family for S5–S9 (most common group)
  S6:  '#7a2d5a',
  S7:  '#c44a73',
  S8:  '#892644',
  S9:  '#b13860',
  S10: '#5b3a8e',
}

export default function PanelChip({ code, qty, size = 'md' }) {
  const hue = PANEL_HUES[code] || '#444'
  const sizeCls = size === 'lg'
    ? 'text-base px-2.5 py-1'
    : 'text-xs px-1.5 py-0.5'

  return (
    <span
      className={`inline-flex items-center gap-1.5 border-2 font-mono uppercase tracking-wider rounded-sm ${sizeCls}`}
      style={{ borderColor: hue, color: hue, backgroundColor: hue + '12' }}
    >
      <span className="font-semibold">{code}</span>
      <span
        className="font-display text-[1.05em] leading-none px-1 rounded-sm"
        style={{ backgroundColor: hue, color: '#f4f1ea' }}
      >
        {qty}
      </span>
    </span>
  )
}
