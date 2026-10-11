import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { rpc, type Lookup, type PayMethod } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { fmtDate, rupees, todayISO, waLink } from '../../lib/format'
import { failure } from '../../lib/feedback'
import { ActionBar, Banner, Button, Card, Choice, ErrorBox, Field, Label, PayCollector, Screen, SuccessScreen, VehicleTypePicker } from '../../components/ui'
import { RegPlate, VehicleSearch } from '../../components/VehicleSearch'
import { CustomerForm } from '../../components/CustomerForm'

type PassPlan = 'weekly' | 'monthly'

export default function Pass() {
  const { t, lang } = useT()
  const nav = useNavigate()
  const loc = useLocation()
  const { tenant } = useAuth()
  const [lk, setLk] = useState<Lookup | null>(null)
  const [typeId, setTypeId] = useState<string | null>(null)
  const [plan, setPlan] = useState<PassPlan>('monthly')
  const [start, setStart] = useState(todayISO())
  const [method, setMethod] = useState<PayMethod | null>(null)
  const [upiRef, setUpiRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<{ start_date: string; end_date: string; amount: number } | null>(null)

  const reg = lk?.vehicle?.reg_no ?? lk?.reg_no ?? ''

  async function refresh(r = reg) {
    const res = await rpc<Lookup>('lookup_vehicle', { p_reg: r })
    setLk(res)
    setStart(res.next_pass_start ?? todayISO())
  }

  if (done && lk?.customer) {
    const msg = `${tenant?.name}\n${t(plan)} ${t('pass')}: ${reg}\n${fmtDate(done.start_date, lang)} → ${fmtDate(done.end_date, lang)}\n${rupees(done.amount)}`
    return (
      <SuccessScreen
        tone="purple"
        title={t('passActive')}
        reg={reg}
        amount={lk.customer.payment_type.endsWith('khata') ? 0 : done.amount}
        note={`📅 ${fmtDate(done.start_date, lang)} → ${fmtDate(done.end_date, lang)}`}
        speech={t('saySavedPass')}
        nextLabel={t('home')}
        onNext={() => nav('/')}
        onHome={() => nav('/')}
      >
        <a href={waLink(lk.customer.phone, msg)} target="_blank" rel="noreferrer"
          className="block w-full rounded-xl bg-green-500 py-3 text-center text-lg font-bold text-white">
          💬 {t('sendWhatsApp')}
        </a>
      </SuccessScreen>
    )
  }

  if (!lk) {
    return (
      <Screen title={t('newPass')} back="/">
        <VehicleSearch initial={(loc.state as { reg?: string })?.reg ?? ''}
          onResult={(r) => { setLk(r); setStart(r.next_pass_start ?? todayISO()) }} />
      </Screen>
    )
  }

  const header = (
    <div className="flex items-center justify-between">
      <RegPlate reg={reg} big />
      <button onClick={() => setLk(null)} className="rounded-lg border-2 border-slate-300 bg-white px-3 py-2 font-semibold">✕ {t('cancel')}</button>
    </div>
  )

  // Step 1: driver details (new vehicle, or vehicle without a registered driver).
  if (!lk.customer) {
    return (
      <Screen title={t('registerDriver')} back="/">
        {header}
        {!lk.found && (
          <div>
            <Label k="vehicleType" />
            <VehicleTypePicker value={typeId} onChange={setTypeId} />
          </div>
        )}
        <CustomerForm reg={reg} vehicleId={lk.vehicle?.id} typeId={typeId} onSaved={() => refresh()} />
      </Screen>
    )
  }

  // Step 2: choose plan and pay.
  const c = lk.customer
  const isKhata = c.payment_type === 'weekly_khata' || c.payment_type === 'monthly_khata'
  const amount = lk.prices?.[plan]?.amount
  const needsPay = !isKhata && (amount ?? 0) > 0

  async function save() {
    setBusy(true)
    setError(null)
    try {
      setDone(await rpc('create_pass', {
        p_vehicle: lk!.vehicle!.id, p_plan: plan, p_start: start,
        p_method: needsPay ? method : null, p_upi_ref: method === 'upi' ? upiRef : null,
      }))
    } catch (e) {
      failure()
      setError(e)
    }
    setBusy(false)
  }

  return (
    <Screen title={t('newPass')} back="/">
      {header}
      <Card>
        <div className="text-xl font-bold">👤 {c.name}</div>
        <div className="text-slate-600">{c.phone}</div>
      </Card>
      {lk.pass && <Banner tone="green">✅ {t('passActive')} — {t('validTill')} {fmtDate(lk.pass.end_date, lang)}</Banner>}
      <div>
        <Label k="choosePlan" />
        <Choice<PassPlan>
          cols={2}
          value={plan}
          onChange={setPlan}
          options={[
            { value: 'weekly', icon: '📆', label: t('weekly'), sub: lk.prices?.weekly ? (lk.prices.weekly.source.startsWith('special') ? '⭐ ' : '') + rupees(lk.prices.weekly.amount) : '—' },
            { value: 'monthly', icon: '🗓️', label: t('monthly'), sub: lk.prices?.monthly ? (lk.prices.monthly.source.startsWith('special') ? '⭐ ' : '') + rupees(lk.prices.monthly.amount) : '—' },
          ]}
        />
      </div>
      <Field label={t('startDate')} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      {amount === undefined ? (
        <Banner tone="red">{t('ERR_PRICE_NOT_SET')}</Banner>
      ) : needsPay ? (
        <PayCollector amount={amount} method={method} onMethod={setMethod} upiRef={upiRef} onUpiRef={setUpiRef} />
      ) : (
        <Banner tone="amber">📒 {rupees(amount)} {t('goesToKhata')}</Banner>
      )}
      <ErrorBox error={error} />
      <ActionBar>
        <Button big tone="purple" disabled={busy || amount === undefined || (needsPay && !method)} onClick={save}>
          {busy ? t('loading') : needsPay ? `✔ ${t('moneyReceived')} · ${rupees(amount!)}` : `✔ ${lk.pass ? t('renew') : t('newPass')}`}
        </Button>
      </ActionBar>
    </Screen>
  )
}
