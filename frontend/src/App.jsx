import React, { useEffect, useState } from 'react'
import { api } from './api'
import RoleSelector from './components/RoleSelector'
import InstallerView from './components/InstallerView'
import InovuesView from './components/InovuesView'
import HospitalView from './components/HospitalView'

export default function App() {
  // Persist role across reloads — installers shouldn't have to re-pick every time
  const [role, setRole] = useState(
    () => localStorage.getItem('whs.role') || 'installer'
  )
  const [config, setConfig] = useState(null)
  const [bootError, setBootError] = useState(null)

  useEffect(() => {
    localStorage.setItem('whs.role', role)
  }, [role])

  useEffect(() => {
    api.config()
      .then(setConfig)
      .catch(e => setBootError(e.message))
  }, [])

  return (
    <div className="min-h-full">
      <header className="border-b-2 border-ink bg-paper">
        <div className="max-w-screen-sm mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex flex-col leading-none">
            <div className="font-display text-2xl tracking-wider text-ink">
              WOODHULL <span className="text-warn">SWR</span>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-ink/60">
              installation scheduler
            </div>
          </div>
          <div className="ml-auto">
            <RoleSelector role={role} onChange={setRole} />
          </div>
        </div>
      </header>

      <main className="max-w-screen-sm mx-auto px-4 py-4">
        {bootError && (
          <div className="border-2 border-warn bg-warn/10 p-3 font-mono text-sm text-warn mb-4">
            Could not reach API: {bootError}
          </div>
        )}

        {role === 'installer' && (
          <InstallerView projectStartDate={config?.project_start_date} />
        )}

        {role === 'inovues' && <InovuesView />}

        {role === 'hospital' && (
          <HospitalView projectStartDate={config?.project_start_date} />
        )}
      </main>
    </div>
  )
}

function Placeholder({ title, lines }) {
  return (
    <div className="border-2 border-dashed border-ink/40 p-6 text-center">
      <div className="font-display text-2xl tracking-wider text-ink/70">{title}</div>
      <div className="mt-3 space-y-1 font-mono text-xs text-ink/60">
        {lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  )
}
