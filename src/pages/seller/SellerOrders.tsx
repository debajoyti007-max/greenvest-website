import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import type { OrderStatus } from '../../types'

const STATUSES: OrderStatus[] = ['pending', 'advance_paid', 'confirmed', 'delivered', 'cancelled']

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
                {o.address} · {o.phone}
              </p>
              <div className="utr-row">
                <span>
                  UTR: <code>{o.utr}</code> · Advance ৳{o.advanceAmount} / Total ৳{o.total}
                </span>
                <button
                  type="button"
                  className={`btn ${o.utrVerified ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => verifyUtr(o.id, !o.utrVerified)}
                >
                  {o.utrVerified ? 'Unverify UTR' : 'Verify UTR'}
                </button>
              </div>
              <label className="status-select">
                Status
                <select
                  value={o.status}
                  onChange={(e) => updateOrderStatus(o.id, e.target.value as OrderStatus)}
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
