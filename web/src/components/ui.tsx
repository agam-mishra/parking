import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { useT, errKey, type TKey } from '../lib/i18n'
import { useAuth } from '../lib/auth'
import { rupees, upiLink } from '../lib/format'
import { sayAmount, soundOn, setSoundOn, success as feedbackSuccess } from '../lib/feedback'
import type { PayMethod, VehicleType } from '../lib/supabase'

export function LangToggle() {
  const { lang, setLang } = useT()
  return (
    <button
      onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}
      className="rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold text-white"
    >
      {lang === 'hi' ? 'English' : 'हिंदी'}
    </button>
  )
}

export function SoundToggle() {
  const [on, setOn] = useState(soundOn())
  return (
    <button
      onClick={() => { setSoundOn(!on); setOn(!on) }}
      className="rounded-full bg-white/20 px-2.5 py-1.5 text-lg leading-none"
      aria-label="sound"
    >
      {on ? '🔊' : '🔇'}
    </button>
  )
}

export function Screen({ title, back = true, children, right }: {
  title: string; back?: boolean | string; children: ReactNode; right?: ReactNode
}) {
  const nav = useNavigate()
  const { t } = useT()
  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-slate-100">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-blue-700 px-3 py-3 text-white shadow">
        {back && (
          <button
            onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}
            className="rounded-lg px-2 py-1 text-2xl leading-none"
            aria-label={t('back')}
          >
            ←
          </button>
        )}
        <h1 className="flex-1 truncate text-xl font-bold">{title}</h1>
        {right}
        <SoundToggle />
        <LangToggle />
      </header>
      <main className="space-y-4 p-4 pb-40">{children}</main>
    </div>
  )
}

const tones = {
  blue: 'bg-blue-600 text-white active:bg-blue-800',
  green: 'bg-green-600 text-white active:bg-green-800',
  red: 'bg-red-600 text-white active:bg-red-800',
  amber: 'bg-amber-500 text-slate-900 active:bg-amber-600',
  slate: 'bg-white text-slate-900 border-2 border-slate-300 active:bg-slate-100',
  purple: 'bg-purple-600 text-white active:bg-purple-800',
}
export type Tone = keyof typeof tones

export function Button({ tone = 'blue', big, className = '', ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; big?: boolean }) {
  return (
    <button
      {...p}
      className={`w-full rounded-xl font-bold shadow-sm disabled:opacity-50 ${big ? 'py-5 text-2xl' : 'py-3 text-lg'} ${tones[tone]} ${className}`}
    />
  )
}

export function Tile({ icon, label, tone, onClick }: { icon: string; label: string; tone: Tone; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl p-3 shadow ${tones[tone]}`}>
      <span className="text-5xl">{icon}</span>
      <span className="text-center text-lg font-bold leading-tight">{label}</span>
    </button>
  )
}

export function Field({ label, hint, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold text-slate-700">{label}</span>
      <input
        {...p}
        className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-xl outline-none focus:border-blue-600"
      />
      {hint && <span className="mt-1 block text-sm text-slate-500">{hint}</span>}
    </label>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ${className}`}>{children}</div>
}

export function ErrorBox({ error }: { error: unknown }) {
  const { t } = useT()
  if (!error) return null
  return <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-lg font-semibold text-red-800">⚠️ {t(errKey(error))}</div>
}

export function Banner({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'blue'; children: ReactNode }) {
  const c = {
    green: 'bg-green-100 border-green-400 text-green-900',
    red: 'bg-red-100 border-red-400 text-red-900',
    amber: 'bg-amber-100 border-amber-400 text-amber-900',
    blue: 'bg-blue-100 border-blue-400 text-blue-900',
  }[tone]
  return <div className={`rounded-xl border-2 p-4 text-lg font-bold ${c}`}>{children}</div>
}

export function Choice<T extends string>({ value, options, onChange, cols = 3 }: {
  value: T | null
  options: { value: T; label: string; icon?: string; sub?: string }[]
  onChange: (v: T) => void
  cols?: 2 | 3
}) {
  return (
    <div className={`grid gap-2 ${cols === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-xl border-2 p-3 text-center ${value === o.value ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600' : 'border-slate-300 bg-white'}`}
        >
          {o.icon && <div className="text-3xl">{o.icon}</div>}
          <div className="font-bold">{o.label}</div>
          {o.sub && <div className="text-sm text-slate-600">{o.sub}</div>}
        </button>
      ))}
    </div>
  )
}

export function VehicleTypePicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const { vehicleTypes } = useAuth()
  const { lang } = useT()
  return (
    <Choice
      value={value}
      onChange={onChange}
      options={vehicleTypes.map((v: VehicleType) => ({ value: v.id, icon: v.icon, label: lang === 'hi' ? v.name_hi : v.name_en }))}
    />
  )
}

export function Label({ k, children }: { k?: TKey; children?: ReactNode }) {
  const { t } = useT()
  return <div className="mb-2 text-lg font-bold text-slate-700">{k ? t(k) : children}</div>
}

// Big amount + Cash/UPI choice, with a UPI QR for the exact amount.
export function PayCollector({ amount, method, onMethod, upiRef, onUpiRef }: {
  amount: number; method: PayMethod | null; onMethod: (m: PayMethod) => void
  upiRef: string; onUpiRef: (s: string) => void
}) {
  const { t, lang } = useT()
  const { tenant } = useAuth()
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => { if (amount > 0) sayAmount(amount, lang) }, [amount, lang])
  useEffect(() => {
    if (method !== 'upi' || !tenant?.upi_id) return setQr(null)
    QRCode.toDataURL(upiLink(tenant.upi_id, tenant.name, amount), { width: 260, margin: 1 }).then(setQr)
  }, [method, amount, tenant])

  return (
    <Card className="space-y-3 border-4 border-green-500">
      <div className="text-center">
        <div className="text-lg font-semibold text-slate-600">{t('takeMoney')}</div>
        <div className="text-5xl font-extrabold text-green-700">{rupees(amount)}</div>
      </div>
      <Choice
        cols={2}
        value={method}
        onChange={onMethod}
        options={[
          { value: 'cash', icon: '💵', label: t('cash') },
          { value: 'upi', icon: '📱', label: t('upi') },
        ]}
      />
      {method === 'upi' && (
        <div className="space-y-2 text-center">
          {qr ? (
            <>
              <div className="font-semibold">{t('scanToPay')}</div>
              <img src={qr} alt="UPI QR" className="mx-auto rounded-lg border" />
            </>
          ) : null}
          <Field label={t('upiRef')} inputMode="numeric" value={upiRef} onChange={(e) => onUpiRef(e.target.value)} />
        </div>
      )}
    </Card>
  )
}

// Main action pinned to the bottom of the screen, always within thumb reach.
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20">
      <div className="mx-auto max-w-lg space-y-2 border-t-2 border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur">
        {children}
      </div>
    </div>
  )
}

// Full-screen confirmation after a save: big tick, vehicle number and amount, spoken aloud,
// then moves on to the next vehicle by itself unless the worker taps something.
export function SuccessScreen({ tone, title, reg, amount, note, speech, nextLabel, onNext, onHome, children }: {
  tone: 'green' | 'red' | 'purple' | 'amber'
  title: string; reg?: string; amount?: number; note?: string; speech: string
  nextLabel: string; onNext: () => void; onHome: () => void; children?: ReactNode
}) {
  const { t, lang } = useT()
  const [left, setLeft] = useState<number | null>(8)
  useEffect(() => { feedbackSuccess(speech, lang) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (left === null) return
    if (left <= 0) return onNext()
    const id = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(id)
  }, [left, onNext])

  const bg = { green: 'bg-green-600', red: 'bg-red-600', purple: 'bg-purple-700', amber: 'bg-amber-500' }[tone]
  return (
    <div className={`mx-auto flex min-h-dvh max-w-lg flex-col ${bg} text-white`} onPointerDown={() => setLeft(null)}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white text-7xl text-green-600 shadow-lg">✓</div>
        <div className="text-3xl font-extrabold">{title}</div>
        {reg && (
          <div className="rounded-lg border-4 border-slate-900 bg-yellow-50 px-5 py-2 font-mono text-4xl font-bold tracking-widest text-slate-900">
            {reg}
          </div>
        )}
        {amount !== undefined && amount > 0 && <div className="text-5xl font-extrabold">{rupees(amount)}</div>}
        {note && <div className="rounded-xl bg-white/20 px-4 py-2 text-xl font-bold">{note}</div>}
      </div>
      <div className="space-y-3 rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-slate-900">
        {children}
        <button onClick={onNext} className={`w-full rounded-xl py-5 text-2xl font-bold text-white ${bg}`}>
          {nextLabel} →{left !== null && <span className="ml-2 text-lg opacity-80">({left})</span>}
        </button>
        <button onClick={onHome} className="w-full py-2 text-lg font-semibold text-slate-600 underline">🏠 {t('home')}</button>
      </div>
    </div>
  )
}

export function Spinner() {
  const { t } = useT()
  return <div className="p-8 text-center text-lg text-slate-500">{t('loading')}</div>
}

export function Stat({ label, value, tone = 'slate' }: { label: string; value: ReactNode; tone?: 'slate' | 'green' | 'red' | 'blue' | 'amber' }) {
  const c = { slate: 'text-slate-900', green: 'text-green-700', red: 'text-red-700', blue: 'text-blue-700', amber: 'text-amber-700' }[tone]
  return (
    <Card>
      <div className="text-sm font-semibold text-slate-500">{label}</div>
      <div className={`text-2xl font-extrabold ${c}`}>{value}</div>
    </Card>
  )
}
