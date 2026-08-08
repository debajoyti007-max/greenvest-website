import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import SetupRequired, { shouldBlockApp } from './components/SetupRequired'
import { AuthProvider, useAuth } from './context/AuthContext'
import { StoreProvider } from './context/StoreContext'
import AdminUsers from './pages/admin/AdminUsers'
import Auth from './pages/Auth'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Contact from './pages/Contact'
import OrderSuccess from './pages/OrderSuccess'
import Orders from './pages/Orders'
import Privacy from './pages/Privacy'
import Refund from './pages/Refund'
import Shop from './pages/Shop'
import Terms from './pages/Terms'
import SellerHome from './pages/seller/SellerHome'
import SellerOrders from './pages/seller/SellerOrders'
import SellerProducts from './pages/seller/SellerProducts'
import SellerCustomers from './pages/seller/SellerCustomers'
import type { Role } from './types'

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
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Shop />} />
        <Route path="cart" element={<Cart />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/success/:id" element={<OrderSuccess />} />
        <Route path="auth" element={<Auth />} />
        <Route path="contact" element={<Contact />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="terms" element={<Terms />} />
        <Route path="refund" element={<Refund />} />
        <Route
          path="seller"
          element={
            <RequireRole roles={['seller', 'admin']}>
              <SellerHome />
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
          path="admin"
          element={
            <RequireRole roles={['admin']}>
              <AdminUsers />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
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
