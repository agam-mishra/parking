import { useEffect, useState } from 'react'
import { supabase, type PaymentType, type Tenant } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { Banner, Button, Card, Choice, ErrorBox, Field, Label, Screen } from '../../components/ui'

type WalkinKey = 'walkin_pay_day' | 'walkin_pay_night' | 'walkin_pay_full_day'

export default function Settings() {
  const { t } = useT()
  const { tenant, refreshTenant } = useAuth()
  const [f, setF] = useState<Tenant | null>(tenant)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => setF(tenant), [tenant])
  if (!f) return null

  const set = <K extends keyof Tenant>(k: K, v: Tenant[K]) => { setF({ ...f, [k]: v }); setSaved(false) }

  async function save() {
    setError(null)
    const { id, name, address, phone, upi_id, day_start, night_start, grace_minutes, walkin_pay_day, walkin_pay_night, walkin_pay_full_day } = f!
    const { error } = await supabase.from('tenants').update({
      name, address, phone, upi_id, day_start, night_start, grace_minutes: Number(grace_minutes),
      walkin_pay_day, walkin_pay_night, walkin_pay_full_day,
    }).eq('id', id)
    if (error) return setError(error)
    setSaved(true)
    refreshTenant()
  }

  return (
    <Screen title={t('settings')}>
      <Card className="space-y-3">
        <Field label={t('siteName')} value={f.name} onChange={(e) => set('name', e.target.value)} />
        <Field label={t('address')} value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        <Field label={t('phone')} inputMode="numeric" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        <Field label={t('upiId')} value={f.upi_id ?? ''} onChange={(e) => set('upi_id', e.target.value.trim())} />
      </Card>
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label={`☀️ ${t('dayStarts')}`} type="time" value={f.day_start.slice(0, 5)} onChange={(e) => set('day_start', e.target.value)} />
          <Field label={`🌙 ${t('nightStarts')}`} type="time" value={f.night_start.slice(0, 5)} onChange={(e) => set('night_start', e.target.value)} />
        </div>
        <Field label={t('graceMinutes')} inputMode="numeric" value={String(f.grace_minutes)}
          onChange={(e) => set('grace_minutes', Number(e.target.value.replace(/\D/g, '')))} />
      </Card>
      <Card className="space-y-3">
        <Label k="walkinPay" />
        {(['walkin_pay_day', 'walkin_pay_night', 'walkin_pay_full_day'] as WalkinKey[]).map((k) => (
          <div key={k}>
            <div className="mb-1 font-semibold">{t(k === 'walkin_pay_day' ? 'day' : k === 'walkin_pay_night' ? 'night' : 'full_day')}</div>
            <Choice<PaymentType> cols={2} value={f[k]} onChange={(v) => set(k, v)}
              options={[{ value: 'entry', label: t('entry') }, { value: 'exit', label: t('exit') }]} />
          </div>
        ))}
      </Card>
      <ErrorBox error={error} />
      {saved && <Banner tone="green">✅ {t('saved')}</Banner>}
      <Button big onClick={save}>{t('save')}</Button>
    </Screen>
  )
}
