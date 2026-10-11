import { useCallback, useEffect, useState } from 'react'
import { supabase, type Profile } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { manageUsers } from '../../lib/manageUsers'
import { Button, Card, Choice, ErrorBox, Field, Screen } from '../../components/ui'
import { useDialog } from '../../components/Dialogs'

export default function Workers() {
  const { t } = useT()
  const { tenant, profile } = useAuth()
  const [list, setList] = useState<Profile[]>([])
  const [form, setForm] = useState({ name: '', phone: '', pin: '', role: 'worker' as 'worker' | 'admin' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const isSuper = profile?.role === 'super'
  const dialog = useDialog()

  const load = useCallback(async () => {
    if (!tenant) return
    const { data } = await supabase.from('profiles').select('*').eq('tenant_id', tenant.id).order('role').order('name')
    setList(data ?? [])
  }, [tenant])
  useEffect(() => { load() }, [load])

  async function run(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      await manageUsers(body)
      await load()
      return true
    } catch (e) {
      setError(e)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    if (await run({ action: 'create', tenant_id: tenant!.id, ...form })) setForm({ name: '', phone: '', pin: '', role: 'worker' })
  }

  async function resetPin(p: Profile) {
    const pin = await dialog.prompt({ title: `${t('resetPin')} — ${p.name}`, label: t('pin'), numeric: true, maxLength: 6, pattern: /^\d{6}$/ })
    if (pin) run({ action: 'update', user_id: p.id, pin })
  }

  return (
    <Screen title={t('workers')}>
      {list.map((p) => {
        const canEdit = isSuper || (p.role === 'worker' && p.id !== profile?.id)
        return (
          <Card key={p.id} className={`space-y-2 ${p.active ? '' : 'opacity-60'}`}>
            <div className="flex justify-between">
              <div>
                <div className="text-lg font-bold">{p.name}</div>
                <div className="text-slate-600">{p.phone} · {t(p.role === 'admin' ? 'admin' : 'worker')}</div>
              </div>
              {!p.active && <span className="font-bold text-red-700">{t('deactivate')}</span>}
            </div>
            {canEdit && (
              <div className="grid grid-cols-2 gap-2">
                <Button tone="slate" disabled={busy} onClick={() => resetPin(p)}>🔑 {t('resetPin')}</Button>
                <Button tone={p.active ? 'red' : 'green'} disabled={busy}
                  onClick={() => run({ action: 'update', user_id: p.id, active: !p.active })}>
                  {p.active ? t('deactivate') : t('activate')}
                </Button>
              </div>
            )}
          </Card>
        )
      })}

      <Card className="space-y-3">
        <div className="text-lg font-bold">+ {t('addWorker')}</div>
        {isSuper && (
          <Choice cols={2} value={form.role} onChange={(role) => setForm({ ...form, role })}
            options={[{ value: 'worker', label: t('worker') }, { value: 'admin', label: t('admin') }]} />
        )}
        <Field label={t('name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field label={t('phone')} inputMode="numeric" maxLength={10} value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} />
        <Field label={t('pin')} inputMode="numeric" maxLength={6} value={form.pin}
          onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} />
        <ErrorBox error={error} />
        <Button disabled={busy || !form.name.trim() || form.phone.length !== 10 || form.pin.length !== 6} onClick={add}>{t('save')}</Button>
      </Card>
    </Screen>
  )
}
