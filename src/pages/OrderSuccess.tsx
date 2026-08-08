import { useEffect, useRef } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
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

  const order = user ? orders.find((o) => o.id === id && o.userId === user.id) : undefined

  useEffect(() => {
    if (!order || notified.current) return
    notified.current = true
    openSellerOrderWhatsApp(order)
  }, [order])

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
        <ul>
          {order.items.map((it) => (
            <li key={`${it.productId}-${it.grade}`}>
              {it.emoji} {it.name} · {t(lang, 'grade')} {it.grade} × {it.qty}
            </li>
          ))}
        </ul>
        <p>
          {t(lang, 'total')}: <strong>৳{order.total}</strong> ({t(lang, 'advance')} ৳
          {order.advanceAmount})
        </p>
        <p>
          UTR: <code>{order.utr}</code> · <em className="wait">{t(lang, 'utrPending')}</em>
        </p>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={() => openSellerOrderWhatsApp(order)}>
          {t(lang, 'notifySellerWa')}
        </button>
        <Link to="/orders" className="btn btn-secondary">
          {t(lang, 'viewMyOrders')}
        </Link>
        <Link to="/" className="btn btn-ghost">
          {t(lang, 'keepShopping')}
        </Link>
      </div>
    </div>
  )
}
