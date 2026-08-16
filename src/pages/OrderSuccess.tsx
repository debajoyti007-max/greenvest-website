import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import OrderTimeline from '../components/OrderTimeline'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN } from '../lib/business'
import { t } from '../lib/i18n'
import { openSellerOrderWhatsApp } from '../lib/whatsapp'
import { printOrderInvoice } from '../lib/printOrder'
import { showToast } from '../components/Toast'
import type { Order } from '../types'

export default function OrderSuccess() {
  const { id } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const { orders, lang, updateOrderStatus } = useStore()
  const notified = useRef(false)
  const [copied, setCopied] = useState(false)
  const [waitingForOrder, setWaitingForOrder] = useState(true)

  // Use order passed via navigation state first (instant) — fallback to store lookup
  const navOrder = (location.state as { order?: Order } | null)?.order
  const isStaff = user?.role === 'seller' || user?.role === 'admin'
  const storeOrder = user
    ? orders.find((o) => o.id === id && (isStaff || o.userId === user.id))
    : orders.find((o) => o.id === id)
  const order = storeOrder ?? (navOrder?.id === id ? navOrder : undefined)

  useEffect(() => {
    if (!order || notified.current) return
    notified.current = true
    showToast(
      lang === 'bn'
        ? `🎉 অর্ডার সফলভাবে সম্পন্ন হয়েছে! UTR যাচাইয়ের পর ডেলিভারি হবে।`
        : `🎉 Order placed! Delivery after seller confirms your UTR.`,
      '🔔'
    )
  }, [order, lang])

  useEffect(() => {
    if (order) {
      setWaitingForOrder(false)
      return
    }
    // Give Supabase 8 seconds to sync before showing "not found"
    const timer = setTimeout(() => setWaitingForOrder(false), 8000)
    return () => clearTimeout(timer)
  }, [order])

  const copySummary = async () => {
    if (!order) return
    const text = `GreenVest Order: ${order.id}\nCustomer: ${order.userName} (${order.phone})\nTotal: ₹${order.total} (Advance ₹${order.advanceAmount})\nUTR: ${order.utr}\nAddress: ${order.address} (PIN ${order.pin})`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const shareWhatsAppCustomer = () => {
    if (!order) return
    const text = `GreenVest Order #${order.id}\nTotal: ₹${order.total}\nAdvance Paid: ₹${order.advanceAmount}\nBalance: ₹${order.total - order.advanceAmount}\nStatus: ${order.status}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  if (!user) return <Navigate to="/auth" replace />

  if (!order && waitingForOrder) {
    return (
      <div className="page narrow" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <p>{lang === 'bn' ? '⏳ অর্ডার লোড হচ্ছে...' : '⏳ Loading your order...'}</p>
      </div>
    )
  }

  if (!order && !waitingForOrder) {
    return (
      <div className="page narrow">
        <h1>{t(lang, 'orderNotFound')}</h1>
        <Link to="/orders" className="btn btn-primary">
          {t(lang, 'myOrders')}
        </Link>
      </div>
    )
  }

  if (!order) return null

  return (
    <div className="page narrow order-success-page">
      {/* Seller / Admin Live Management Bar */}
      {isStaff && order && (
        <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: '12px', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#166534' }}>
              🛠️ {lang === 'bn' ? 'সেলার কন্ট্রোল' : 'Seller Control Panel'}
            </span>
            <span style={{ fontSize: '0.75rem', background: '#22c55e', color: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
              Status: {order.status.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void updateOrderStatus(order.id, 'pending')}
              style={{ flex: 1, fontSize: '0.75rem', background: order.status === 'pending' ? '#fef9c3' : '#fff' }}
            >
              ⏳ {lang === 'bn' ? 'পেন্ডিং' : 'Pending'}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void updateOrderStatus(order.id, 'confirmed')}
              style={{ flex: 1, fontSize: '0.75rem' }}
            >
              ✅ {lang === 'bn' ? 'কনফার্ম' : 'Confirm'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void updateOrderStatus(order.id, 'delivered')}
              style={{ flex: 1, fontSize: '0.75rem', background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}
            >
              🚚 {lang === 'bn' ? 'ডেলিভারড' : 'Delivered'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (confirm(lang === 'bn' ? 'অর্ডার বাতিল করবেন?' : 'Cancel this order?')) {
                  void updateOrderStatus(order.id, 'cancelled')
                }
              }}
              style={{ fontSize: '0.75rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}
            >
              ❌ {lang === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
      <div className="success-badge" aria-hidden>
        ✓
      </div>
      <h1>{t(lang, 'orderPlaced')}</h1>
      <p className="lede">
        {lang === 'bn'
          ? `সেলার UTR যাচাই করার পর ডেলিভারি ${DELIVERY_WINDOW_BN}-এর মধ্যে।`
          : `After UTR verification, delivery arrives within ${DELIVERY_WINDOW}.`}
      </p>

      {/* Live Notification Indicator Badge */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.65rem 0.85rem', borderRadius: '10px', fontSize: '0.85rem', color: '#166534', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>🔔</span>
        <span>{lang === 'bn' ? 'লাইভ আপডেট নোটিফিকেশন বেল (উপরে)-এ চেক করতে পারেন!' : 'Live order status updates sent to your Notification Bell (top right)!'}</span>
      </div>

      <div className="order-card">
        <strong>{order.id}</strong>
        <p className="muted">{new Date(order.createdAt).toLocaleString()}</p>
        <OrderTimeline order={order} lang={lang} />
        <ul>
          {order.items.map((it) => (
            <li key={`${it.productId}-${it.grade}`}>
              {it.emoji} {it.name} · {t(lang, 'grade')} {it.grade} × {it.qty}
            </li>
          ))}
        </ul>
        <p>
          {t(lang, 'total')}: <strong>₹{order.total}</strong> ({t(lang, 'advance')} ₹
          {order.advanceAmount})
        </p>
        <p>
          UTR: <code>{order.utr}</code> · <em className="wait">{t(lang, 'utrPending')}</em>
        </p>
      </div>

      <div className="form-actions" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => printOrderInvoice(order)}>
          📄 {lang === 'bn' ? 'অফিসিয়াল PDF রসিদ ডাউনলোড / প্রিন্ট' : 'Download / Print PDF Invoice'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => openSellerOrderWhatsApp(order)}>
          💬 {lang === 'bn' ? 'WhatsApp এ রসিদ ও UTR পাঠান' : 'Send Receipt to WhatsApp'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={shareWhatsAppCustomer}>
          📲 Share on WhatsApp
        </button>
        <button type="button" className="btn btn-secondary" onClick={copySummary}>
          {copied
            ? lang === 'bn'
              ? '✓ কপি হয়েছে'
              : '✓ Copied'
            : lang === 'bn'
              ? '📋 রশিদের টেক্সট কপি করুন'
              : '📋 Copy Receipt Text'}
        </button>
      </div>
    </div>
  )
}
