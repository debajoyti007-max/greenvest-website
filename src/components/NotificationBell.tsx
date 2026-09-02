import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import { useAuth } from '../context/AuthContext'
import { formatOrderId } from '../lib/business'

const TWELVE_HOURS = 12 * 60 * 60 * 1000

export default function NotificationBell() {
  const { orders, notifications, lang } = useStore()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const isStaff = user?.role === 'seller' || user?.role === 'admin' || user?.role === 'rider'

  // 1. Order notifications for customer OR staff
  const orderNotifs = orders
    .filter((o) => {
      if (isStaff) {
        // Staff see new / pending orders from last 12h
        return Date.now() - new Date(o.createdAt).getTime() < TWELVE_HOURS
      }
      return (
        (o.userId === user?.id || (user?.email && o.userEmail?.toLowerCase() === user.email.toLowerCase())) &&
        Date.now() - new Date(o.createdAt).getTime() < TWELVE_HOURS
      )
    })
    .map((o) => {
      const shortId = formatOrderId(o.id)
      let text = ''
      if (isStaff) {
        text = o.status === 'pending'
          ? (lang === 'bn' ? `🔔 নতুন অর্ডার #${shortId} (₹${o.total}) এসেছে!` : `🔔 New Order #${shortId} (₹${o.total}) received!`)
          : (lang === 'bn' ? `📦 অর্ডার #${shortId} (${o.status})` : `📦 Order #${shortId} (${o.status})`)
      } else {
        if (o.status === 'delivered') {
          text = lang === 'bn' ? `🚚 আপনার অর্ডার #${shortId} সফলভাবে ডেলিভারি হয়েছে!` : `🚚 Order #${shortId} delivered successfully!`
        } else if (o.status === 'confirmed') {
          text = lang === 'bn' ? `🎉 অর্ডার #${shortId} কনফার্ম হয়েছে! প্যাক করা হচ্ছে।` : `🎉 Order #${shortId} confirmed! Fresh items packing.`
        } else if (o.status === 'cancelled') {
          text = lang === 'bn' ? `❌ অর্ডার #${shortId} বাতিল করা হয়েছে।` : `❌ Order #${shortId} was cancelled.`
        } else if (o.isKhataOrder) {
          text = lang === 'bn' ? `📒 খাতা অর্ডার #${shortId} গৃহীত হয়েছে!` : `📒 Khata Order #${shortId} placed successfully!`
        } else if (o.utrVerified) {
          text = lang === 'bn' ? `✅ অর্ডার #${shortId}-এর পেমেন্ট যাচাই সম্পন্ন!` : `✅ Payment verified for Order #${shortId}!`
        } else {
          text = lang === 'bn' ? `⏳ অর্ডার #${shortId} পেমেন্ট যাচাইয়ের অপেক্ষায়` : `⏳ Order #${shortId} pending verification`
        }
      }

      return {
        id: `order-${o.id}`,
        link: isStaff ? '/seller/orders' : `/track?id=${shortId}`,
        text,
        time: new Date(o.updatedAt || o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: new Date(o.updatedAt || o.createdAt).getTime(),
      }
    })

  // 2. Custom seller/admin broadcast or direct user notifications
  const customNotifs = (notifications || [])
    .filter((n) => {
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
    .slice(0, 10)

  useEffect(() => {
    setUnreadCount(activeNotifications.length > 0 ? activeNotifications.length : 0)
  }, [activeNotifications.length])

  return (
    <div className="notification-bell-wrapper" style={{ position: 'relative' }}>
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
          <div className="bell-dropdown-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{lang === 'bn' ? '🔔 লাইভ আপডেট' : '🔔 Live Updates'}</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#64748b' }}
            >
              ✕
            </button>
          </div>
          <div className="bell-dropdown-body" style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {activeNotifications.length === 0 ? (
              <p className="bell-empty">{lang === 'bn' ? 'গত ১২ ঘণ্টায় কোনো নতুন নোটিফিকেশন নেই।' : 'No notifications in the last 12 hours.'}</p>
            ) : (
              activeNotifications.map((n) => (
                <Link
                  key={n.id}
                  to={n.link}
                  onClick={() => setOpen(false)}
                  className="bell-item"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                    padding: '0.65rem 0.85rem',
                    borderBottom: '1px solid #f3f4f6',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <span className="bell-item-text" style={{ fontSize: '0.84rem', color: '#1e293b', fontWeight: 600 }}>
                    {n.text}
                  </span>
                  <span className="bell-item-time" style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    {n.time}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
