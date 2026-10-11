import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { rpc, supabase, type Customer, type PaymentType, type Plan } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { fmtDate, fmtTime, rupees, todayISO, waLink } from '../../lib/format'
import { Banner, Button, Card, Choice, ErrorBox, Field, Label, Screen, Spinner } from '../../components/ui'
import { PLANS } from './Prices'
import { VehiclePrices } from '../../components/VehiclePrices'

interface Ledger { id: string; kind: 'charge' | 'payment' | 'adjustment'; amount: number; note: string | null; created_at: string; session_id: string | null; pass_id: string | null }
interface Vehicle { id: string; reg_no: string; vehicle_type_id: string }

const monthStart = () => todayISO().slice(0, 8) + '01'

export default function CustomerDetail() {
  const { id } = useParams()
  const { t, lang } = useT()
  const { tenant, profile } = useAuth()
  const [c, setC] = useState<Customer | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [special, setSpecial] = useState<Record<string, string>>({})
  const [payType, setPayType] = useState<PaymentType>('entry')
  const [limit, setLimit] = useState('')
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayISO())
  const [ledger, setLedger] = useState<Ledger[]>([])
  const [opening, setOpening] = useState(0)
  const [adj, setAdj] = useState({ amount: '', note: '' })
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const [cu, ve, sr] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase.from('vehicles').select('id, reg_no, vehicle_type_id').eq('customer_id', id),
      supabase.from('special_rates').select('plan, amount').eq('customer_id', id),
    ])
    setC(cu.data)
    setPayType(cu.data?.payment_type ?? 'entry')
    setLimit(cu.data?.credit_limit?.toString() ?? '')
    setVehicles(ve.data ?? [])
    setSpecial(Object.fromEntries((sr.data ?? []).map((r) => [r.plan, String(r.amount)])))
  }, [id])

  const loadLedger = useCallback(async () => {
    const endExcl = new Date(to + 'T00:00:00')
    endExcl.setDate(endExcl.getDate() + 1)
    const [before, inRange] = await Promise.all([
      supabase.from('ledger_entries').select('amount').eq('customer_id', id).lt('created_at', new Date(from + 'T00:00:00').toISOString()),
      supabase.from('ledger_entries').select('*').eq('customer_id', id)
        .gte('created_at', new Date(from + 'T00:00:00').toISOString()).lt('created_at', endExcl.toISOString()).order('created_at'),
    ])
    setOpening((before.data ?? []).reduce((s, r) => s + Number(r.amount), 0))
    setLedger(inRange.data ?? [])
  }, [id, from, to])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadLedger() }, [loadLedger])

  if (!c || !tenant) return <Screen title={t('customer')}><Spinner /></Screen>

  const charges = ledger.filter((l) => l.kind === 'charge').reduce((s, l) => s + Number(l.amount), 0)
  const payments = -ledger.filter((l) => l.kind === 'payment').reduce((s, l) => s + Number(l.amount), 0)
  const adjustments = ledger.filter((l) => l.kind === 'adjustment').reduce((s, l) => s + Number(l.amount), 0)
  const closing = opening + charges - payments + adjustments

  async function saveBilling() {
    setError(null)
    setSaved(false)
    const up = await supabase.from('customers')
      .update({ payment_type: payType, credit_limit: limit === '' ? null : Number(limit) }).eq('id', c!.id)
    if (up.error) return setError(up.error)
    await supabase.from('special_rates').delete().eq('customer_id', c!.id)
    const rows = Object.entries(special).filter(([, v]) => v !== '')
      .map(([plan, v]) => ({ tenant_id: tenant!.id, customer_id: c!.id, plan: plan as Plan, amount: Number(v), set_by: profile?.id }))
    if (rows.length) {
      const ins = await supabase.from('special_rates').insert(rows)
      if (ins.error) return setError(ins.error)
    }
    setSaved(true)
    load()
  }

  async function adjust() {
    try {
      await rpc('khata_adjust', { p_customer: c!.id, p_amount: Number(adj.amount), p_note: adj.note })
      setAdj({ amount: '', note: '' })
      loadLedger()
    } catch (e) {
      setError(e)
    }
  }

  const bill = [
    `${tenant.name}`, `${t('statement')}: ${c.name}`,
    `${fmtDate(from, lang)} – ${fmtDate(to, lang)}`,
    `${t('opening')}: ${rupees(opening)}`,
    `${t('charges')}: ${rupees(charges)} (${ledger.filter((l) => l.kind === 'charge').length})`,
    `${t('paid')}: ${rupees(payments)}`,
    adjustments ? `${t('adjust')}: ${rupees(adjustments)}` : '',
    `*${t('closing')}: ${rupees(closing)}*`,
    tenant.upi_id ? `UPI: ${tenant.upi_id}` : '',
  ].filter(Boolean).join('\n')

  return (
    <Screen title={c.name}>
      <Card>
        <div className="text-xl font-bold">👤 {c.name}</div>
        <div className="text-slate-600">📞 {c.phone} · {t(c.id_type)}{c.id_number ? ` ••${c.id_number}` : ''}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {vehicles.map((v) => <span key={v.id} className="rounded bg-yellow-100 px-2 py-1 font-mono font-bold">{v.reg_no}</span>)}
        </div>
      </Card>

      <Card className="space-y-3">
        <Label k="paymentType" />
        <Choice<PaymentType> cols={2} value={payType} onChange={setPayType}
          options={(['entry', 'exit', 'weekly_khata', 'monthly_khata'] as PaymentType[]).map((v) => ({ value: v, label: t(v) }))} />
        {(payType === 'weekly_khata' || payType === 'monthly_khata') && (
          <Field label={t('creditLimit')} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))} />
        )}
        <Label k="specialPrice" />
        <div className="grid grid-cols-5 gap-1">
          {PLANS.map((p) => (
            <label key={p} className="text-center text-sm">
              {t(p)}
              <input inputMode="decimal" placeholder="—" value={special[p] ?? ''}
                onChange={(e) => setSpecial({ ...special, [p]: e.target.value.replace(/[^\d.]/g, '') })}
                className="mt-1 w-full rounded-lg border-2 border-slate-300 px-1 py-2 text-center" />
            </label>
          ))}
        </div>
        {saved && <Banner tone="green">✅ {t('saved')}</Banner>}
        <Button onClick={saveBilling}>{t('save')}</Button>
      </Card>

      {vehicles.map((v) => (
        <Card key={v.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-yellow-100 px-2 py-1 font-mono font-bold">{v.reg_no}</span>
            <span className="font-bold">⭐ {t('vehiclePrice')}</span>
          </div>
          <VehiclePrices vehicleId={v.id} vehicleTypeId={v.vehicle_type_id} customerId={c.id} />
        </Card>
      ))}

      <Card className="space-y-3">
        <Label k="statement" />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('from')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Field label={t('to')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1 text-lg">
          <Line label={t('opening')} value={rupees(opening)} />
          <Line label={`${t('charges')} (${ledger.filter((l) => l.kind === 'charge').length})`} value={rupees(charges)} />
          <Line label={t('paid')} value={`− ${rupees(payments)}`} />
          {adjustments !== 0 && <Line label={t('adjust')} value={rupees(adjustments)} />}
          <div className="border-t pt-1"><Line label={t('closing')} value={rupees(closing)} bold /></div>
        </div>
        <details>
          <summary className="cursor-pointer text-blue-700">{ledger.length} ▾</summary>
          <div className="mt-2 divide-y text-sm">
            {ledger.map((l) => (
              <div key={l.id} className="flex justify-between py-1">
                <span>{fmtTime(l.created_at, lang)} · {t(l.kind === 'charge' ? 'charges' : l.kind === 'payment' ? 'paid' : 'adjust')}{l.note ? ` · ${l.note}` : ''}</span>
                <span className={Number(l.amount) < 0 ? 'text-green-700' : 'text-red-700'}>{rupees(l.amount)}</span>
              </div>
            ))}
          </div>
        </details>
        <a href={waLink(c.phone, bill)} target="_blank" rel="noreferrer"
          className="block rounded-xl bg-green-500 py-3 text-center text-lg font-bold text-white">💬 {t('sendBill')}</a>
      </Card>

      <Card className="space-y-3">
        <Label k="adjust" />
        <Field label={`${t('amount')} (+ / −)`} inputMode="text" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value.replace(/[^\d.-]/g, '') })} />
        <Field label={t('note')} value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} />
        <Button tone="slate" disabled={!Number(adj.amount) || !adj.note.trim()} onClick={adjust}>{t('save')}</Button>
      </Card>
      <ErrorBox error={error} />
    </Screen>
  )
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? 'text-xl font-extrabold' : ''}`}><span>{label}</span><span>{value}</span></div>
}
