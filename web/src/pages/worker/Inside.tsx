import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, type PaymentType, type SessionPlan } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { fmtDuration } from '../../lib/format'
import { Card, Screen, Spinner } from '../../components/ui'

interface Row { id: string; plan: SessionPlan; entry_at: string; payment_type: PaymentType; reg_no: string }

export default function Inside({ tenantId }: { tenantId?: string }) {
  const { t, lang } = useT()
  const nav = useNavigate()
  const { tenant } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const tid = tenantId ?? tenant?.id

  useEffect(() => {
    if (!tid) return
    supabase.from('inside_vehicles')
      .select('id, plan, entry_at, payment_type, reg_no')
      .eq('tenant_id', tid).order('entry_at')
      .then(({ data }) => setRows(data ?? []))
  }, [tid])

  const now = new Date().toISOString()
  const hours = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3600000

  return (
    <Screen title={`${t('insideNow')} (${rows?.length ?? 0})`}>
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="text-center text-slate-500">{t('noData')}</div> : rows.map((r) => (
        <button key={r.id} className="block w-full text-left" onClick={() => nav('/out', { state: { reg: r.reg_no } })}>
          <Card className={`flex items-center justify-between ${hours(r.entry_at) > 24 ? 'border-2 border-red-400' : ''}`}>
            <div>
              <div className="font-mono text-xl font-bold">{r.reg_no}</div>
              <div className="text-slate-600">{t(r.plan)} · {t(r.payment_type)}</div>
            </div>
            <div className={`text-right font-bold ${hours(r.entry_at) > 24 ? 'text-red-700' : 'text-slate-700'}`}>
              {fmtDuration(r.entry_at, now, lang)}
            </div>
          </Card>
        </button>
      ))}
    </Screen>
  )
}
