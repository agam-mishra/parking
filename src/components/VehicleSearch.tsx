import { useEffect, useState } from 'react'
import { rpc, type Lookup } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { fmtDuration, normReg } from '../lib/format'
import { failure } from '../lib/feedback'
import { ErrorBox } from './ui'
import { QrScanner } from './QrScanner'

interface Match { reg_no: string; inside: boolean; entry_at: string | null; icon: string; customer_name: string | null; has_pass: boolean }

// Vehicle-number box used on every worker screen. Typing the last few digits lists matching
// vehicles as big buttons; "out" mode lists only vehicles inside and offers QR scanning.
export function VehicleSearch({ onResult, initial = '', mode = 'any' }: {
  onResult: (r: Lookup) => void; initial?: string; mode?: 'in' | 'out' | 'any'
}) {
  const { t, lang } = useT()
  const [reg, setReg] = useState(initial)
  const [digits, setDigits] = useState(mode !== 'in')
  const [matches, setMatches] = useState<Match[]>([])
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (reg.length < 2) return setMatches([])
    const timer = setTimeout(() => {
      rpc<Match[]>('search_vehicles', { p_q: reg, p_inside_only: mode === 'out' }).then(setMatches).catch(() => setMatches([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [reg, mode])

  async function pick(r: string) {
    setBusy(true)
    setError(null)
    try {
      onResult(await rpc<Lookup>('lookup_vehicle', { p_reg: r }))
    } catch (err) {
      failure()
      setError(err)
    }
    setBusy(false)
  }

  // Auto-open a vehicle passed in from another screen.
  useEffect(() => { if (initial.length >= 3) pick(initial) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const exact = matches.some((m) => m.reg_no === reg)
  const canUseTyped = mode !== 'out' && reg.length >= 6 && !exact

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (matches.length === 1) pick(matches[0].reg_no)
    else if (exact || canUseTyped) pick(reg)
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="space-y-2">
        <div className="flex items-end justify-between">
          <span className="text-lg font-bold text-slate-800">{mode === 'in' ? t('vehicleNo') : t('typeLastDigits')}</span>
          <button type="button" onClick={() => setDigits(!digits)}
            className="rounded-lg border-2 border-slate-400 bg-white px-3 py-1 font-bold text-slate-800">
            {digits ? 'ABC' : '123'}
          </button>
        </div>
        <input
          autoFocus
          value={reg}
          onChange={(e) => setReg(normReg(e.target.value).slice(0, 12))}
          placeholder={mode === 'in' ? t('vehicleNoHint') : '1234'}
          inputMode={digits ? 'numeric' : 'text'}
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full rounded-xl border-4 border-slate-800 bg-yellow-50 px-4 py-4 text-center font-mono text-4xl font-bold tracking-widest outline-none focus:border-blue-600"
        />
      </form>

      {mode !== 'in' && (
        <button onClick={() => setScan(true)}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-800 py-4 text-xl font-bold text-white">
          <span className="text-2xl">📷</span> {t('scanQr')}
        </button>
      )}

      <ErrorBox error={error} />

      <div className="space-y-2">
        {matches.map((m) => (
          <button key={m.reg_no} disabled={busy} onClick={() => pick(m.reg_no)}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-slate-300 bg-white p-3 text-left shadow-sm active:bg-blue-50">
            <span className="text-3xl">{m.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-2xl font-bold tracking-wider">{highlight(m.reg_no, reg)}</span>
              <span className="block truncate text-slate-600">
                {m.customer_name ?? t('walkIn')}
                {m.has_pass && ` · 📅 ${t('pass')}`}
              </span>
            </span>
            {m.inside && (
              <span className="shrink-0 rounded-lg bg-green-100 px-2 py-1 text-right text-sm font-bold text-green-800">
                🅿️ {t('insideNow')}
                {m.entry_at && <span className="block font-semibold">{fmtDuration(m.entry_at, new Date().toISOString(), lang)}</span>}
              </span>
            )}
          </button>
        ))}

        {canUseTyped && (
          <button disabled={busy} onClick={() => pick(reg)}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-blue-500 bg-blue-50 p-4 text-left">
            <span className="text-3xl">🆕</span>
            <span>
              <span className="block font-mono text-2xl font-bold tracking-wider">{reg}</span>
              <span className="block font-semibold text-blue-800">{t('useNewNumber')}</span>
            </span>
          </button>
        )}

        {reg.length >= 2 && matches.length === 0 && !canUseTyped && (
          <div className="rounded-xl bg-white p-4 text-center text-lg text-slate-600">
            {mode === 'out' ? t('notInside') : mode === 'in' ? t('typeFullNumber') : t('noData')}
          </div>
        )}
      </div>

      {scan && <QrScanner onClose={() => setScan(false)} onFound={(r) => { setScan(false); setReg(r); pick(r) }} />}
    </div>
  )
}

// Bold the part of the plate the worker typed.
function highlight(plate: string, q: string) {
  const i = plate.lastIndexOf(q)
  if (!q || i < 0) return plate
  return <>{plate.slice(0, i)}<span className="rounded bg-yellow-300 px-0.5">{plate.slice(i, i + q.length)}</span>{plate.slice(i + q.length)}</>
}

export function RegPlate({ reg, big }: { reg: string; big?: boolean }) {
  return (
    <div className={`inline-block rounded-lg border-4 border-slate-800 bg-yellow-50 px-4 py-1 font-mono font-bold tracking-widest ${big ? 'text-4xl' : 'text-2xl'}`}>
      {reg}
    </div>
  )
}
