import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import SetupRequired from './components/SetupRequired'
import { shouldBlockApp } from './lib/runtime'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/useAuth'
import { StoreProvider } from './context/StoreContext'
import type { Role } from './types'

const Shop = lazy(() => import('./pages/Shop'))
const Cart = lazy(() => import('./pages/Cart'))
const Checkout = lazy(() => import('./pages/Checkout'))
const Orders = lazy(() => import('./pages/Orders'))
const OrderSuccess = lazy(() => import('./pages/OrderSuccess'))
const TrackOrder = lazy(() => import('./pages/TrackOrder'))
const Profile = lazy(() => import('./pages/Profile'))
const Auth = lazy(() => import('./pages/Auth'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Contact = lazy(() => import('./pages/Contact'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))
const SellerHome = lazy(() => import('./pages/seller/SellerHome'))
const SellerProducts = lazy(() => import('./pages/seller/SellerProducts'))
const SellerOrders = lazy(() => import('./pages/seller/SellerOrders'))
const SellerCustomers = lazy(() => import('./pages/seller/SellerCustomers'))
const SellerKhata = lazy(() => import('./pages/seller/SellerKhata'))
const SellerDeals = lazy(() => import('./pages/seller/SellerDeals'))
const RiderView = lazy(() => import('./pages/RiderView'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const Support = lazy(() => import('./pages/Support'))
const SellerSupport = lazy(() => import('./pages/seller/SellerSupport'))
const NotFound = lazy(() => import('./pages/NotFound'))

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="page">Loading…</p>
  if (!user) return <Navigate to="/auth" replace />
  if (!roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  if (shouldBlockApp()) {
    return (
      <Routes>
        <Route path="*" element={<SetupRequired />} />
      </Routes>
    )
  }

  return (
    <Suspense fallback={<div className="page narrow" style={{ textAlign: 'center', padding: '3rem 1rem' }}>Loading…</div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Shop />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="track" element={<TrackOrder />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/success/:id" element={<OrderSuccess />} />
          <Route path="profile" element={<Profile />} />
          <Route path="auth" element={<Auth />} />
          <Route path="auth/reset" element={<ResetPassword />} />
          <Route path="contact" element={<Contact />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="support" element={<Support />} />
          <Route path="refund" element={<Navigate to="/" replace />} />
          <Route
            path="seller"
            element={
              <RequireRole roles={['seller', 'admin']}>
                <SellerHome />
              </RequireRole>
            }
          />
          <Route
            path="seller/support"
            element={
              <RequireRole roles={['seller', 'admin']}>
                <SellerSupport />
              </RequireRole>
            }
          />
          <Route
            path="seller/products"
            element={
              <RequireRole roles={['seller', 'admin']}>
                <SellerProducts />
              </RequireRole>
            }
          />
          <Route
            path="seller/orders"
            element={
              <RequireRole roles={['seller', 'admin']}>
                <SellerOrders />
              </RequireRole>
            }
          />
          <Route
            path="seller/customers"
            element={
              <RequireRole roles={['seller', 'admin']}>
                <SellerCustomers />
              </RequireRole>
            }
          />
          <Route
            path="seller/khata"
            element={
              <RequireRole roles={['seller', 'admin']}>
                <SellerKhata />
              </RequireRole>
            }
          />
          <Route
            path="seller/deals"
            element={
              <RequireRole roles={['seller', 'admin']}>
                <SellerDeals />
              </RequireRole>
            }
          />
          <Route
            path="rider"
            element={
              <RequireRole roles={['rider', 'admin']}>
                <RiderView />
              </RequireRole>
            }
          />
          <Route
            path="admin"
            element={
              <RequireRole roles={['admin']}>
                <AdminUsers />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <BrowserRouter basename={routerBasename}>
          <AppRoutes />
        </BrowserRouter>
      </StoreProvider>
    </AuthProvider>
  )
}
