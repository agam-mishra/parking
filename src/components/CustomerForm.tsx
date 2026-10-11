import { useState } from 'react'
import { supabase, type Customer } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { failure } from '../lib/feedback'
import { ActionBar, Button, Choice, ErrorBox, Field, Label } from './ui'

type IdType = Customer['id_type']

// Register a driver (or reuse the existing one with the same phone) and attach the vehicle.
export function CustomerForm({ reg, vehicleId, typeId, onSaved }: {
  reg: string; vehicleId?: string; typeId: string | null; onSaved: () => void
}) {
  const { t } = useT()
  const { tenant } = useAuth()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [idType, setIdType] = useState<IdType>('aadhaar')
  const [idNumber, setIdNumber] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const idOk = idType === 'none' || (idType === 'aadhaar' ? /^\d{4}$/.test(idNumber) : idNumber.trim().length >= 4)
  const ok = name.trim().length >= 2 && phone.length === 10 && idOk && consent && (vehicleId || typeId)

  async function save() {
    if (!tenant) return
    setBusy(true)
    setError(null)
    try {
      const existing = await supabase.from('customers').select('id').eq('tenant_id', tenant.id).eq('phone', phone).maybeSingle()
      let customerId = existing.data?.id as string | undefined
      if (!customerId) {
        const ins = await supabase.from('customers').insert({
          tenant_id: tenant.id, name: name.trim(), phone, id_type: idType,
          id_number: idType === 'none' ? null : idNumber.trim(), consent_at: new Date().toISOString(),
        }).select('id').single()
        if (ins.error) throw ins.error
        customerId = ins.data.id
      }
      const v = vehicleId
        ? await supabase.from('vehicles').update({ customer_id: customerId }).eq('id', vehicleId)
        : await supabase.from('vehicles').insert({ tenant_id: tenant.id, reg_no: reg, vehicle_type_id: typeId, customer_id: customerId })
      if (v.error) throw v.error
      onSaved()
    } catch (e) {
      failure()
      setError(e)
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <Field label={t('driverName')} value={name} onChange={(e) => setName(e.target.value)} />
      <Field label={t('driverPhone')} inputMode="numeric" maxLength={10} value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
      <div>
        <Label k="idProof" />
        <Choice<IdType>
          value={idType}
          onChange={(v) => { setIdType(v); setIdNumber('') }}
          options={(['aadhaar', 'driving_licence', 'voter_id', 'other', 'none'] as IdType[]).map((v) => ({ value: v, label: t(v) }))}
        />
      </div>
      {idType !== 'none' && (
        <Field
          label={idType === 'aadhaar' ? t('aadhaarLast4') : t('idNumber')}
          inputMode={idType === 'aadhaar' ? 'numeric' : 'text'}
          maxLength={idType === 'aadhaar' ? 4 : 20}
          value={idNumber}
          onChange={(e) => setIdNumber(idType === 'aadhaar' ? e.target.value.replace(/\D/g, '') : e.target.value.toUpperCase())}
        />
      )}
      <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-lg">
        <input type="checkbox" className="mt-1 h-6 w-6" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{t('consent')}</span>
      </label>
      <ErrorBox error={error} />
      <ActionBar>
        <Button big tone="purple" disabled={!ok || busy} onClick={save}>{busy ? t('loading') : `✔ ${t('save')}`}</Button>
      </ActionBar>
    </div>
  )
}
