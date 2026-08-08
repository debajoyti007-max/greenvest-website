import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'

export default function Orders() {
  const { user } = useAuth()
  const { orders, lang } = useStore()

  if (!user) return <Navigate to="/auth" replace />

  const mine = orders.filter((o) => o.userId === user.id)

  return (
    <div className="page">
      <h1>{lang === 'bn' ? 'আমার অর্ডার' : 'My orders'}</h1>
      {mine.length === 0 ? (
        <div className="empty-block">
          <p>{lang === 'bn' ? 'এখনো কোনো অর্ডার নেই।' : 'No orders yet.'}</p>
          <Link to="/" className="btn btn-primary">
            {lang === 'bn' ? 'কেনাকাটা শুরু' : 'Start shopping'}
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
                    {it.emoji} {it.name} · Grade {it.grade} × {it.qty} — ৳{it.unitPrice * it.qty}
                  </li>
                ))}
              </ul>
              <footer>
                <span>
                  {lang === 'bn' ? 'মোট' : 'Total'}: <strong>৳{o.total}</strong>
                </span>
                <span>
                  {lang === 'bn' ? 'অগ্রিম' : 'Advance'}: ৳{o.advanceAmount}
                </span>
                <span>
                  UTR: {o.utr}{' '}
                  {o.utrVerified ? (
                    <em className="ok">{lang === 'bn' ? 'যাচাইকৃত' : 'verified'}</em>
                  ) : (
                    <em className="wait">{lang === 'bn' ? 'অপেক্ষমাণ' : 'pending'}</em>
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
