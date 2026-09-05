import { NavLink, useLocation } from 'react-router-dom'
import { useStore } from '../context/useStore'
import { useAuth } from '../context/useAuth'

export default function BottomNav() {
  const { cartCount, lang } = useStore()
  const { user } = useAuth()
  const location = useLocation()

  const path = location.pathname
  if (
    path.startsWith('/seller') ||
    path.startsWith('/admin') ||
    path.startsWith('/rider') ||
    path.startsWith('/auth')
  ) {
    return null
  }

  const isActive = (href: string, exact = false) =>
    exact ? path === href : path.startsWith(href)

  return (
    <nav className="mobile-bottom-nav" aria-label="Bottom navigation">
      <NavLink to="/" end className={`bottom-nav-item${isActive('/', true) ? ' active' : ''}`}>
        <span className="bottom-nav-icon">🏠</span>
        <span>{lang === 'bn' ? 'হোম' : 'Shop'}</span>
      </NavLink>

      <NavLink to="/cart" className={`bottom-nav-item${isActive('/cart') ? ' active' : ''}`}>
        <span className="bottom-nav-icon">🛒</span>
        {cartCount > 0 && (
          <span className="bottom-nav-badge">{cartCount > 9 ? '9+' : cartCount}</span>
        )}
        <span>{lang === 'bn' ? 'কার্ট' : 'Cart'}</span>
      </NavLink>

      {user && (
        <NavLink to="/orders" className={`bottom-nav-item${isActive('/orders') ? ' active' : ''}`}>
          <span className="bottom-nav-icon">📦</span>
          <span>{lang === 'bn' ? 'অর্ডার' : 'Orders'}</span>
        </NavLink>
      )}

      <NavLink to="/track" className={`bottom-nav-item${isActive('/track') ? ' active' : ''}`}>
        <span className="bottom-nav-icon">📍</span>
        <span>{lang === 'bn' ? 'ট্র্যাক' : 'Track'}</span>
      </NavLink>

      <NavLink
        to={user ? '/profile' : '/auth'}
        className={`bottom-nav-item${isActive('/profile') || isActive('/auth') ? ' active' : ''}`}
      >
        <span className="bottom-nav-icon">{user ? '👤' : '🔑'}</span>
        <span>{user ? (lang === 'bn' ? 'প্রোফাইল' : 'Profile') : (lang === 'bn' ? 'লগইন' : 'Login')}</span>
      </NavLink>
    </nav>
  )
}
