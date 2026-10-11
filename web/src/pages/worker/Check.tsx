import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc, type Lookup, type PayMethod } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { failure, success } from '../../lib/feedback'
import { daysBetween, fmtDate, fmtDuration, rupees, todayISO, waLink } from '../../lib/format'
import { Banner, Button, Card, ErrorBox, Field, PayCollector, Screen } from '../../components/ui'
import { RegPlate, VehicleSearch } from '../../components/VehicleSearch'

export default function Check() {
  const { t, lang } = useT()
  const nav = useNavigate()
  const [lk, setLk] = useState<Lookup | null>(null)

  if (!lk) {
    return (
      <Screen title={t('checkVehicle')} back="/">
        <VehicleSearch mode="any" onResult={setLk} />
      </Screen>
    )
  }

  const reg = lk.vehicle?.reg_no ?? lk.reg_no ?? ''
  const daysLeft = lk.pass ? daysBetween(todayISO(), lk.pass.end_date) : null

  return (
    <Screen title={t('checkVehicle')} back="/">
      <div className="flex items-center justify-between">
        <RegPlate reg={reg} big />
        <button onClick={() => setLk(null)} className="rounded-lg border-2 border-slate-300 bg-white px-3 py-2 font-semibold">🔍 {t('search')}</button>
      </div>

      {!lk.found ? (
        <Banner tone="blue">🆕 {t('newVehicle')}</Banner>
      ) : lk.pass ? (
        <Banner tone={daysLeft! <= 3 ? 'amber' : 'green'}>
          {daysLeft! <= 3 ? '⚠️ ' + t('passExpiring') : '✅ ' + t('passActive')} — {t(lk.pass.plan)} · {t('validTill')} {fmtDate(lk.pass.end_date, lang)}
        </Banner>
      ) : lk.customer ? (
        <Banner tone="red">❌ {t('noPass')}</Banner>
      ) : (
        <Banner tone="blue">{t('walkIn')}</Banner>
      )}

      {lk.session ? (
        <Card>
          <div className="text-lg font-bold text-green-700">🅿️ {t('insideNow')}</div>
          <div className="text-slate-600">{t('duration')}: {fmtDuration(lk.session.entry_at, new Date().toISOString(), lang)} · {t(lk.session.plan)}</div>
        </Card>
      ) : null}

      {lk.customer && <CustomerCard lk={lk} onChange={async () => setLk(await rpc('lookup_vehicle', { p_reg: reg }))} />}

      <div className="grid grid-cols-2 gap-3">
        {lk.session
          ? <Button tone="red" onClick={() => nav('/out', { state: { reg } })}>🔴 {t('vehicleOut')}</Button>
          : <Button tone="green" onClick={() => nav('/in')}>🟢 {t('vehicleIn')}</Button>}
        <Button tone="purple" onClick={() => nav('/pass', { state: { reg } })}>📅 {lk.pass ? t('renew') : t('newPass')}</Button>
      </div>
    </Screen>
  )
}

function CustomerCard({ lk, onChange }: { lk: Lookup; onChange: () => void }) {
  const { t, lang } = useT()
  const { tenant } = useAuth()
  const c = lk.customer!
  const [paying, setPaying] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethod | null>(null)
  const [upiRef, setUpiRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [paid, setPaid] = useState<{ amount: number; balance: number } | null>(null)
  const balance = Number(c.balance)
  const isKhata = c.payment_type === 'weekly_khata' || c.payment_type === 'monthly_khata'

  async function pay() {
    setBusy(true)
    setError(null)
    try {
      const r = await rpc<{ balance: number }>('khata_payment', {
        p_customer: c.id, p_amount: Number(amount), p_method: method, p_upi_ref: method === 'upi' ? upiRef : null,
      })
      setPaid({ amount: Number(amount), balance: Number(r.balance) })
      success(t('sayKhataPaid'), lang)
      setPaying(false)
      setAmount('')
      setMethod(null)
      onChange()
    } catch (e) {
      failure()
      setError(e)
    }
    setBusy(false)
  }

  return (
    <Card className="space-y-3">
      <div>
        <div className="text-xl font-bold">👤 {c.name}</div>
        <div className="text-slate-600">📞 {c.phone} · {t(c.payment_type)}</div>
      </div>
      {(isKhata || balance !== 0) && (
        <div className={`text-2xl font-extrabold ${balance > 0 ? 'text-red-700' : 'text-green-700'}`}>
          {t('balance')}: {rupees(balance)}
          {c.credit_limit != null && <span className="ml-2 text-base font-semibold text-slate-500">/ {rupees(c.credit_limit)}</span>}
        </div>
      )}
      {paid && (
        <>
          <Banner tone="green">✅ {rupees(paid.amount)} {t('paid')} · {t('balance')}: {rupees(paid.balance)}</Banner>
          <a href={waLink(c.phone, `${tenant?.name}\n${t('khataPay')}: ${rupees(paid.amount)}\n${t('balance')}: ${rupees(paid.balance)}`)}
            target="_blank" rel="noreferrer" className="block rounded-xl bg-green-500 py-3 text-center font-bold text-white">
            💬 {t('sendWhatsApp')}
          </a>
        </>
      )}
      {(isKhata || balance > 0) && !paying && (
        <Button tone="amber" onClick={() => { setPaying(true); setPaid(null); setAmount(balance > 0 ? String(balance) : '') }}>
          💰 {t('khataPay')}
        </Button>
      )}
      {paying && (
        <div className="space-y-3">
          <Field label={t('amount')} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          {Number(amount) > 0 && (
            <PayCollector amount={Number(amount)} method={method} onMethod={setMethod} upiRef={upiRef} onUpiRef={setUpiRef} />
          )}
          <ErrorBox error={error} />
          <Button tone="green" disabled={busy || !(Number(amount) > 0) || !method} onClick={pay}>✔ {t('moneyReceived')}</Button>
          <button onClick={() => setPaying(false)} className="w-full py-2 text-slate-500 underline">{t('cancel')}</button>
        </div>
      )}
    </Card>
  )
}
