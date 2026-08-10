import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'

export default function NotificationBell() {
  const { orders, lang } = useStore()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const activeNotifications = orders.slice(0, 5).map((o) => ({
    id: o.id,
    text: o.utrVerified
      ? (lang === 'bn' ? `✅ অর্ডার #${o.id.slice(0, 6)}-এর পেমেন্ট ভেরিফাইড!` : `✅ Payment verified for Order #${o.id.slice(0, 6)}!`)
      : (lang === 'bn' ? `⏳ অর্ডার #${o.id.slice(0, 6)} ইউটিআর ভেরিফিকেশনের অপেক্ষায়` : `⏳ Order #${o.id.slice(0, 6)} pending UTR verification`),
    time: new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }))

  useEffect(() => {
    setUnreadCount(activeNotifications.length > 0 ? 1 : 0)
  }, [orders.length])

  return (
    <div className="notification-bell-wrapper">
      <button
        type="button"
        className="bell-trigger-btn"
        onClick={() => {
          setOpen(!open)
          setUnreadCount(0)
        }}
        aria-label="Notifications"
      >
        🔔 {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
      </button>

      {open && (
        <div className="bell-dropdown">
          <div className="bell-dropdown-header">
            <strong>{lang === 'bn' ? '🔔 লাইভ আপডেট' : '🔔 Live Notifications'}</strong>
          </div>
          <div className="bell-dropdown-body">
            {activeNotifications.length === 0 ? (
              <p className="bell-empty">{lang === 'bn' ? 'কোনো আপডেট নেই।' : 'No notifications yet.'}</p>
            ) : (
              activeNotifications.map((n) => (
                <Link
                  key={n.id}
                  to={`/orders/success/${n.id}`}
                  className="bell-item"
                  onClick={() => setOpen(false)}
                >
                  <span className="bell-item-text">{n.text}</span>
                  <span className="bell-item-time">{n.time}</span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
