import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import SetupRequired from './components/SetupRequired'
import { shouldBlockApp } from './lib/runtime'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/useAuth'
import { StoreProvider } from './context/StoreContext'
import type { Role } from './types'

// Resilient lazy import with automatic retry on chunk loading errors (e.g. after new deployments)
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (error) {
      if (typeof window !== 'undefined') {
        const storageKey = 'gv_chunk_retry_' + window.location.pathname
        const hasRetried = window.sessionStorage.getItem(storageKey)
        if (!hasRetried) {
          window.sessionStorage.setItem(storageKey, '1')
          window.location.reload()
          return new Promise<{ default: T }>(() => {})
        }
      }
      throw error
    }
  })
}

const Shop = lazyWithRetry(() => import('./pages/Shop'))
const Cart = lazyWithRetry(() => import('./pages/Cart'))
const Checkout = lazyWithRetry(() => import('./pages/Checkout'))
const Orders = lazyWithRetry(() => import('./pages/Orders'))
const OrderSuccess = lazyWithRetry(() => import('./pages/OrderSuccess'))
const TrackOrder = lazyWithRetry(() => import('./pages/TrackOrder'))
const Profile = lazyWithRetry(() => import('./pages/Profile'))
const Auth = lazyWithRetry(() => import('./pages/Auth'))
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'))
const Contact = lazyWithRetry(() => import('./pages/Contact'))
const Privacy = lazyWithRetry(() => import('./pages/Privacy'))
const Terms = lazyWithRetry(() => import('./pages/Terms'))
const SellerHome = lazyWithRetry(() => import('./pages/seller/SellerHome'))
const SellerProducts = lazyWithRetry(() => import('./pages/seller/SellerProducts'))
const SellerOrders = lazyWithRetry(() => import('./pages/seller/SellerOrders'))
const SellerCustomers = lazyWithRetry(() => import('./pages/seller/SellerCustomers'))
const SellerDeals = lazyWithRetry(() => import('./pages/seller/SellerDeals'))
const RiderView = lazyWithRetry(() => import('./pages/RiderView'))
const AdminUsers = lazyWithRetry(() => import('./pages/admin/AdminUsers'))
const Support = lazyWithRetry(() => import('./pages/Support'))
const SellerSupport = lazyWithRetry(() => import('./pages/seller/SellerSupport'))
const NotFound = lazyWithRetry(() => import('./pages/NotFound'))

import PageSkeleton from './components/PageSkeleton'

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading && !user) return <PageSkeleton />
  if (!user) return <Navigate to="/auth" replace />
  if (!roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
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
    <Suspense fallback={<PageSkeleton />}>
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
          <Route path="shop" element={<Navigate to="/" replace />} />
          <Route path="track-order" element={<Navigate to="/track" replace />} />
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
