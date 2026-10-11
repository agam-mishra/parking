import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// VITE_DEMO builds run entirely in the browser (see src/demo) and need no server.
export const DEMO = import.meta.env.VITE_DEMO === '1'

// The env check is repeated inline (not via DEMO) so normal builds drop the demo code entirely.
export const supabase: SupabaseClient = import.meta.env.VITE_DEMO === '1'
  ? ((await import('../demo/client')).demoClient as unknown as SupabaseClient)
  : createClient(
    import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  )

// Staff log in with phone + PIN; Supabase Auth sees a synthetic email.
export const phoneToEmail = (phone: string) => `${phone.replace(/\D/g, '').slice(-10)}@phone.local`

export type Role = 'super' | 'admin' | 'worker'
export type Plan = 'day' | 'night' | 'full_day' | 'weekly' | 'monthly'
export type SessionPlan = 'day' | 'night' | 'full_day' | 'pass'
export type PaymentType = 'entry' | 'exit' | 'weekly_khata' | 'monthly_khata'
export type PayMethod = 'cash' | 'upi'

export interface Profile {
  id: string
  tenant_id: string | null
  role: Role
  name: string
  phone: string
  active: boolean
}

export interface Tenant {
  id: string
  name: string
  address: string | null
  phone: string | null
  upi_id: string | null
  timezone: string
  day_start: string
  night_start: string
  grace_minutes: number
  walkin_pay_day: PaymentType
  walkin_pay_night: PaymentType
  walkin_pay_full_day: PaymentType
  active: boolean
}

export interface VehicleType {
  id: string
  tenant_id: string
  name_en: string
  name_hi: string
  icon: string
  sort: number
  active: boolean
}

export interface Customer {
  id: string
  tenant_id: string
  name: string
  phone: string
  id_type: 'none' | 'aadhaar' | 'driving_licence' | 'voter_id' | 'other'
  id_number: string | null
  payment_type: PaymentType
  credit_limit: number | null
  notes: string | null
  active: boolean
  balance?: number
}

export interface Lookup {
  found: boolean
  reg_no?: string
  vehicle?: { id: string; reg_no: string; vehicle_type_id: string; customer_id: string | null }
  customer?: Customer & { balance: number }
  pass?: { id: string; plan: Plan; start_date: string; end_date: string } | null
  next_pass_start?: string | null
  session?: { id: string; plan: SessionPlan; entry_at: string; base_amount: number; payment_type: PaymentType } | null
  prices?: Partial<Record<Plan, { amount: number; source: string }>>
  pay_day?: PaymentType
  pay_night?: PaymentType
  pay_full_day?: PaymentType
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}
