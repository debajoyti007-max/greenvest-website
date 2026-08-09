import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import OrderTimeline from '../components/OrderTimeline'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN } from '../lib/business'
import { t } from '../lib/i18n'
import { openSellerOrderWhatsApp } from '../lib/whatsapp'

export default function OrderSuccess() {
  const { id } = useParams()
  const { user } = useAuth()
  const { orders, lang } = useStore()
  const notified = useRef(false)
  const [copied, setCopied] = useState(false)

  const order = user ? orders.find((o) => o.id === id && o.userId === user.id) : undefined

  useEffect(() => {
    if (!order || notified.current) return
    notified.current = true
    openSellerOrderWhatsApp(order)
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
    const text = `GreenVest Order #${order.id}\nTotal: ₹${order.total}\nAdvance Paid: ₹${order.advanceAmount}\nBalance: ₹${order.total - order.advanceAmount}\nSlot: ${order.deliverySlot}\nStatus: ${order.status}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (!user) return <Navigate to="/auth" replace />

  if (!order) {
    return (
      <div className="page narrow">
        <h1>{t(lang, 'orderNotFound')}</h1>
        <Link to="/orders" className="btn btn-primary">
          {t(lang, 'myOrders')}
        </Link>
      </div>
    )
  }

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
        <button type="button" className="btn btn-primary" onClick={() => openSellerOrderWhatsApp(order)}>
          {lang === 'bn' ? '💬 WhatsApp এ রশিদ ও UTR পাঠান' : '💬 Send Receipt to WhatsApp'}
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
        <Link to="/orders" className="btn btn-ghost">
          {t(lang, 'viewMyOrders')}
        </Link>
        <Link to="/" className="btn btn-ghost">
          {t(lang, 'keepShopping')}
        </Link>
      </div>
    </div>
  )
}
