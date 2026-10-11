import { useCallback, useEffect, useState } from 'react'
import { rpc, supabase, type PayMethod } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { fmtTime, rupees, todayISO } from '../../lib/format'
import { Card, ErrorBox, Field, Screen, Spinner } from '../../components/ui'
import { useDialog } from '../../components/Dialogs'

interface Row {
  id: string; kind: string; amount: number; method: PayMethod; upi_ref: string | null; created_at: string
  cancelled_at: string | null; cancel_reason: string | null
  collected_by_name: string | null; reg_no: string | null; customer_name: string | null
}

export default function Payments() {
  const { t, lang } = useT()
  const { tenant, profile } = useAuth()
  const [day, setDay] = useState(todayISO())
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const dialog = useDialog()

  const load = useCallback(async () => {
    if (!tenant) return
    const start = new Date(day + 'T00:00:00'), end = new Date(start)
    end.setDate(end.getDate() + 1)
    const { data, error } = await supabase.from('payment_list')
      .select('*')
      .eq('tenant_id', tenant.id).gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
      .order('created_at', { ascending: false })
    if (error) setError(error)
    setRows(data ?? [])
  }, [tenant, day])
  useEffect(() => { load() }, [load])

  async function cancel(r: Row) {
    const reason = await dialog.prompt({ title: `${t('cancelPaymentQ')} · ${rupees(r.amount)}`, label: t('note') })
    if (!reason) return
    try {
      await rpc('cancel_payment', { p_payment: r.id, p_reason: reason })
      load()
    } catch (e) {
      setError(e)
    }
  }

  const live = (rows ?? []).filter((r) => !r.cancelled_at)
  const sum = (m: PayMethod) => live.filter((r) => r.method === m).reduce((s, r) => s + Number(r.amount), 0)

  return (
    <Screen title={t('payments')}>
      <Field label="📅" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      <div className="grid grid-cols-2 gap-3 text-center">
        <Card><div className="text-sm text-slate-500">{t('cash')}</div><div className="text-2xl font-extrabold text-green-700">{rupees(sum('cash'))}</div></Card>
        <Card><div className="text-sm text-slate-500">{t('upi')}</div><div className="text-2xl font-extrabold text-blue-700">{rupees(sum('upi'))}</div></Card>
      </div>
      <ErrorBox error={error} />
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="text-center text-slate-500">{t('noData')}</div> : rows.map((r) => {
        const what = r.reg_no ?? r.customer_name ?? ''
        return (
          <Card key={r.id} className={`flex items-center justify-between gap-2 ${r.cancelled_at ? 'opacity-50' : ''}`}>
            <div className="min-w-0">
              <div className="font-mono font-bold">{what}</div>
              <div className="text-sm text-slate-600">
                {fmtTime(r.created_at, lang)} · {r.collected_by_name} · {t(r.method)}{r.upi_ref ? ` #${r.upi_ref}` : ''}
              </div>
              {r.cancelled_at && <div className="text-sm font-bold text-red-700">{t('cancelled')}: {r.cancel_reason}</div>}
            </div>
            <div className="text-right">
              <div className={`text-xl font-extrabold ${r.cancelled_at ? 'line-through' : ''}`}>{rupees(r.amount)}</div>
              {!r.cancelled_at && profile?.role === 'admin' && (
                <button onClick={() => cancel(r)} className="text-sm text-red-700 underline">{t('cancel')}</button>
              )}
            </div>
          </Card>
        )
      })}
    </Screen>
  )
}
