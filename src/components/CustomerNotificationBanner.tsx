import { useState } from 'react'
import { useStore } from '../context/StoreContext'
import { useAuth } from '../context/AuthContext'

const TWELVE_HOURS = 12 * 60 * 60 * 1000

export default function CustomerNotificationBanner() {
  const { notifications, lang } = useStore()
  const { user } = useAuth()
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('gv_dismissed_notifs') || '[]')
    } catch {
      return []
    }
  })

  // Find the latest active, undismissed notification for this user / broadcast
  const activeNotification = (notifications || []).find((n) => {
    const isTarget = !n.userId || n.userId === 'all' || (user && n.userId === user.id)
    const isRecent = Date.now() - new Date(n.createdAt).getTime() < TWELVE_HOURS
    const isNotDismissed = !dismissedIds.includes(n.id)
    return isTarget && isRecent && isNotDismissed
  })

  const handleDismiss = (id: string) => {
    const updated = [...dismissedIds, id]
    setDismissedIds(updated)
    try {
      localStorage.setItem('gv_dismissed_notifs', JSON.stringify(updated))
    } catch (e) {
      console.error(e)
    }
  }

  if (!activeNotification) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        width: '92%',
        maxWidth: '650px',
        background: 'linear-gradient(135deg, #166534, #15803d)',
        color: '#ffffff',
        padding: '0.85rem 1.25rem',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        animation: 'slideDownBanner 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <style>{`
        @keyframes slideDownBanner {
          from { transform: translate(-50%, -100%); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#bbf7d0' }}>
          <span>📢 {activeNotification.sender || (lang === 'bn' ? 'স্টোর মেসেজ' : 'Store Notice')}</span>
          <span>•</span>
          <span style={{ fontWeight: 400 }}>{new Date(activeNotification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '0.15rem' }}>
          {activeNotification.title}
        </div>
        <div style={{ fontSize: '0.85rem', opacity: 0.95, marginTop: '0.1rem', wordBreak: 'break-word' }}>
          {activeNotification.message}
        </div>
      </div>
      <button
        type="button"
        onClick={() => handleDismiss(activeNotification.id)}
        style={{
          background: 'rgba(255, 255, 255, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          color: '#ffffff',
          padding: '0.4rem 0.8rem',
          borderRadius: '20px',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transition: 'all 0.2s ease',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.35)')}
        onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)')}
      >
        ✕ {lang === 'bn' ? 'ইগনোর' : 'Ignore / Dismiss'}
      </button>
    </div>
  )
}
