import { useCallback, useEffect, useState } from 'react'
import { supabase, type Plan } from './supabase'
import { useAuth } from './auth'

export type RateGrid = Record<string, Partial<Record<Plan, number>>>

// Standard price grid for the current site: vehicle_type_id → plan → amount.
export function useRates(tenantId?: string | null) {
  const { tenant } = useAuth()
  const tid = tenantId ?? tenant?.id
  const [rates, setRates] = useState<RateGrid>({})
  const reload = useCallback(async () => {
    if (!tid) return
    const { data } = await supabase.from('rates').select('vehicle_type_id, plan, amount').eq('tenant_id', tid)
    const grid: RateGrid = {}
    for (const r of data ?? []) (grid[r.vehicle_type_id] ??= {})[r.plan as Plan] = Number(r.amount)
    setRates(grid)
  }, [tid])
  useEffect(() => { reload() }, [reload])
  return { rates, reload }
}
