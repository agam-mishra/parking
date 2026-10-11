import { lazy, Suspense, useState } from 'react'
import { supabase, phoneToEmail } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { Button, ErrorBox, Field, LangToggle } from '../components/ui'

const DemoPanel = import.meta.env.VITE_DEMO === '1' ? lazy(() => import('../demo/DemoPanel').then((m) => ({ default: m.DemoPanel }))) : null

export default function Login() {
  const { t } = useT()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function submit(e?: React.FormEvent, creds?: { phone: string; pin: string }) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(creds?.phone ?? phone), password: creds?.pin ?? pin,
    })
    if (error) setError(error)
    setBusy(false)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-blue-700">
      <div className="flex justify-end p-4"><LangToggle /></div>
      <div className="px-6 pb-8 pt-4 text-center text-white">
        <div className="text-7xl">🅿️</div>
        <h1 className="mt-2 text-4xl font-extrabold">{t('appName')}</h1>
      </div>
      <form onSubmit={submit} className="flex-1 space-y-5 rounded-t-3xl bg-white p-6">
        {DemoPanel && (
          <Suspense fallback={null}>
            <DemoPanel onPick={(p, n) => { setPhone(p); setPin(n); submit(undefined, { phone: p, pin: n }) }} />
          </Suspense>
        )}
        <Field label={t('phone')} inputMode="numeric" autoComplete="username" maxLength={10}
          value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
        <Field label={t('pin')} type="password" inputMode="numeric" autoComplete="current-password" maxLength={6}
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        <ErrorBox error={error} />
        <Button big disabled={busy || phone.length !== 10 || pin.length !== 6}>
          {busy ? t('loading') : t('login')}
        </Button>
      </form>
    </div>
  )
}
