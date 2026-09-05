import { useEffect, useState } from 'react'
import { useStore } from '../context/useStore'
import { syncPendingOfflineOrders } from '../lib/offlineQueue'

export default function NetworkStatus() {
  const { lang, placeOrder } = useStore()
  const [online, setOnline] = useState(navigator.onLine)
  const [justReconnected, setJustReconnected] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      setJustReconnected(true)
      // Auto sync any pending offline orders
      void syncPendingOfflineOrders(placeOrder, lang)
      setTimeout(() => setJustReconnected(false), 4000)
    }
    const handleOffline = () => {
      setOnline(false)
      setJustReconnected(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
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

  if (online) return null

  return (
    <div className="network-offline-banner" role="alert">
      <span>
        ⚠️{' '}
        {lang === 'bn'
          ? 'ইন্টারনেট কানেকশন নেই। অফলাইন মোডে সুরক্ষিত রয়েছে।'
          : 'You are offline. Safe offline mode active.'}
      </span>
    </div>
  )
}
