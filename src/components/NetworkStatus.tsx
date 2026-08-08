import { useEffect, useState } from 'react'
import { useStore } from '../context/StoreContext'

export default function NetworkStatus() {
  const { lang } = useStore()
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (online) return null

  return (
    <div className="network-offline-banner" role="alert">
      <span>
        ⚠️{' '}
        {lang === 'bn'
          ? 'ইন্টারনেট কানেকশন নেই। পুনঃসংযোগের চেষ্টা করা হচ্ছে...'
          : 'You are offline. Reconnecting to internet...'}
      </span>
    </div>
  )
}
