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
  const { orders, lang } = useStore()
  const notified = useRef(false)
  const [copied, setCopied] = useState(false)
  const [waitingForOrder, setWaitingForOrder] = useState(true)

  // Use order passed via navigation state first (instant) — fallback to store lookup
  const navOrder = (location.state as { order?: Order } | null)?.order
  const storeOrder = user ? orders.find((o) => o.id === id && o.userId === user.id) : undefined
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
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
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
    <div className="page narrow success-page">
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
