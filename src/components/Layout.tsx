import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import ConfigBanner from './ConfigBanner'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { t } from '../lib/i18n'

export default function Layout() {
  const { user, logout } = useAuth()
  const { cartCount, lang, setLang } = useStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    void logout().then(() => {
      setMenuOpen(false)
      navigate('/')
    })
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="app-shell">
      <ConfigBanner />
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand" onClick={closeMenu}>
            <span className="brand-mark" aria-hidden>
              🌿
            </span>
            <span className="brand-text">
              <strong>GreenVest</strong>
              <em>{t(lang, 'freshTag')}</em>
            </span>
          </Link>

          <button
            type="button"
            className="nav-toggle"
            aria-expanded={menuOpen}
            aria-label={t(lang, 'menu')}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>

          <nav className={`nav-links ${menuOpen ? 'open' : ''}`} aria-label="Main">
            <NavLink to="/" end onClick={closeMenu}>
              {t(lang, 'shop')}
            </NavLink>
            <NavLink to="/cart" onClick={closeMenu}>
              {t(lang, 'cart')}
              {cartCount > 0 && <span className="badge">{cartCount}</span>}
            </NavLink>
            {user && (
              <NavLink to="/orders" onClick={closeMenu}>
                {t(lang, 'orders')}
              </NavLink>
            )}
            {(user?.role === 'seller' || user?.role === 'admin') && (
              <NavLink to="/seller" onClick={closeMenu}>
                {t(lang, 'seller')}
              </NavLink>
            )}
            {user?.role === 'admin' && (
              <NavLink to="/admin" onClick={closeMenu}>
                {t(lang, 'admin')}
              </NavLink>
            )}
          </nav>

          <div className="header-actions">
            <div className="lang-switch" role="group" aria-label="Language">
              <button
                type="button"
                className={lang === 'bn' ? 'active' : ''}
                onClick={() => setLang('bn')}
              >
                বাংলা
              </button>
              <button
                type="button"
                className={lang === 'en' ? 'active' : ''}
                onClick={() => setLang('en')}
              >
                English
              </button>
            </div>
            {user ? (
              <div className="user-chip">
                <span className="user-name">{user.name}</span>
                <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                  {t(lang, 'logout')}
                </button>
              </div>
            ) : (
              <Link to="/auth" className="btn btn-primary" onClick={closeMenu}>
                {t(lang, 'login')}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <p>
            <strong>GreenVest</strong> — {t(lang, 'footerLine')}
          </p>
          <nav className="footer-links" aria-label="Legal">
            <Link to="/contact">{t(lang, 'contact')}</Link>
            <Link to="/privacy">{t(lang, 'privacy')}</Link>
            <Link to="/terms">{t(lang, 'terms')}</Link>
            <Link to="/refund">{t(lang, 'refund')}</Link>
          </nav>
          <p className="muted footer-note">
            {lang === 'bn'
              ? 'মিনিমাম ৳৫০০ · ডেলিভারি ১২–২৪ ঘণ্টা · ম্যানুয়াল UTR'
              : 'Min ₹500 · Delivery 12–24 hours · Manual UTR only'}
          </p>
        </div>
      </footer>
    </div>
  )
}
