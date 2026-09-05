import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { reportSystemAlert } from '../lib/telemetry'
import { useStore } from '../context/useStore'

export default function NotFound() {
  const location = useLocation()
  const { lang } = useStore()

  useEffect(() => {
    // Automatically record the 404 error into the in-app support stream
    void reportSystemAlert({
      type: '404',
      path: location.pathname + location.search,
    })
  }, [location.pathname, location.search])

  return (
    <div
      className="page narrow"
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
          borderRadius: '28px',
          padding: '2.5rem 1.75rem',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 24px 48px -12px rgba(22, 101, 52, 0.14)',
          border: '1.5px solid #bbf7d0',
        }}
      >
        {/* Glowing Badge */}
        <div style={{ fontSize: '3.2rem', marginBottom: '0.4rem', filter: 'drop-shadow(0 6px 12px rgba(22,101,52,0.18))' }}>
          🥬
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fee2e2', color: '#b91c1c', padding: '3px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 800, marginBottom: '0.65rem' }}>
          <span>404</span>
          <span>·</span>
          <span>{lang === 'bn' ? 'অনুপস্থিত লিঙ্ক' : 'NOT FOUND'}</span>
        </div>

        <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#166534', margin: '0 0 0.5rem' }}>
          {lang === 'bn' ? 'পেজটি পাওয়া যায়নি' : 'Page Not Found'}
        </h1>

        {/* Path tag */}
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '6px 12px', fontSize: '0.78rem', color: '#64748b', wordBreak: 'break-all', border: '1px solid #e2e8f0', margin: '0 auto 0.75rem', maxWidth: '300px', fontWeight: 600 }}>
          {location.pathname}
        </div>

        {/* Auto-Reported Pill */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#15803d', fontSize: '0.78rem', fontWeight: 700, margin: '0 0 1.5rem', background: '#dcfce7', padding: '4px 12px', borderRadius: '20px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
          <span>{lang === 'bn' ? 'সাপোর্টে রিপোর্ট সম্পন্ন' : 'Auto-Reported to Desk'}</span>
        </div>

        {/* Clean Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
          <Link
            to="/"
            className="btn btn-primary"
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '14px',
              fontWeight: 700,
              fontSize: '0.9rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            🏠 {lang === 'bn' ? 'হোমপেজ' : 'Store'}
          </Link>

          <Link
            to="/support"
            className="btn btn-secondary"
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '14px',
              fontWeight: 700,
              fontSize: '0.9rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: '#ffffff',
              border: '1.5px solid #86efac',
              color: '#166534',
            }}
          >
            💬 {lang === 'bn' ? 'সাপোর্ট' : 'Support'}
          </Link>
        </div>
      </div>
    </div>
  )
}
