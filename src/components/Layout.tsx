import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import CartBar from './CartBar'
import ConfigBanner from './ConfigBanner'
import NetworkStatus from './NetworkStatus'
import Toast from './Toast'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { t } from '../lib/i18n'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT } from '../lib/business'

import MandiTicker from './MandiTicker'
import NotificationBell from './NotificationBell'
import CustomerNotificationBanner from './CustomerNotificationBanner'

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
      <CustomerNotificationBanner />
      <NetworkStatus />
      <ConfigBanner />
      <MandiTicker />
      <header className="site-header">
        <div className="header-inner">
          <Link to={user?.role === 'rider' ? '/rider' : '/'} className="brand" onClick={closeMenu}>
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
            {user?.role === 'rider' ? (
              <>
                <NavLink to="/rider" onClick={closeMenu}>
                  {lang === 'bn' ? 'রাইডার ভিউ' : 'Rider View'}
                </NavLink>
                <NavLink to="/profile" onClick={closeMenu}>
                  {lang === 'bn' ? 'প্রোফাইল' : 'Profile'}
                </NavLink>
                <NotificationBell />
              </>
            ) : (
              <>
                <NavLink to="/" end onClick={closeMenu}>
                  {t(lang, 'shop')}
                </NavLink>
                <NavLink to="/cart" onClick={closeMenu}>
                  {t(lang, 'cart')}
                  {cartCount > 0 && <span className="badge">{cartCount}</span>}
                </NavLink>
                <NavLink to="/track" onClick={closeMenu}>
                  {lang === 'bn' ? 'ট্র্যাক' : 'Track Order'}
                </NavLink>
                <NotificationBell />
                {user && (
                  <NavLink to="/orders" onClick={closeMenu}>
                    {t(lang, 'orders')}
                  </NavLink>
                )}
                {user && (
                  <NavLink to="/profile" onClick={closeMenu}>
                    {lang === 'bn' ? 'প্রোফাইল' : 'Profile'}
                  </NavLink>
                )}
                {(user?.role === 'seller' || user?.role === 'admin') && (
                  <>
                    <NavLink to="/seller" onClick={closeMenu}>
                      {t(lang, 'seller')}
                    </NavLink>
                    <NavLink to="/rider" onClick={closeMenu}>
                      {lang === 'bn' ? 'রাইডার' : 'Rider'}
                    </NavLink>
                  </>
                )}
                {user?.role === 'admin' && (
                  <NavLink to="/admin" onClick={closeMenu}>
                    {t(lang, 'admin')}
                  </NavLink>
                )}
              </>
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
                <Link to="/profile" className="user-name" onClick={closeMenu} style={{ textDecoration: 'none', color: 'inherit' }}>{user.name}</Link>
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

      <CartBar />
      <Toast />

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-grid">
            {/* Brand column */}
            <div className="footer-brand">
              <div className="footer-logo">
                <span aria-hidden>🌿</span>
                <strong>GreenVest</strong>
              </div>
              <p className="footer-tagline">{t(lang, 'footerLine')}</p>
              <a
                href={`https://wa.me/919932871027?text=${encodeURIComponent('Hi GreenVest, I need help with my order.')}`}
                target="_blank"
                rel="noreferrer"
                className="footer-wa-btn"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                {lang === 'bn' ? 'WhatsApp-এ চ্যাট করুন' : 'Chat on WhatsApp'}
              </a>
            </div>

            {/* Quick links column */}
            <div className="footer-col">
              <h4 className="footer-col-title">{lang === 'bn' ? 'দ্রুত লিঙ্ক' : 'Quick Links'}</h4>
              <nav className="footer-links" aria-label="Quick">
                <Link to="/">{t(lang, 'shop')}</Link>
                <Link to="/cart">{t(lang, 'cart')}</Link>
                <Link to="/track">{lang === 'bn' ? 'অর্ডার ট্র্যাক' : 'Track Order'}</Link>
                <Link to="/orders">{t(lang, 'orders')}</Link>
              </nav>
            </div>

            {/* Store Location column */}
            <div className="footer-col">
              <h4 className="footer-col-title">{lang === 'bn' ? '🏪 আউটলেট' : '🏪 Our Outlet'}</h4>
              <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
                <strong>GreenVest Store</strong><br />
                {lang === 'bn' ? 'পূর্ব মেদিনীপুর, পিন: ৭২১৬৪৮' : 'Purba Medinipur, PIN 721648'}
              </p>
              <a
                href="https://maps.app.goo.gl/zjHaYvddzvXjHkap6"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#86efac', fontSize: '0.8rem', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                🗺️ {lang === 'bn' ? 'গুগল ম্যাপে দেখুন' : 'View on Google Maps'}
              </a>
            </div>

            {/* Legal column */}
            <div className="footer-col">
              <h4 className="footer-col-title">{lang === 'bn' ? 'সহায়তা' : 'Support'}</h4>
              <nav className="footer-links" aria-label="Legal">
                <Link to="/contact">{t(lang, 'contact')}</Link>
                <Link to="/privacy">{t(lang, 'privacy')}</Link>
                <Link to="/terms">{t(lang, 'terms')}</Link>
              </nav>
              <p className="footer-hours">
                🕐 {lang === 'bn' ? 'সকাল ৭টা – রাত ৯টা' : '7:00 am – 9:00 pm'}
              </p>
            </div>
          </div>

          <div className="footer-bottom">
            <span>
              {lang === 'bn'
                ? `ডেলিভারি ${DELIVERY_WINDOW_BN} · মিনিমাম ₹${MIN_ORDER_AMOUNT}`
                : `Delivery ${DELIVERY_WINDOW} · Min ₹${MIN_ORDER_AMOUNT}`}
            </span>
            <span className="footer-copy">© {new Date().getFullYear()} GreenVest. All rights reserved.</span>
          </div>
        </div>
      </footer>

      {/* 📱 Mobile Bottom Navigation Bar (Smart mobile navigation) */}
      <nav className="mobile-bottom-bar" aria-label="Mobile Navigation">
        <NavLink to="/" end className={({ isActive }) => `bottom-bar-item ${isActive ? 'active' : ''}`}>
          <span className="bottom-bar-icon">🏠</span>
          <span className="bottom-bar-label">{lang === 'bn' ? 'শপ' : 'Shop'}</span>
        </NavLink>
        <NavLink to="/track" className={({ isActive }) => `bottom-bar-item ${isActive ? 'active' : ''}`}>
          <span className="bottom-bar-icon">📍</span>
          <span className="bottom-bar-label">{lang === 'bn' ? 'ট্র্যাক' : 'Track'}</span>
        </NavLink>
        <NavLink to="/orders" className={({ isActive }) => `bottom-bar-item ${isActive ? 'active' : ''}`}>
          <span className="bottom-bar-icon">📦</span>
          <span className="bottom-bar-label">{lang === 'bn' ? 'অর্ডার' : 'Orders'}</span>
        </NavLink>
        <NavLink to="/cart" className={({ isActive }) => `bottom-bar-item ${isActive ? 'active' : ''}`}>
          <div className="bottom-bar-icon-wrap">
            <span className="bottom-bar-icon">🛒</span>
            {cartCount > 0 && <span className="bottom-bar-badge">{cartCount}</span>}
          </div>
          <span className="bottom-bar-label">{lang === 'bn' ? 'কার্ট' : 'Cart'}</span>
        </NavLink>
        <NavLink to={user ? '/profile' : '/auth'} className={({ isActive }) => `bottom-bar-item ${isActive ? 'active' : ''}`}>
          <span className="bottom-bar-icon">👤</span>
          <span className="bottom-bar-label">{user ? (lang === 'bn' ? 'প্রোফাইল' : 'Profile') : (lang === 'bn' ? 'লগইন' : 'Login')}</span>
        </NavLink>
      </nav>
    </div>
  )
}
