import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { printOrderInvoice } from '../../lib/printOrder'
import type { Order, OrderStatus } from '../../types'

const STATUSES: OrderStatus[] = ['pending', 'advance_paid', 'confirmed', 'delivered', 'cancelled']

function openMaps(address: string, pin: string) {
  const q = encodeURIComponent(`${address} ${pin}`.trim())
  window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank')
}

function openWhatsApp(order: Order) {
  const phone = order.phone.replace(/\D/g, '').replace(/^0/, '91')
  const text = encodeURIComponent(
    `GreenVest order ${order.id}\nHi ${order.userName}, your order total is ৳${order.total}. UTR: ${order.utr}. Status: ${order.status}.`,
  )
  window.open(`https://wa.me/${phone}?text=${text}`, '_blank')
}

export default function SellerOrders() {
  const { user } = useAuth()
  const { orders, lang, updateOrderStatus, verifyUtr } = useStore()

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lang === 'bn' ? 'অর্ডার ম্যানেজমেন্ট' : 'Order management'}</h1>
        <Link to="/seller" className="btn btn-ghost">
          ← Dashboard
        </Link>
      </div>

      {orders.length === 0 ? (
        <p className="empty">No orders yet.</p>
      ) : (
        <div className="order-list">
          {orders.map((o) => (
            <article key={o.id} className="order-card seller-order">
              <header>
                <div>
                  <strong>{o.id}</strong>
                  <span className="muted">
                    {o.userName} · {o.userEmail}
                  </span>
                  <span className="muted">{new Date(o.createdAt).toLocaleString()}</span>
                </div>
                <span className={`status status-${o.status}`}>{o.status.replace('_', ' ')}</span>
              </header>
              <ul>
                {o.items.map((it) => (
                  <li key={`${it.productId}-${it.grade}`}>
                    {it.emoji} {it.name} · Grade {it.grade} × {it.qty} — ৳{it.unitPrice * it.qty}
                  </li>
                ))}
              </ul>
              <p>
                {o.address} · PIN {o.pin || '—'} · {o.phone}
              </p>
              <p className="muted">
                Subtotal ৳{o.subtotal ?? o.total} · Delivery ৳{o.deliveryFee ?? 0} · Total ৳{o.total}
              </p>
              <div className="utr-row">
                <span>
                  UTR: <code>{o.utr}</code> · Advance ৳{o.advanceAmount}
                </span>
                <button
                  type="button"
                  className={`btn ${o.utrVerified ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => void verifyUtr(o.id, !o.utrVerified)}
                >
                  {o.utrVerified ? 'Unverify UTR' : 'Verify UTR'}
                </button>
              </div>
              <div className="seller-order-actions">
                <button type="button" className="btn btn-secondary" onClick={() => openWhatsApp(o)}>
                  WhatsApp
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openMaps(o.address, o.pin || '')}
                >
                  Maps
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => printOrderInvoice(o)}>
                  Print invoice
                </button>
              </div>
              <label className="status-select">
                Status
                <select
                  value={o.status}
                  onChange={(e) => void updateOrderStatus(o.id, e.target.value as OrderStatus)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
