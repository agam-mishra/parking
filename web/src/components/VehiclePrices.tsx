import { useCallback, useEffect, useState } from 'react'
import { supabase, type Plan } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { useRates } from '../lib/useRates'
import { rupees } from '../lib/format'
import { Banner, Button, ErrorBox } from './ui'

const PLANS: Plan[] = ['day', 'night', 'full_day', 'weekly', 'monthly']

// Admin: set this vehicle's own price per plan. Empty = falls back to the customer's
// special price, then the standard rate (shown as the placeholder).
export function VehiclePrices({ vehicleId, vehicleTypeId, customerId }: {
  vehicleId: string; vehicleTypeId: string; customerId: string | null
}) {
  const { t } = useT()
  const { tenant, profile } = useAuth()
  const { rates } = useRates()
  const [own, setOwn] = useState<Record<string, string>>({})
  const [customerRates, setCustomerRates] = useState<Record<string, number>>({})
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const [v, c] = await Promise.all([
      supabase.from('special_rates').select('plan, amount').eq('vehicle_id', vehicleId),
      customerId
        ? supabase.from('special_rates').select('plan, amount').eq('customer_id', customerId)
        : Promise.resolve({ data: [] as { plan: string; amount: number }[] }),
    ])
    setOwn(Object.fromEntries((v.data ?? []).map((r) => [r.plan, String(r.amount)])))
    setCustomerRates(Object.fromEntries((c.data ?? []).map((r) => [r.plan, Number(r.amount)])))
  }, [vehicleId, customerId])
  useEffect(() => { load() }, [load])

  const fallback = (p: Plan) => customerRates[p] ?? rates[vehicleTypeId]?.[p]

  async function save() {
    if (!tenant) return
    setError(null)
    setSaved(false)
    const del = await supabase.from('special_rates').delete().eq('vehicle_id', vehicleId)
    if (del.error) return setError(del.error)
    const rows = Object.entries(own).filter(([, v]) => v !== '')
      .map(([plan, v]) => ({ tenant_id: tenant.id, vehicle_id: vehicleId, plan: plan as Plan, amount: Number(v), set_by: profile?.id }))
    if (rows.length) {
      const ins = await supabase.from('special_rates').insert(rows)
      if (ins.error) return setError(ins.error)
    }
    setSaved(true)
    load()
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-1">
        {PLANS.map((p) => (
          <label key={p} className="text-center text-sm font-semibold">
            {t(p)}
            <input
              inputMode="decimal"
              placeholder={fallback(p) !== undefined ? String(fallback(p)) : '—'}
              value={own[p] ?? ''}
              onChange={(e) => { setOwn({ ...own, [p]: e.target.value.replace(/[^\d.]/g, '') }); setSaved(false) }}
              className={`mt-1 w-full rounded-lg border-2 px-1 py-2 text-center text-lg ${own[p] ? 'border-amber-500 bg-amber-50 font-bold' : 'border-slate-300'}`}
            />
            {own[p] && fallback(p) !== undefined && (
              <span className="block text-xs font-normal text-slate-500 line-through">{rupees(fallback(p))}</span>
            )}
          </label>
        ))}
      </div>
      <p className="text-sm text-slate-600">{t('vehiclePriceHint')}</p>
      <ErrorBox error={error} />
      {saved && <Banner tone="green">✅ {t('saved')}</Banner>}
      <Button tone="amber" onClick={save}>⭐ {t('save')}</Button>
    </div>
  )
}
