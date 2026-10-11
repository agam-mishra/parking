import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { rupees } from '../../lib/format'
import { ErrorBox, Screen, Spinner, Stat, Tile } from '../../components/ui'

interface Dash {
  today_cash: number; today_upi: number; today_entries: number; inside_now: number
  khata_outstanding: number; passes_expiring: number; open_shifts: number
}

export default function AdminHome() {
  const { t } = useT()
  const nav = useNavigate()
  const { profile, tenant, selectTenant } = useAuth()
  const [d, setD] = useState<Dash | null>(null)
  const [error, setError] = useState<unknown>(null)
  const isSuper = profile?.role === 'super'

  useEffect(() => {
    if (tenant) rpc<Dash>('dashboard', { p_tenant: tenant.id }).then(setD).catch(setError)
  }, [tenant])

  return (
    <Screen
      title={tenant?.name ?? ''}
      back={false}
      right={isSuper ? (
        <button onClick={() => { selectTenant(null); nav('/') }} className="rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold">
          {t('tenants')}
        </button>
      ) : undefined}
    >
      <h2 className="text-lg font-bold text-slate-700">{t('dashboard')}</h2>
      <ErrorBox error={error} />
      {!d ? <Spinner /> : (
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t('todayCash')} value={rupees(d.today_cash)} tone="green" />
          <Stat label={t('todayUpi')} value={rupees(d.today_upi)} tone="blue" />
          <Stat label={t('todayEntries')} value={d.today_entries} />
          <Stat label={t('insideNow')} value={d.inside_now} />
          <Stat label={t('outstanding')} value={rupees(d.khata_outstanding)} tone={d.khata_outstanding > 0 ? 'red' : 'slate'} />
          <Stat label={t('expiringPasses')} value={d.passes_expiring} tone={d.passes_expiring > 0 ? 'amber' : 'slate'} />
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        {!isSuper && <Tile icon="🅿️" label={t('workerMode')} tone="green" onClick={() => nav('/desk')} />}
        <Tile icon="📋" label={t('insideNow')} tone="slate" onClick={() => nav('/inside')} />
        <Tile icon="👥" label={t('customers')} tone="purple" onClick={() => nav('/admin/customers')} />
        <Tile icon="₹" label={t('prices')} tone="blue" onClick={() => nav('/admin/prices')} />
        <Tile icon="⭐" label={t('vehiclePrices')} tone="amber" onClick={() => nav('/admin/vehicles')} />
        <Tile icon="🧾" label={t('payments')} tone="slate" onClick={() => nav('/admin/payments')} />
        <Tile icon="👷" label={t('workers')} tone="amber" onClick={() => nav('/admin/workers')} />
        <Tile icon="⚙️" label={t('settings')} tone="slate" onClick={() => nav('/admin/settings')} />
      </div>
      {!isSuper && (
        <button onClick={() => supabase.auth.signOut()} className="w-full py-4 text-lg font-semibold text-slate-500 underline">
          {t('logout')}
        </button>
      )}
    </Screen>
  )
}
