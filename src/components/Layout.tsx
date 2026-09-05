import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import CartBar from './CartBar'
import NetworkStatus from './NetworkStatus'
import Toast from './Toast'
import { useAuth } from '../context/useAuth'
import { useStore } from '../context/useStore'
import { t } from '../lib/i18n'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT } from '../lib/business'
import { STORE_LOCATION } from '../lib/delivery'

import MandiTicker from './MandiTicker'
import NotificationBell from './NotificationBell'
import CustomerNotificationBanner from './CustomerNotificationBanner'
import PwaInstallPrompt from './PwaInstallPrompt'
import BottomNav from './BottomNav'

// ⚡ Performance Optimization: Lazy-load support chat widget so initial layout render is instant
const SupportChatWidget = lazy(() => import('./SupportChatWidget'))

function playSystemAlertChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    const tones = [880, 1108.73]
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12)
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12)
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + i * 0.12 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.25)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.12)
      osc.stop(ctx.currentTime + i * 0.12 + 0.3)
    })
  } catch {
    // AudioContext blocked or not supported
  }
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { cartCount, lang, setLang, supportMessages } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [islandCompact, setIslandCompact] = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  const openAlertsCount = useMemo(() => {
    return (supportMessages || []).filter((m) => m.status === 'open').length
  }, [supportMessages])

  // Alert audio chime and browser tab title flashing for sellers and admins
  const prevAlertsCountRef = useRef<number>(openAlertsCount)
  const isPrivileged = user?.role === 'seller' || user?.role === 'admin'

  useEffect(() => {
    if (!isPrivileged) return
    if (openAlertsCount > prevAlertsCountRef.current && prevAlertsCountRef.current >= 0) {
      playSystemAlertChime()
    }
    prevAlertsCountRef.current = openAlertsCount
  }, [openAlertsCount, isPrivileged])

  useEffect(() => {
    if (!isPrivileged || openAlertsCount === 0) {
      document.title = 'GreenVest – তাজা সবজি'
      return
    }

    let toggle = false
    const baseTitle = 'GreenVest – তাজা সবজি'
    const alertTitle = `🚨 (${openAlertsCount}) Alert | GreenVest`

    const timer = setInterval(() => {
      toggle = !toggle
      document.title = toggle ? alertTitle : baseTitle
    }, 1200)

    return () => {
      clearInterval(timer)
      document.title = baseTitle
    }
  }, [openAlertsCount, isPrivileged])

  // Dynamic Island — compact on scroll down, expand on scroll up
  useEffect(() => {
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      setIslandCompact(y > 60 && y > lastY)
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
      <PwaInstallPrompt />
      <NetworkStatus />
      <MandiTicker />
      <header ref={headerRef} className={`site-header${islandCompact ? ' island-compact' : ''}`}>
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
                  {lang === 'bn' ? '🛵 রাইডার ভিউ' : '🛵 Rider View'}
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
                <NavLink to="/support" onClick={closeMenu}>
                  {lang === 'bn' ? '💬 সাপোর্ট' : '💬 Support'}
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
                {user?.role === 'admin' && (
                  <>
                    <NavLink
                      to="/seller"
                      onClick={closeMenu}
                      style={{
                        background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                        color: '#ffffff',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(22, 101, 52, 0.25)',
                      }}
                    >
                      💼 {lang === 'bn' ? 'সেলার হাব' : 'Seller Hub'}
                      {openAlertsCount > 0 && (
                        <span
                          title={lang === 'bn' ? `${openAlertsCount}টি সক্রিয় সাপোর্ট টিকিট` : `${openAlertsCount} active support alerts`}
                          style={{
                            background: '#ef4444',
                            color: '#ffffff',
                            borderRadius: '10px',
                            padding: '1px 6px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            lineHeight: 1.2,
                          }}
                        >
                          {openAlertsCount}
                        </span>
                      )}
                    </NavLink>
                    <NavLink
                      to="/admin"
                      onClick={closeMenu}
                      style={{
                        background: '#7c3aed',
                        color: '#ffffff',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      👑 {lang === 'bn' ? 'অ্যাডমিন' : 'Admin'}
                    </NavLink>
                    <NavLink to="/rider" onClick={closeMenu}>
                      🛵 {lang === 'bn' ? 'রাইডার' : 'Rider'}
                    </NavLink>
                  </>
                )}
                {user?.role === 'seller' && (
                  <NavLink
                    to="/seller"
                    onClick={closeMenu}
                    style={{
                      background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                      color: '#ffffff',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 8px rgba(22, 101, 52, 0.25)',
                    }}
                  >
                    💼 {lang === 'bn' ? 'সেলার হাব' : 'Seller Hub'}
                    {openAlertsCount > 0 && (
                      <span
                        title={lang === 'bn' ? `${openAlertsCount}টি সক্রিয় সাপোর্ট টিকিট` : `${openAlertsCount} active support alerts`}
                        style={{
                          background: '#ef4444',
                          color: '#ffffff',
                          borderRadius: '10px',
                          padding: '1px 6px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          lineHeight: 1.2,
                        }}
                      >
                        {openAlertsCount}
                      </span>
                    )}
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

      {/* 💼 Dedicated Staff Navigation Strip (Shows on seller/admin routes) */}
      {(user?.role === 'seller' || user?.role === 'admin') &&
        (location.pathname.startsWith('/seller') ||
          location.pathname.startsWith('/admin') ||
          location.pathname.startsWith('/rider')) && (
          <div
            style={{
              background: '#0f172a',
              borderBottom: '1px solid #334155',
              padding: '6px 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {[
              { path: '/seller', label: lang === 'bn' ? '📊 ড্যাশবোর্ড' : '📊 Dashboard', end: true },
              { path: '/seller/orders', label: lang === 'bn' ? '📦 অর্ডার' : '📦 Orders' },
              { path: '/seller/deals', label: lang === 'bn' ? '🎟️ অফার ব্যানার' : '🎟️ Deals Banner' },
              { path: '/seller/khata', label: lang === 'bn' ? '📒 খাতা বুক' : '📒 Khata Book' },
              { path: '/seller/products', label: lang === 'bn' ? '🥬 প্রোডাক্ট ও দাম' : '🥬 Products & Rates' },
              { path: '/seller/customers', label: lang === 'bn' ? '👥 কাস্টমার' : '👥 Customers' },
              { path: '/seller/support', label: lang === 'bn' ? '💬 সাপোর্ট ডেস্ক' : '💬 Support Desk' },
              { path: '/rider', label: lang === 'bn' ? '🛵 রাইডার' : '🛵 Rider' },
              ...(user.role === 'admin' ? [{ path: '/admin', label: lang === 'bn' ? '⚙️ অ্যাডমিন' : '⚙️ Admin' }] : []),
            ].map((tab) => {
              const active = tab.end
                ? location.pathname === tab.path
                : location.pathname.startsWith(tab.path)
              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    background: active ? '#16a34a' : 'rgba(255,255,255,0.08)',
                    color: active ? '#ffffff' : '#cbd5e1',
                    border: active ? '1px solid #86efac' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.label}
                </Link>
              )
            })}
          </div>
        )}

      <main className="main-content">
        <Outlet />
      </main>

      <CartBar />
      <Suspense fallback={null}>
        <SupportChatWidget />
      </Suspense>
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
              <Link
                to="/support"
                className="footer-wa-btn"
                style={{
                  background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                  color: '#ffffff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.65rem 1.1rem',
                  borderRadius: '12px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  boxShadow: '0 4px 12px rgba(22, 101, 52, 0.2)',
                }}
              >
                💬 {lang === 'bn' ? 'ইন-অ্যাপ লাইভ সাপোর্ট' : 'In-App Live Support'}
              </Link>
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
                href={STORE_LOCATION.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#86efac', fontSize: '0.8rem', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                🗺️ {lang === 'bn' ? 'গুগল ম্যাপে দেখুন' : 'View on Google Maps'}
              </a>
            </div>

            {/* Legal column */}
            <div className="footer-col">
              <h4 className="footer-col-title">{lang === 'bn' ? 'সহায়তা ও আইনি' : 'Support & Legal'}</h4>
              <nav className="footer-links" aria-label="Legal">
                <Link to="/support">{lang === 'bn' ? '💬 সাপোর্ট ডেস্ক' : '💬 Support Desk'}</Link>
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
                ? `ডেলিভারি ${DELIVERY_WINDOW_BN} · মিনিমাম ₹${MIN_ORDER_AMOUNT} · 🇮🇳 কান্ট্রি অফ অরিজিন: ভারত`
                : `Delivery ${DELIVERY_WINDOW} · Min ₹${MIN_ORDER_AMOUNT} · 🇮🇳 Country of Origin: India`}
            </span>
            <span className="footer-copy">
              © {new Date().getFullYear()} GreenVest · FSSAI Hygiene Compliant · Purba Medinipur, West Bengal
            </span>
          </div>
        </div>
      </footer>

      {/* 📱 Mobile Bottom Navigation Bar — Dynamic Island Style */}
      <BottomNav />
    </div>
  )
}
