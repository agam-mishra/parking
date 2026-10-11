import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile, type Tenant, type VehicleType } from './supabase'

interface AuthState {
  session: Session | null
  profile: Profile | null
  tenant: Tenant | null
  vehicleTypes: VehicleType[]
  loading: boolean
  refreshTenant: () => Promise<void>
  // Super user: which site they are looking at (null = all sites list).
  selectTenant: (id: string | null) => Promise<void>
}

const AuthCtx = createContext<AuthState>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([])
  const [loading, setLoading] = useState(true)
  const [viewTenantId, setViewTenantId] = useState<string | null>(null)

  const loadTenant = useCallback(async (tenantId: string | null) => {
    if (!tenantId) {
      setTenant(null)
      setVehicleTypes([])
      return
    }
    const [t, vt] = await Promise.all([
      supabase.from('tenants').select('*').eq('id', tenantId).single(),
      supabase.from('vehicle_types').select('*').eq('tenant_id', tenantId).eq('active', true).order('sort'),
    ])
    setTenant(t.data)
    setVehicleTypes(vt.data ?? [])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setTenant(null)
      setLoading(false)
      return
    }
    setLoading(true)
    supabase.from('profiles').select('*').eq('id', userId).single().then(async ({ data }) => {
      setProfile(data)
      await loadTenant(data?.tenant_id ?? null)
      setLoading(false)
    })
  }, [userId, loadTenant])

  const tenantId = profile?.role === 'super' ? viewTenantId : profile?.tenant_id ?? null
  const refreshTenant = useCallback(() => loadTenant(tenantId), [loadTenant, tenantId])
  const selectTenant = useCallback(async (id: string | null) => {
    setViewTenantId(id)
    await loadTenant(id)
  }, [loadTenant])

  return (
    <AuthCtx.Provider value={{ session, profile, tenant, vehicleTypes, loading, refreshTenant, selectTenant }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
