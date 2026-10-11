import { useEffect, useState } from 'react'
import { rpc } from '../../lib/supabase'
import { useT } from '../../lib/i18n'
import { fmtTime, rupees } from '../../lib/format'
import { Banner, Button, ErrorBox, Field, Screen, Spinner, Stat } from '../../components/ui'

interface ShiftInfo { id: string; started_at: string; cash: number; upi: number; count: number }
interface Closed { cash: number; upi: number; count: number; cash_declared: number; difference: number }

export default function Shift() {
  const { t, lang } = useT()
  const [shift, setShift] = useState<ShiftInfo | null | undefined>(undefined)
  const [cash, setCash] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [closed, setClosed] = useState<Closed | null>(null)

  useEffect(() => { rpc<ShiftInfo | null>('my_shift').then(setShift).catch(setError) }, [])

  async function close() {
    setBusy(true)
    setError(null)
    try {
      setClosed(await rpc<Closed>('close_shift', { p_cash_declared: Number(cash) }))
    } catch (e) {
      setError(e)
    }
    setBusy(false)
  }

  if (closed) {
    const d = Number(closed.difference)
    return (
      <Screen title={t('myShift')} back="/">
        <Banner tone="green">✅ {t('shiftClosed')}</Banner>
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t('shiftCash')} value={rupees(closed.cash)} />
          <Stat label={t('shiftUpi')} value={rupees(closed.upi)} />
        </div>
        <Banner tone={d === 0 ? 'green' : 'red'}>
          {d === 0 ? `✅ ${t('cashMatch')}` : d < 0 ? `⚠️ ${t('cashShort')}: ${rupees(-d)}` : `⚠️ ${t('cashExtra')}: ${rupees(d)}`}
        </Banner>
      </Screen>
    )
  }

  return (
    <Screen title={t('myShift')} back="/">
      <ErrorBox error={error} />
      {shift === undefined ? <Spinner /> : shift === null ? (
        <Banner tone="blue">{t('noShift')}</Banner>
      ) : (
        <>
          <div className="text-slate-600">{t('shiftStarted')}: {fmtTime(shift.started_at, lang)}</div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t('shiftCash')} value={rupees(shift.cash)} tone="green" />
            <Stat label={t('shiftUpi')} value={rupees(shift.upi)} tone="blue" />
          </div>
          <Stat label={t('shiftCount')} value={shift.count} />
          <Field label={t('countCash')} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ''))} />
          <Button big tone="amber" disabled={busy || cash === ''} onClick={close}>🔒 {t('closeShift')}</Button>
        </>
      )}
    </Screen>
  )
}
