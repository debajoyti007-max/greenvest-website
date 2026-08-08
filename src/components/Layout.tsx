import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'

export default function Layout() {
  const { user, logout } = useAuth()
  const { cartCount, lang, setLang } = useStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden>
              🌿
            </span>
            <span className="brand-text">
              <strong>GreenVest</strong>
              <em>{lang === 'bn' ? 'তাজা সবজি' : 'Fresh groceries'}</em>
            </span>
          </Link>

          <nav className="nav-links" aria-label="Main">
            <NavLink to="/" end>
              {lang === 'bn' ? 'দোকান' : 'Shop'}
            </NavLink>
            <NavLink to="/cart">
              {lang === 'bn' ? 'কার্ট' : 'Cart'}
              {cartCount > 0 && <span className="badge">{cartCount}</span>}
            </NavLink>
            {user && (
              <NavLink to="/orders">{lang === 'bn' ? 'অর্ডার' : 'Orders'}</NavLink>
            )}
            {(user?.role === 'seller' || user?.role === 'admin') && (
              <NavLink to="/seller">{lang === 'bn' ? 'সেলার' : 'Seller'}</NavLink>
            )}
            {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className="lang-toggle"
              onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
              aria-label="Toggle language"
            >
              {lang === 'en' ? 'বাং' : 'EN'}
            </button>
            {user ? (
              <div className="user-chip">
                <span className="user-name">{user.name}</span>
                <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                  {lang === 'bn' ? 'লগআউট' : 'Logout'}
                </button>
              </div>
            ) : (
              <Link to="/auth" className="btn btn-primary">
                {lang === 'bn' ? 'লগইন' : 'Login'}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <p>
          <strong>GreenVest</strong> — {lang === 'bn' ? 'তাজা সবজি, সরাসরি আপনার ঘরে' : 'Fresh vegetables, delivered fresh'}
        </p>
      </footer>
    </div>
  )
}
