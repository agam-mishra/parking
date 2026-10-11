import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { rpc, type Lookup, type PayMethod, type PaymentType, type SessionPlan } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { failure } from '../../lib/feedback'
import { fmtDuration, fmtTime, rupees, waLink } from '../../lib/format'
import { ActionBar, Banner, Button, Card, ErrorBox, PayCollector, Screen, SuccessScreen } from '../../components/ui'
import { useDialog } from '../../components/Dialogs'
import { RegPlate, VehicleSearch } from '../../components/VehicleSearch'

interface Preview {
  session_id: string; plan: SessionPlan; entry_at: string; now: string; payment_type: PaymentType
  base: number; total: number; overstay: number; paid: number; due_now: number; to_khata: number
}

export default function VehicleOut() {
  const { t, lang } = useT()
  const nav = useNavigate()
  const loc = useLocation()
  const { tenant } = useAuth()
  const dialog = useDialog()
  const [lk, setLk] = useState<Lookup | null>(null)
  const [pv, setPv] = useState<Preview | null>(null)
  const [method, setMethod] = useState<PayMethod | null>(null)
  const [upiRef, setUpiRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<(Preview & { collected: number }) | null>(null)
  const [initial, setInitial] = useState((loc.state as { reg?: string })?.reg ?? '')

  const reset = useCallback(() => {
    setLk(null); setPv(null); setMethod(null); setUpiRef(''); setError(null); setDone(null); setInitial('')
  }, [])

  async function onFound(r: Lookup) {
    setLk(r)
    setError(null)
    if (!r.session) return failure()
    try {
      setPv(await rpc<Preview>('exit_preview', { p_session: r.session.id }))
    } catch (e) {
      setError(e)
    }
  }

  async function save() {
    if (!pv) return
    setBusy(true)
    setError(null)
    try {
      setDone(await rpc('vehicle_out', {
        p_session: pv.session_id, p_expected_due: pv.due_now,
        p_method: pv.due_now > 0 ? method : null, p_upi_ref: method === 'upi' ? upiRef : null,
      }))
    } catch (e) {
      failure()
      setError(e)
      // Price may have moved on; refresh so the worker sees the new amount.
      if (/AMOUNT_CHANGED/.test(String((e as Error).message))) {
        setPv(await rpc<Preview>('exit_preview', { p_session: pv.session_id }))
      }
    }
    setBusy(false)
  }

  async function undo() {
    if (!pv) return
    const ok = await dialog.confirm({ title: t('removeEntryQ'), message: t('removeEntryMsg'), yes: t('undoEntry'), danger: true })
    if (!ok) return
    try {
      await rpc('cancel_session', { p_session: pv.session_id, p_reason: 'wrong entry' })
      reset()
    } catch (e) {
      failure()
      setError(e)
    }
  }

  const reg = lk?.vehicle?.reg_no ?? lk?.reg_no ?? ''

  if (done) {
    const msg = `${tenant?.name}\n${t('vehicleOut')}: ${reg}\n${t('duration')}: ${fmtDuration(done.entry_at, done.now, lang)}\n${t('total')}: ${rupees(done.total)}${done.to_khata ? ' (' + t('goesToKhata') + ')' : ''}`
    return (
      <SuccessScreen
        tone="red"
        title={t('exitDone')}
        reg={reg}
        amount={done.collected}
        note={done.to_khata > 0 ? `📒 ${rupees(done.to_khata)} ${t('goesToKhata')}` : `⏱ ${fmtDuration(done.entry_at, done.now, lang)}`}
        speech={t('saySavedOut')}
        nextLabel={t('nextVehicle')}
        onNext={reset}
        onHome={() => nav('/')}
      >
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
      <Screen title={t('vehicleOut')} back="/">
        <VehicleSearch mode="out" onResult={onFound} initial={initial} />
      </Screen>
    )
  }

  return (
    <Screen title={t('vehicleOut')} back="/">
      <div className="flex items-center justify-between">
        <RegPlate reg={reg} big />
        <button onClick={reset} className="rounded-lg border-2 border-slate-300 bg-white px-3 py-2 font-semibold">✕ {t('cancel')}</button>
      </div>

      {!lk.session ? (
        <Banner tone="red">⚠️ {t('notInside')}</Banner>
      ) : pv && (
        <>
          <Card className="space-y-2 text-lg">
            {lk.customer && <div className="text-xl font-bold">👤 {lk.customer.name}</div>}
            <Row label={t('parkedSince')} value={fmtTime(pv.entry_at, lang)} />
            <Row label={t('duration')} value={fmtDuration(pv.entry_at, pv.now, lang)} />
            <Row label={t('choosePlan')} value={t(pv.plan)} />
            {pv.plan !== 'pass' && <Row label={t(pv.plan)} value={rupees(pv.base)} />}
            {pv.overstay > 0 && <Row label={`⏰ ${t('extraCharge')}`} value={rupees(pv.overstay)} tone="text-red-700" />}
            {pv.paid > 0 && <Row label={t('alreadyPaid')} value={`− ${rupees(pv.paid)}`} tone="text-green-700" />}
          </Card>

          {pv.plan === 'pass' ? (
            <Banner tone="green">✅ {t('onPass')}</Banner>
          ) : pv.to_khata > 0 ? (
            <Banner tone="amber">📒 {rupees(pv.to_khata)} {t('goesToKhata')}</Banner>
          ) : pv.due_now > 0 ? (
            <PayCollector amount={pv.due_now} method={method} onMethod={setMethod} upiRef={upiRef} onUpiRef={setUpiRef} />
          ) : (
            <Banner tone="green">✅ {t('noPaymentNow')}</Banner>
          )}

          <button onClick={undo} className="w-full py-2 text-slate-600 underline">{t('undoEntry')}</button>
        </>
      )}
      <ErrorBox error={error} />

      <ActionBar>
        {pv ? (
          <Button big tone="red" disabled={busy || (pv.due_now > 0 && !method)} onClick={save}>
            {busy ? t('loading') : pv.due_now > 0 ? `✔ ${t('moneyReceived')} · ${rupees(pv.due_now)}` : `✔ ${t('vehicleOut')}`}
          </Button>
        ) : (
          <Button big tone="slate" onClick={reset}>🔍 {t('search')}</Button>
        )}
      </ActionBar>
    </Screen>
  )
}

function Row({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-700">{label}</span>
      <span className={`font-bold ${tone}`}>{value}</span>
    </div>
  )
}
