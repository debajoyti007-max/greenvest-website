import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import OrderTimeline from '../components/OrderTimeline'
import { useAuth } from '../context/useAuth'
import { useStore } from '../context/useStore'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN } from '../lib/business'
import { t } from '../lib/i18n'
import { printOrderInvoice } from '../lib/printOrder'
import { showToast } from '../lib/toast'
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
        ? `🎉 অর্ডার সফলভাবে সম্পন্ন হয়েছে! দ্রুত ডেলিভারি প্রক্রিয়া শুরু হবে।`
        : `🎉 Order placed successfully! Delivery processing will begin shortly.`,
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
    const text = `GreenVest Order: ${order.id}\nCustomer: ${order.userName} (${order.phone})\nTotal: ₹${order.total} (Advance ₹${order.advanceAmount})\nAddress: ${order.address} (PIN ${order.pin})`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const handleShareOrder = async () => {
    if (!order) return
    const trackUrl = `${window.location.origin}/track?id=${order.id}`
    const text = `GreenVest Order #${order.id}\nTotal: ₹${order.total}\nAdvance: ₹${order.advanceAmount}\nStatus: ${order.status}\nTrack: ${trackUrl}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: `GreenVest Order #${order.id}`,
          text,
          url: trackUrl,
        })
        return
      } catch {}
    }
    await copySummary()
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
        {order.deliveryDate && order.deliveryDate !== 'standard'
          ? (lang === 'bn' ? `📅 আপনার অর্ডারটি ${order.deliveryDate} তারিখে ডেলিভারির জন্য শিডিউল করা হয়েছে।` : `📅 Your order is scheduled for delivery on ${order.deliveryDate}.`)
          : (lang === 'bn' ? `পেমেন্ট যাচাইয়ের পর দ্রুত ডেলিভারি ${DELIVERY_WINDOW_BN}-এর মধ্যে।` : `Fast delivery arrives within ${DELIVERY_WINDOW}.`)}
      </p>

      {/* Live Notification Indicator Badge */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.65rem 0.85rem', borderRadius: '10px', fontSize: '0.85rem', color: '#166534', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>🔔</span>
        <span>{lang === 'bn' ? 'লাইভ আপডেট নোটিফিকেশন বেল (উপরে)-এ চেক করতে পারেন!' : 'Live order status updates sent to your Notification Bell (top right)!'}</span>
      </div>

      <div className="order-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
          <strong>{order.id}</strong>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '8px',
            background: order.deliveryDate && order.deliveryDate !== 'standard' ? '#eff6ff' : '#f0fdf4',
            color: order.deliveryDate && order.deliveryDate !== 'standard' ? '#1d4ed8' : '#15803d',
            border: '1px solid',
            borderColor: order.deliveryDate && order.deliveryDate !== 'standard' ? '#bfdbfe' : '#86efac',
          }}>
            {order.deliveryDate && order.deliveryDate !== 'standard'
              ? `📅 ${order.deliveryDate}`
              : `⚡ 12–24h`}
          </span>
        </div>
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
          {lang === 'bn' ? 'পেমেন্ট মোড:' : 'Payment Mode:'}{' '}
          <strong style={{ color: '#166534' }}>
            {order.isKhataOrder
              ? (lang === 'bn' ? 'খাতা পে (বাকি)' : 'Khata Pay (Pay Later)')
              : order.paymentType === 'full'
              ? (lang === 'bn' ? '১০০% সম্পন্ন' : '100% Full Paid')
              : (lang === 'bn' ? `১০% অগ্রিম (₹${order.advanceAmount})` : `10% Advance Paid (₹${order.advanceAmount})`)}
          </strong>
        </p>
      </div>

      {/* 🎁 Refer a Friend Banner on Success */}
      <div style={{
        margin: '1.25rem 0',
        padding: '1rem',
        background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
        border: '1.5px solid #86efac',
        borderRadius: '12px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#166534', marginBottom: '0.3rem' }}>
          🎁 {lang === 'bn' ? 'বন্ধুদের রেফার করে পান ₹৫০ ছাড়!' : 'Refer Friends & Get ₹50 OFF!'}
        </div>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.84rem', color: '#15803d' }}>
          {lang === 'bn'
            ? `আপনার রেফার কোড: ${order.phone ? `GV-${order.phone.replace(/\D/g, '').slice(-4)}` : 'GV-2026'}। বন্ধুরা প্রথম অর্ডারে পাবেন ₹৫০ ছাড়!`
            : `Your referral code: ${order.phone ? `GV-${order.phone.replace(/\D/g, '').slice(-4)}` : 'GV-2026'}. Friends get ₹50 OFF!`}
        </p>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`🌿 GreenVest থেকে টাটকা সবজি কিনুন! আমার রেফার কোড ${order.phone ? `GV-${order.phone.replace(/\D/g, '').slice(-4)}` : 'GV-2026'} ব্যবহার করলে পাবেন ₹৫০ ছাড়: https://greenvest.shop/?ref=${order.phone ? `GV-${order.phone.replace(/\D/g, '').slice(-4)}` : 'GV-2026'}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#25D366',
            color: '#ffffff',
            padding: '7px 16px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.86rem',
            textDecoration: 'none',
          }}
        >
          💬 {lang === 'bn' ? 'WhatsApp-এ বন্ধুদের পাঠান' : 'Share on WhatsApp'}
        </a>
      </div>

      <div className="form-actions" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => printOrderInvoice(order)}>
          📄 {lang === 'bn' ? 'অফিসিয়াল PDF রসিদ ডাউনলোড / প্রিন্ট' : 'Download / Print PDF Invoice'}
        </button>
        <Link to="/support" className="btn btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          💬 {lang === 'bn' ? 'ইন-অ্যাপ সাপোর্টে যোগাযোগ করুন' : 'Contact In-App Support'}
        </Link>
        <button type="button" className="btn btn-secondary" onClick={handleShareOrder}>
          📲 {lang === 'bn' ? 'অর্ডার শেয়ার করুন' : 'Share Order'}
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
