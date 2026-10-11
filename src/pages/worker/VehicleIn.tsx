import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc, type Lookup, type PayMethod, type PaymentType } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { useRates } from '../../lib/useRates'
import { failure } from '../../lib/feedback'
import { amountLine, shareToken } from '../../lib/token'
import { fmtDate, fmtTime, rupees, suggestPlan, waLink } from '../../lib/format'
import { ActionBar, Banner, Button, Card, Choice, ErrorBox, Label, PayCollector, Screen, SuccessScreen, VehicleTypePicker } from '../../components/ui'
import { RegPlate, VehicleSearch } from '../../components/VehicleSearch'

type InPlan = 'day' | 'night' | 'full_day'
interface Done { reg_no: string; paid: number; payment_type: PaymentType; on_pass: boolean }

export default function VehicleIn() {
  const { t, lang } = useT()
  const nav = useNavigate()
  const { tenant } = useAuth()
  const { rates } = useRates()
  const [lk, setLk] = useState<Lookup | null>(null)
  const [typeId, setTypeId] = useState<string | null>(null)
  const [plan, setPlan] = useState<InPlan>(suggestPlan(tenant))
  const [method, setMethod] = useState<PayMethod | null>(null)
  const [upiRef, setUpiRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<Done | null>(null)

  const reset = useCallback(() => {
    setLk(null); setTypeId(null); setMethod(null); setUpiRef(''); setError(null); setDone(null); setPlan(suggestPlan(tenant))
  }, [tenant])

  if (done) {
    const entryTime = fmtTime(new Date().toISOString(), lang)
    const how = done.on_pass ? t('onPass') : done.paid > 0 ? `${rupees(done.paid)} ${t('paid')}` : t(done.payment_type)
    const msg = `${tenant?.name}\n${t('vehicleIn')}: ${done.reg_no}\n${t(plan)} · ${how}\n${entryTime}`
    return (
      <SuccessScreen
        tone="green"
        title={t('entryDone')}
        reg={done.reg_no}
        amount={done.paid}
        note={done.on_pass ? `📅 ${t('onPass')}` : done.paid > 0 ? undefined : done.payment_type === 'exit' ? `🕐 ${t('payAtExit')}` : `📒 ${t('goesToKhata')}`}
        speech={t('saySavedIn')}
        nextLabel={t('nextVehicle')}
        onNext={reset}
        onHome={() => nav('/')}
      >
        <button
          onClick={() => shareToken({
            site: tenant?.name ?? '', reg: done.reg_no, title: `${t('vehicleIn')} · ${done.on_pass ? t('pass') : t(plan)}`,
            time: entryTime, amountLine: amountLine(done.paid, done.on_pass ? t('pass') : t(done.payment_type)), footer: t('tokenFooter'),
          }, msg)}
          className="w-full rounded-xl bg-slate-800 py-3 text-lg font-bold text-white"
        >
          🎫 {t('shareToken')}
        </button>
        {lk?.customer?.phone && (
          <a href={waLink(lk.customer.phone, msg)} target="_blank" rel="noreferrer"
            className="block w-full rounded-xl bg-green-500 py-3 text-center text-lg font-bold text-white">
            💬 {t('sendWhatsApp')}
          </a>
        )}
      </SuccessScreen>
    )
  }

  if (!lk) {
    return (
      <Screen title={t('vehicleIn')} back="/">
        <VehicleSearch mode="in" onResult={(r) => { setLk(r); setTypeId(r.vehicle?.vehicle_type_id ?? null) }} />
      </Screen>
    )
  }

  const reg = lk.vehicle?.reg_no ?? lk.reg_no ?? ''
  const onPass = !!lk.pass
  const price = (p: InPlan) => lk.found ? lk.prices?.[p]?.amount : typeId ? rates[typeId]?.[p] : undefined
  const sub = (p: InPlan) => {
    const a = price(p)
    if (a === undefined) return '—'
    return (lk.prices?.[p]?.source.startsWith('special') ? '⭐ ' : '') + rupees(a)
  }
  const payType: PaymentType | undefined = lk.found
    ? (plan === 'day' ? lk.pay_day : plan === 'night' ? lk.pay_night : lk.pay_full_day)
    : (plan === 'day' ? tenant?.walkin_pay_day : plan === 'night' ? tenant?.walkin_pay_night : tenant?.walkin_pay_full_day)
  const amount = price(plan)
  const needsPay = !onPass && payType === 'entry' && (amount ?? 0) > 0
  const isKhata = payType === 'weekly_khata' || payType === 'monthly_khata'
  const ready = !lk.session && (onPass || (typeId && amount !== undefined && (!needsPay || method)))

  async function save() {
    setBusy(true)
    setError(null)
    try {
      setDone(await rpc('vehicle_in', {
        p_reg: reg, p_vehicle_type: typeId, p_plan: plan,
        p_method: needsPay ? method : null, p_upi_ref: method === 'upi' ? upiRef : null,
      }))
    } catch (e) {
      failure()
      setError(e)
    }
    setBusy(false)
  }

  return (
    <Screen title={t('vehicleIn')} back="/">
      <div className="flex items-center justify-between">
        <RegPlate reg={reg} big />
        <button onClick={reset} className="rounded-lg border-2 border-slate-300 bg-white px-3 py-2 font-semibold">✕ {t('cancel')}</button>
      </div>

      {lk.customer && (
        <Card>
          <div className="text-xl font-bold">👤 {lk.customer.name}</div>
          <div className="text-slate-700">{lk.customer.phone} · {t(lk.customer.payment_type)}</div>
          {Number(lk.customer.balance) > 0 && <div className="font-bold text-red-700">{t('balance')}: {rupees(lk.customer.balance)}</div>}
        </Card>
      )}
      {!lk.found && <Banner tone="blue">🆕 {t('newVehicle')}</Banner>}

      {lk.session ? (
        <Banner tone="amber">⚠️ {t('ERR_ALREADY_INSIDE')}</Banner>
      ) : onPass ? (
        <Banner tone="green">✅ {t('onPass')} — {t('validTill')} {fmtDate(lk.pass!.end_date, lang)}</Banner>
      ) : (
        <>
          {!lk.found && (
            <div>
              <Label k="vehicleType" />
              <VehicleTypePicker value={typeId} onChange={setTypeId} />
            </div>
          )}
          <div>
            <Label k="choosePlan" />
            <Choice<InPlan>
              value={plan}
              onChange={setPlan}
              options={[
                { value: 'day', icon: '☀️', label: t('day'), sub: sub('day') },
                { value: 'night', icon: '🌙', label: t('night'), sub: sub('night') },
                { value: 'full_day', icon: '🕐', label: t('full_day'), sub: sub('full_day') },
              ]}
            />
          </div>
          {typeId && amount === undefined && <Banner tone="red">{t('ERR_PRICE_NOT_SET')}</Banner>}
          {amount !== undefined && (needsPay ? (
            <PayCollector amount={amount} method={method} onMethod={setMethod} upiRef={upiRef} onUpiRef={setUpiRef} />
          ) : (
            <Banner tone={isKhata ? 'amber' : 'blue'}>
              {isKhata ? `📒 ${t('goesToKhata')}` : `🕐 ${t('payAtExit')}`} · {rupees(amount)}
            </Banner>
          ))}
        </>
      )}

      <ErrorBox error={error} />

      <ActionBar>
        {lk.session ? (
          <Button big tone="red" onClick={() => nav('/out', { state: { reg } })}>🔴 {t('vehicleOut')}</Button>
        ) : (
          <Button big tone="green" disabled={!ready || busy} onClick={save}>
            {busy ? t('loading') : needsPay ? `✔ ${t('moneyReceived')} · ${rupees(amount)}` : `✔ ${t('vehicleIn')}`}
          </Button>
        )}
      </ActionBar>
    </Screen>
  )
}
