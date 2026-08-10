import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'

const TWELVE_HOURS = 12 * 60 * 60 * 1000

export default function NotificationBell() {
  const { orders, lang } = useStore()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // Filter notifications created within the last 12 hours only
  const activeNotifications = orders
    .filter((o) => Date.now() - new Date(o.createdAt).getTime() < TWELVE_HOURS)
    .slice(0, 5)
    .map((o) => ({
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
            <strong>{lang === 'bn' ? '🔔 লাইভ আপডেট (১২ ঘণ্টা)' : '🔔 Live Notifications (12h)'}</strong>
          </div>
          <div className="bell-dropdown-body">
            {activeNotifications.length === 0 ? (
              <p className="bell-empty">{lang === 'bn' ? 'গত ১২ ঘণ্টায় কোনো নতুন নোটিফিকেশন নেই।' : 'No notifications in the last 12 hours.'}</p>
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
