import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { Screen, Tile } from '../../components/ui'

export default function WorkerHome() {
  const nav = useNavigate()
  const { t } = useT()
  const { profile, tenant } = useAuth()
  return (
    <Screen title={tenant?.name ?? t('appName')} back={profile?.role === 'admin' ? '/admin' : false}>
      <div className="text-lg text-slate-600">🙏 {profile?.name}</div>
      <div className="grid grid-cols-2 gap-3">
        <Tile icon="🟢" label={t('vehicleIn')} tone="green" onClick={() => nav('/in')} />
        <Tile icon="🔴" label={t('vehicleOut')} tone="red" onClick={() => nav('/out')} />
        <Tile icon="📅" label={t('newPass')} tone="purple" onClick={() => nav('/pass')} />
        <Tile icon="🔍" label={t('checkVehicle')} tone="blue" onClick={() => nav('/check')} />
        <Tile icon="📋" label={t('insideNow')} tone="slate" onClick={() => nav('/inside')} />
        <Tile icon="💰" label={t('myShift')} tone="amber" onClick={() => nav('/shift')} />
      </div>
      <button onClick={() => supabase.auth.signOut()} className="w-full py-4 text-lg font-semibold text-slate-500 underline">
        {t('logout')}
      </button>
    </Screen>
  )
}
