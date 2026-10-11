import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, type PaymentType } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { rupees } from '../../lib/format'
import { Card, Choice, Screen, Spinner } from '../../components/ui'

interface Row { customer_id: string; name: string; phone: string; payment_type: PaymentType; credit_limit: number | null; balance: number }

export default function Customers() {
  const { t } = useT()
  const nav = useNavigate()
  const { tenant } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'due'>('due')

  useEffect(() => {
    if (!tenant) return
    supabase.from('customer_balances').select('*').eq('tenant_id', tenant.id)
      .order('balance', { ascending: false }).order('name')
      .then(({ data }) => setRows(data ?? []))
  }, [tenant])

  const shown = (rows ?? [])
    .filter((r) => filter === 'all' || Number(r.balance) > 0)
    .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.phone.includes(q))

  return (
    <Screen title={t('customers')}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`🔍 ${t('name')} / ${t('phone')}`}
        className="w-full rounded-xl border-2 border-slate-300 px-4 py-3 text-lg" />
      <Choice cols={2} value={filter} onChange={setFilter}
        options={[{ value: 'due', label: `📒 ${t('balance')}` }, { value: 'all', label: t('all') }]} />
      {!rows ? <Spinner /> : shown.length === 0 ? <div className="text-center text-slate-500">{t('noData')}</div> : shown.map((r) => (
        <button key={r.customer_id} className="block w-full text-left" onClick={() => nav(`/admin/customers/${r.customer_id}`)}>
          <Card className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold">{r.name}</div>
              <div className="text-slate-600">{r.phone} · {t(r.payment_type)}</div>
            </div>
            <div className={`text-xl font-extrabold ${Number(r.balance) > 0 ? 'text-red-700' : 'text-slate-400'}`}>
              {rupees(r.balance)}
              {r.credit_limit != null && Number(r.balance) >= Number(r.credit_limit) && <div className="text-xs">⚠️ {t('creditLimit')}</div>}
            </div>
          </Card>
        </button>
      ))}
    </Screen>
  )
}
