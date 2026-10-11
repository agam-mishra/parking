import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { LangProvider } from './lib/i18n'
import { Spinner } from './components/ui'
import { DialogProvider } from './components/Dialogs'
import Login from './pages/Login'
import WorkerHome from './pages/worker/Home'
import VehicleIn from './pages/worker/VehicleIn'
import VehicleOut from './pages/worker/VehicleOut'
import Pass from './pages/worker/Pass'
import Check from './pages/worker/Check'
import Shift from './pages/worker/Shift'
import Inside from './pages/worker/Inside'
import AdminHome from './pages/admin/AdminHome'
import Prices from './pages/admin/Prices'
import Customers from './pages/admin/Customers'
import CustomerDetail from './pages/admin/CustomerDetail'
import Workers from './pages/admin/Workers'
import Payments from './pages/admin/Payments'
import Settings from './pages/admin/Settings'
import Tenants from './pages/super/Tenants'
import Vehicles from './pages/admin/Vehicles'

function AppRoutes() {
  const { session, profile, tenant, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session || !profile) return <Login />

  // Super user picks a site first, then sees that site's admin screens.
  if (profile.role === 'super' && !tenant) return <Tenants />

  const admin = profile.role !== 'worker'
  const desk = profile.role !== 'super'
  return (
    <Routes>
      <Route path="/" element={admin ? <Navigate to="/admin" replace /> : <WorkerHome />} />
      {desk && (
        <>
          <Route path="/desk" element={<WorkerHome />} />
          <Route path="/in" element={<VehicleIn />} />
          <Route path="/out" element={<VehicleOut />} />
          <Route path="/pass" element={<Pass />} />
          <Route path="/check" element={<Check />} />
          <Route path="/shift" element={<Shift />} />
        </>
      )}
      <Route path="/inside" element={<Inside />} />
      {admin && (
        <>
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/admin/prices" element={<Prices />} />
          <Route path="/admin/customers" element={<Customers />} />
          <Route path="/admin/customers/:id" element={<CustomerDetail />} />
          <Route path="/admin/workers" element={<Workers />} />
          <Route path="/admin/vehicles" element={<Vehicles />} />
          <Route path="/admin/payments" element={<Payments />} />
          <Route path="/admin/settings" element={<Settings />} />
        </>
      )}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <DialogProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
            <AppRoutes />
          </BrowserRouter>
        </DialogProvider>
      </AuthProvider>
    </LangProvider>
  )
}
