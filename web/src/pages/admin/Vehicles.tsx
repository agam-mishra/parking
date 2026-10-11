import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc, type Lookup } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { Banner, Card, Label, Screen } from '../../components/ui'
import { RegPlate, VehicleSearch } from '../../components/VehicleSearch'
import { VehiclePrices } from '../../components/VehiclePrices'

// Admin: find any vehicle (registered or walk-in) and give it its own price.
export default function Vehicles() {
  const { t, lang } = useT()
  const nav = useNavigate()
  const { vehicleTypes } = useAuth()
  const [lk, setLk] = useState<Lookup | null>(null)

  if (!lk) {
    return (
      <Screen title={t('vehiclePrices')}>
        <VehicleSearch mode="any" onResult={setLk} />
      </Screen>
    )
  }

  const vt = vehicleTypes.find((v) => v.id === lk.vehicle?.vehicle_type_id)
  return (
    <Screen title={t('vehiclePrices')}>
      <div className="flex items-center justify-between">
        <RegPlate reg={lk.vehicle?.reg_no ?? lk.reg_no ?? ''} big />
        <button onClick={() => setLk(null)} className="rounded-lg border-2 border-slate-300 bg-white px-3 py-2 font-semibold">🔍 {t('search')}</button>
      </div>
      {!lk.found || !lk.vehicle ? (
        <Banner tone="blue">{t('vehicleNotSeen')}</Banner>
      ) : (
        <>
          <Card>
            <div className="text-lg font-bold">{vt?.icon} {lang === 'hi' ? vt?.name_hi : vt?.name_en}</div>
            {lk.customer ? (
              <button onClick={() => nav(`/admin/customers/${lk.customer!.id}`)} className="text-blue-700 underline">
                👤 {lk.customer.name} · {lk.customer.phone}
              </button>
            ) : <div className="text-slate-600">{t('walkIn')}</div>}
          </Card>
          <Card>
            <Label k="vehiclePrice" />
            <VehiclePrices
              key={lk.vehicle.id}
              vehicleId={lk.vehicle.id}
              vehicleTypeId={lk.vehicle.vehicle_type_id}
              customerId={lk.vehicle.customer_id}
            />
          </Card>
          <button className="w-full py-2 text-slate-600 underline"
            onClick={async () => setLk(await rpc<Lookup>('lookup_vehicle', { p_reg: lk.vehicle!.reg_no }))}>
            ↻ {t('refreshPrices')}
          </button>
          {lk.prices && (
            <Card className="text-sm">
              <div className="mb-1 font-semibold text-slate-600">{t('pricesNow')}</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(lk.prices).map(([p, v]) => (
                  <span key={p} className={`rounded-lg px-2 py-1 ${v!.source.startsWith('special') ? 'bg-amber-100 font-bold' : 'bg-slate-100'}`}>
                    {v!.source.startsWith('special') && '⭐ '}{t(p as 'day')}: ₹{Number(v!.amount)}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </Screen>
  )
}
