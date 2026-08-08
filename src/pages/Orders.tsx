import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { t } from '../lib/i18n'

export default function Orders() {
  const { user } = useAuth()
  const { orders, lang } = useStore()

  if (!user) return <Navigate to="/auth" replace />

  const mine = orders.filter((o) => o.userId === user.id)

  return (
    <div className="page">
      <h1>{t(lang, 'myOrders')}</h1>
      {mine.length === 0 ? (
        <div className="empty-block">
          <p>{t(lang, 'noOrders')}</p>
          <Link to="/" className="btn btn-primary">
            {t(lang, 'startShopping')}
          </Link>
        </div>
      ) : (
        <div className="order-list">
          {mine.map((o) => (
            <article key={o.id} className="order-card">
              <header>
                <div>
                  <strong>{o.id}</strong>
                  <span className="muted">{new Date(o.createdAt).toLocaleString()}</span>
                </div>
                <span className={`status status-${o.status}`}>{o.status.replace('_', ' ')}</span>
              </header>
              <ul>
                {o.items.map((it) => (
                  <li key={`${it.productId}-${it.grade}`}>
                    {it.emoji} {it.name} · {t(lang, 'grade')} {it.grade} × {it.qty} — ৳
                    {it.unitPrice * it.qty}
                  </li>
                ))}
              </ul>
              <p className="muted">
                {o.address}
                {o.pin ? ` · PIN ${o.pin}` : ''} · {o.phone}
              </p>
              <footer>
                <span>
                  {t(lang, 'subtotal')}: ৳{o.subtotal ?? o.total}
                </span>
                <span>
                  {t(lang, 'delivery')}: ৳{o.deliveryFee ?? 0}
                </span>
                <span>
                  {t(lang, 'total')}: <strong>৳{o.total}</strong>
                </span>
                <span>
                  {t(lang, 'advance')}: ৳{o.advanceAmount}
                </span>
                <span>
                  UTR: {o.utr}{' '}
                  {o.utrVerified ? (
                    <em className="ok">{t(lang, 'verified')}</em>
                  ) : (
                    <em className="wait">{t(lang, 'pending')}</em>
                  )}
                </span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
