import { useEffect, useState } from 'react'
import { useT } from '../lib/i18n'
import { getDb, resetDemo } from './db'
import { DEMO_USERS } from './seed'

const LABELS: Record<string, [string, string, string]> = {
  worker: ['👷', 'कर्मचारी', 'Worker'],
  admin: ['🧑‍💼', 'एडमिन', 'Admin'],
  super: ['🌐', 'सुपर यूज़र', 'Super user'],
}

// Shown on the login screen in demo builds: one-tap logins and a reset button.
export function DemoPanel({ onPick }: { onPick: (phone: string, pin: string) => void }) {
  const { lang } = useT()
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [resetting, setResetting] = useState(false)
  useEffect(() => {
    getDb().then(() => setReady(true), (e) => { console.error('Demo database failed to start', e); setFailed(true) })
  }, [])

  async function reset() {
    if (!window.confirm(lang === 'hi' ? 'डेमो का सारा डेटा शुरू से बनेगा। ठीक है?' : 'Reset all demo data to the start?')) return
    setResetting(true)
    await resetDemo()
    setResetting(false)
  }

  const order = ['worker', 'admin', 'super'] as const
  return (
    <div className="space-y-3 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <span className="rounded bg-amber-400 px-2 py-0.5 text-sm font-extrabold text-slate-900">DEMO</span>
        <span className="text-sm text-slate-600">
          {failed ? (lang === 'hi' ? '⚠️ डेमो शुरू नहीं हो सका' : '⚠️ Demo failed to start') : !ready ? (lang === 'hi' ? '⏳ डेमो तैयार हो रहा है...' : '⏳ Preparing demo...') : (lang === 'hi' ? 'एक बटन दबाकर लॉगिन करें' : 'Tap to log in')}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {order.map((role) => {
          const u = DEMO_USERS.find((x) => x.role === role)!
          const [icon, hi, en] = LABELS[role]
          return (
            <button key={role} type="button" disabled={!ready || resetting} onClick={() => onPick(u.phone, u.pin)}
              className="rounded-xl border-2 border-amber-300 bg-white p-2 text-center disabled:opacity-50">
              <div className="text-2xl">{icon}</div>
              <div className="font-bold">{lang === 'hi' ? hi : en}</div>
              <div className="text-xs text-slate-500">{u.phone}<br />PIN {u.pin}</div>
            </button>
          )
        })}
      </div>
      <button type="button" onClick={reset} disabled={!ready || resetting} className="w-full text-sm text-slate-600 underline">
        {resetting ? '⏳' : '↺'} {lang === 'hi' ? 'डेमो डेटा फिर से शुरू करें' : 'Reset demo data'}
      </button>
    </div>
  )
}
