import { useCallback, useEffect, useState } from 'react'
import { supabase, type Tenant } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { manageUsers } from '../../lib/manageUsers'
import { Button, Card, ErrorBox, Field, Screen } from '../../components/ui'

export default function Tenants() {
  const { t } = useT()
  const { selectTenant } = useAuth()
  const [list, setList] = useState<Tenant[]>([])
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name: '', address: '', upi_id: '', admin_name: '', admin_phone: '', admin_pin: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('tenants').select('*').order('name')
    setList(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function toggle(x: Tenant) {
    const { error } = await supabase.from('tenants').update({ active: !x.active }).eq('id', x.id)
    if (error) setError(error)
    load()
  }

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const ins = await supabase.from('tenants').insert({ name: f.name.trim(), address: f.address || null, upi_id: f.upi_id || null }).select('id').single()
      if (ins.error) throw ins.error
      try {
        await manageUsers({ action: 'create', tenant_id: ins.data.id, role: 'admin', name: f.admin_name, phone: f.admin_phone, pin: f.admin_pin })
      } catch (e) {
        // Don't leave a site with no admin behind.
        await supabase.from('tenants').delete().eq('id', ins.data.id)
        throw e
      }
      setF({ name: '', address: '', upi_id: '', admin_name: '', admin_phone: '', admin_pin: '' })
      setAdding(false)
      load()
    } catch (e) {
      setError(e)
    }
    setBusy(false)
  }

  const ok = f.name.trim() && f.admin_name.trim() && f.admin_phone.length === 10 && f.admin_pin.length === 6

  return (
    <Screen title={t('tenants')} back={false}
      right={<button onClick={() => supabase.auth.signOut()} className="text-sm underline">{t('logout')}</button>}>
      {list.map((x) => (
        <Card key={x.id} className={`flex items-center justify-between gap-2 ${x.active ? '' : 'opacity-60'}`}>
          <div className="min-w-0">
            <div className="text-lg font-bold">{x.name}</div>
            <div className="truncate text-slate-600">{x.address}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => toggle(x)} className={`rounded-lg px-3 py-2 font-semibold ${x.active ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
              {x.active ? t('deactivate') : t('activate')}
            </button>
            <button onClick={() => selectTenant(x.id)} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">{t('open')} →</button>
          </div>
        </Card>
      ))}
      {adding ? (
        <Card className="space-y-3">
          <Field label={t('siteName')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Field label={t('address')} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          <Field label={t('upiId')} value={f.upi_id} onChange={(e) => setF({ ...f, upi_id: e.target.value.trim() })} />
          <Field label={t('adminName')} value={f.admin_name} onChange={(e) => setF({ ...f, admin_name: e.target.value })} />
          <Field label={t('adminPhone')} inputMode="numeric" maxLength={10} value={f.admin_phone}
            onChange={(e) => setF({ ...f, admin_phone: e.target.value.replace(/\D/g, '') })} />
          <Field label={t('adminPin')} inputMode="numeric" maxLength={6} value={f.admin_pin}
            onChange={(e) => setF({ ...f, admin_pin: e.target.value.replace(/\D/g, '') })} />
          <ErrorBox error={error} />
          <Button disabled={!ok || busy} onClick={create}>{t('save')}</Button>
          <Button tone="slate" onClick={() => setAdding(false)}>{t('cancel')}</Button>
        </Card>
      ) : (
        <Button big onClick={() => setAdding(true)}>+ {t('addTenant')}</Button>
      )}
    </Screen>
  )
}
