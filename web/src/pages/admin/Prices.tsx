import { useEffect, useState } from 'react'
import { supabase, type Plan } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { useRates } from '../../lib/useRates'
import { Banner, Button, Card, ErrorBox, Field, Screen } from '../../components/ui'

export const PLANS: Plan[] = ['day', 'night', 'full_day', 'weekly', 'monthly']

export default function Prices() {
  const { t, lang } = useT()
  const { tenant, vehicleTypes, profile, refreshTenant } = useAuth()
  const { rates, reload } = useRates()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const [newType, setNewType] = useState({ name_en: '', name_hi: '', icon: '🚙' })

  useEffect(() => {
    const d: Record<string, string> = {}
    for (const vt of vehicleTypes) for (const p of PLANS) d[`${vt.id}:${p}`] = rates[vt.id]?.[p]?.toString() ?? ''
    setDraft(d)
  }, [rates, vehicleTypes])

  async function save() {
    if (!tenant) return
    setBusy(true)
    setError(null)
    setSaved(false)
    const rows = Object.entries(draft).filter(([, v]) => v !== '').map(([k, v]) => {
      const [vehicle_type_id, plan] = k.split(':')
      return { tenant_id: tenant.id, vehicle_type_id, plan, amount: Number(v), updated_by: profile?.id, updated_at: new Date().toISOString() }
    })
    const { error } = await supabase.from('rates').upsert(rows, { onConflict: 'vehicle_type_id,plan' })
    if (error) setError(error)
    else { setSaved(true); reload() }
    setBusy(false)
  }

  async function addType() {
    if (!tenant) return
    const { error } = await supabase.from('vehicle_types').insert({ tenant_id: tenant.id, ...newType, sort: vehicleTypes.length + 1 })
    if (error) return setError(error)
    setNewType({ name_en: '', name_hi: '', icon: '🚙' })
    refreshTenant()
  }

  return (
    <Screen title={t('prices')}>
      <Card className="overflow-x-auto p-2">
        <table className="w-full text-left">
          <thead>
            <tr className="text-sm text-slate-500">
              <th className="p-1" />
              {PLANS.map((p) => <th key={p} className="p-1 text-center">{t(p)}</th>)}
            </tr>
          </thead>
          <tbody>
            {vehicleTypes.map((vt) => (
              <tr key={vt.id}>
                <td className="p-1 font-bold whitespace-nowrap">{vt.icon} {lang === 'hi' ? vt.name_hi : vt.name_en}</td>
                {PLANS.map((p) => (
                  <td key={p} className="p-1">
                    <input
                      inputMode="decimal"
                      value={draft[`${vt.id}:${p}`] ?? ''}
                      onChange={(e) => setDraft({ ...draft, [`${vt.id}:${p}`]: e.target.value.replace(/[^\d.]/g, '') })}
                      className="w-16 rounded-lg border-2 border-slate-300 px-1 py-2 text-center"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <ErrorBox error={error} />
      {saved && <Banner tone="green">✅ {t('saved')}</Banner>}
      <Button big disabled={busy} onClick={save}>{t('save')}</Button>

      <Card className="space-y-3">
        <div className="font-bold">+ {t('vehicleType')}</div>
        <div className="grid grid-cols-[4rem_1fr_1fr] gap-2">
          <Field label="🙂" value={newType.icon} onChange={(e) => setNewType({ ...newType, icon: e.target.value })} />
          <Field label="English" value={newType.name_en} onChange={(e) => setNewType({ ...newType, name_en: e.target.value })} />
          <Field label="हिंदी" value={newType.name_hi} onChange={(e) => setNewType({ ...newType, name_hi: e.target.value })} />
        </div>
        <Button tone="slate" disabled={!newType.name_en || !newType.name_hi} onClick={addType}>{t('save')}</Button>
      </Card>
    </Screen>
  )
}
