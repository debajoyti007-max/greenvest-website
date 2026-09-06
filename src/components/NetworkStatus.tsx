import { useEffect, useState, useRef } from 'react'
import { useStore } from '../context/useStore'
import { syncPendingOfflineOrders } from '../lib/offlineQueue'
import { showToast } from '../lib/toast'

export default function NetworkStatus() {
  const { lang, placeOrder } = useStore()
  const [online, setOnline] = useState(navigator.onLine)
  const [justReconnected, setJustReconnected] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const offlineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleOnline = () => {
      if (offlineTimeoutRef.current) {
        clearTimeout(offlineTimeoutRef.current)
        offlineTimeoutRef.current = null
      }
      setOnline(true)
      setDismissed(false)
      setJustReconnected(true)
      showToast(
        lang === 'bn' ? '🟢 ইন্টারনেট পুনঃসংযোগ সফল — ডেটা সিঙ্ক হয়েছে' : '🟢 Back online — Data synced!',
        '✅',
      )
      // Auto sync any pending offline orders
      void syncPendingOfflineOrders(placeOrder, lang)
      setTimeout(() => setJustReconnected(false), 4000)
    }

    const handleOffline = () => {
      // Debounce by 1.2s to prevent toast flicker on micro-disconnects
      if (offlineTimeoutRef.current) clearTimeout(offlineTimeoutRef.current)
      offlineTimeoutRef.current = setTimeout(() => {
        setOnline(false)
        setJustReconnected(false)
        setDismissed(false)
        showToast(
          lang === 'bn'
            ? '📡 ইন্টারনেট সংযোগ বিচ্ছিন্ন — আপনার কার্ট নিরাপদে সংরক্ষিত আছে'
            : '📡 You are offline — Cart is safely stored!',
          '⚠️',
        )
      }, 1200)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      if (offlineTimeoutRef.current) clearTimeout(offlineTimeoutRef.current)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [placeOrder, lang])

  if (justReconnected) {
    return (
      <div className="network-offline-banner" style={{ background: '#16a34a' }} role="status">
        <span>
          🟢 {lang === 'bn' ? 'ইন্টারনেট পুনঃসংযোগ সফল! ডেটা সিঙ্ক হচ্ছে...' : 'Back online! Syncing offline data...'}
        </span>
      </div>
    )
  }

  if (online || dismissed) return null

  return (
    <div className="network-offline-banner" role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
      <span>
        ⚠️{' '}
        {lang === 'bn'
          ? 'ইন্টারনেট কানেকশন নেই। অফলাইন মোডে আপনার কার্ট সুরক্ষিত রয়েছে।'
          : 'You are offline. Safe offline mode active.'}
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss offline banner"
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          color: 'white',
          borderRadius: '50%',
          width: '20px',
          height: '20px',
          cursor: 'pointer',
          fontSize: '0.75rem',
          lineHeight: '20px',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ✕
      </button>
    </div>
  )
}
