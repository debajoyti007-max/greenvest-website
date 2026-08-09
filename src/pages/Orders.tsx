import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import OrderTimeline from '../components/OrderTimeline'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { t } from '../lib/i18n'
import type { Order } from '../types'

export default function Orders() {
  const { user } = useAuth()
  const { orders, lang, reorderFromOrder, updateOrderStatus } = useStore()
  const navigate = useNavigate()
  const [msg, setMsg] = useState('')

  if (!user) return <Navigate to="/auth" replace />

  const mine = orders.filter((o) => o.userId === user.id)

  const onReorder = (o: Order) => {
    const { added, skipped } = reorderFromOrder(o)
    if (added === 0) {
      setMsg(
        lang === 'bn'
          ? 'এই অর্ডারের আইটেম এখন স্টকে নেই।'
          : 'None of those items are in stock right now.',
      )
      return
    }
    setMsg(
      lang === 'bn'
        ? `${added} আইটেম কার্টে যোগ হয়েছে${skipped ? ` (${skipped} স্টক আউট স্কিপ)` : ''}।`
        : `Added ${added} item(s) to cart${skipped ? ` (${skipped} out of stock skipped)` : ''}.`,
    )
    navigate('/cart')
  }

  return (
    <div className="page">
      <h1>{t(lang, 'myOrders')}</h1>
      {msg && <p className="hint">{msg}</p>}
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
              <OrderTimeline 
                order={o} 
                lang={lang} 
                createdAt={o.createdAt} 
                updatedAt={(o as any).updatedAt} 
                deliverySlot={(o as any).deliverySlot} 
              />
              <ul>
                {o.items.map((it) => (
                  <li key={`${it.productId}-${it.grade}`}>
                    {it.emoji} {it.name} · {t(lang, 'grade')} {it.grade} × {it.qty} — ₹
                    {it.unitPrice * it.qty}
                  </li>
                ))}
              </ul>
              <p className="muted">
                {o.address}
                {o.pin ? ` · PIN ${o.pin}` : ''} · {o.phone}
                {o.deliverySlot
                  ? ` · ${o.deliverySlot === 'morning' ? (lang === 'bn' ? 'সকাল' : 'Morning') : lang === 'bn' ? 'সন্ধ্যা' : 'Evening'}`
                  : ''}
              </p>
              <footer>
                <span>
                  {t(lang, 'subtotal')}: ₹{o.subtotal ?? o.total}
                </span>
                <span>
                  {t(lang, 'delivery')}: ₹{o.deliveryFee ?? 0}
                </span>
                <span>
                  {t(lang, 'total')}: <strong>₹{o.total}</strong>
                </span>
                <span>
                  {t(lang, 'advance')}: ₹{o.advanceAmount}
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
              {o.status !== 'cancelled' && (
                <div className="form-actions" style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => onReorder(o)}>
                    {lang === 'bn' ? 'আবার অর্ডার' : 'Reorder'}
                  </button>
                  {(o.status === 'pending' || o.status === 'advance_paid') && (Date.now() - new Date(o.createdAt).getTime() < 30 * 60 * 1000) && (
                    <button 
                      type="button" 
                      className="btn btn-secondary warn" 
                      onClick={() => {
                        if (confirm('Are you sure?')) {
                          updateOrderStatus(o.id, 'cancelled')
                        }
                      }}
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
