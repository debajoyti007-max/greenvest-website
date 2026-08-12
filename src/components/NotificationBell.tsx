import { useState, useEffect } from 'react'
import { useStore } from '../context/StoreContext'
import { useAuth } from '../context/AuthContext'

const TWELVE_HOURS = 12 * 60 * 60 * 1000

export default function NotificationBell() {
  const { orders, notifications, lang } = useStore()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // 1. Order notifications — Bug 3 fix: filter to current user's orders only
  const orderNotifs = orders
    .filter((o) =>
      o.userId === user?.id &&   // ← only show THIS user's orders (not everyone's)
      Date.now() - new Date(o.createdAt).getTime() < TWELVE_HOURS
    )
    .map((o) => ({
      id: `order-${o.id}`,
      link: `/orders/success/${o.id}`,
      text: o.utrVerified
        ? (lang === 'bn' ? `✅ অর্ডার #${o.id.slice(0, 6)}-এর পেমেন্ট ভেরিফাইড!` : `✅ Payment verified for Order #${o.id.slice(0, 6)}!`)
        : (lang === 'bn' ? `⏳ অর্ডার #${o.id.slice(0, 6)} ইউটিআর ভেরিফিকেশনের অপেক্ষায়` : `⏳ Order #${o.id.slice(0, 6)} pending UTR verification`),
      time: new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: new Date(o.createdAt).getTime(),
    }))

  // 2. Custom seller/admin broadcast or direct user notifications
  const customNotifs = (notifications || [])
    .filter((n) => {
      // Bug 2 fix: require exact 'all' or own userId — never show on falsy/empty userId
      const isTarget = n.userId === 'all' || (!!user && n.userId === user.id)
      const isRecent = Date.now() - new Date(n.createdAt).getTime() < TWELVE_HOURS
      return isTarget && isRecent
    })
    .map((n) => ({
      id: n.id,
      link: '#',
      text: `📢 ${n.title ? `${n.title}: ` : ''}${n.message}`,
      time: new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: new Date(n.createdAt).getTime(),
    }))

  const activeNotifications = [...orderNotifs, ...customNotifs]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)

  useEffect(() => {
    setUnreadCount(activeNotifications.length > 0 ? activeNotifications.length : 0)
  }, [orders.length, notifications?.length])

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
                <div
                  key={n.id}
                  className="bell-item"
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', padding: '0.6rem 0.8rem', borderBottom: '1px solid #f3f4f6' }}
                >
                  <span className="bell-item-text" style={{ fontSize: '0.85rem', color: '#111827', fontWeight: 500 }}>
                    {n.text}
                  </span>
                  <span className="bell-item-time" style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {n.time}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
