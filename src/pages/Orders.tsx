import { useState, useEffect, useMemo } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import OrderChat from '../components/OrderChat'
import FreshnessRating from '../components/FreshnessRating'
import OrderTimeline from '../components/OrderTimeline'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { t } from '../lib/i18n'
import type { Order, OrderItem } from '../types'

export default function Orders() {
  const { user } = useAuth()
  const { orders, lang, reorderFromOrder, updateOrderStatus, updateOrderUtr } = useStore()
  const navigate = useNavigate()
  const [msg, setMsg] = useState('')

  const onEditUtr = async (orderId: string, currentUtr: string) => {
    const entered = prompt(
      lang === 'bn' ? 'সঠিক ১২ সংখ্যার UTR নম্বর লিখুন:' : 'Enter correct 12-digit UTR number:',
      currentUtr,
    )
    if (!entered || entered.trim() === currentUtr.trim()) return
    const clean = entered.trim().replace(/\D/g, '')
    if (clean.length !== 12) {
      alert(
        lang === 'bn'
          ? 'UTR নম্বর অবশ্যই ১২ সংখ্যার হতে হবে।'
          : 'UTR must be exactly 12 numeric digits.',
      )
      return
    }
    try {
      await updateOrderUtr(orderId, clean)
    } catch {}
  }

  const onShareReceipt = (o: Order) => {
    const itemsText = o.items
      .map((it) => `• ${it.name} (${it.grade}) × ${it.qty} = ₹${it.unitPrice * it.qty}`)
      .join('\n')
    const text = `🌿 *GreenVest Order #${o.id}*\n📅 Date: ${new Date(o.createdAt).toLocaleDateString()}\n\n*Items:*\n${itemsText}\n\n*Total:* ₹${o.total}\n*Advance Paid:* ₹${o.advanceAmount}\n*Balance Due:* ₹${Math.max(0, o.total - o.advanceAmount)}\n*Delivery Address:* ${o.address} (PIN ${o.pin})\n\n📍 Track: https://greenvest.shop/track?id=${o.id}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  const [activeTab, setActiveTab] = useState<'recent' | 'archived'>('recent')
  const [archivedIds, setArchivedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('gv_archived_orders') || '[]') } catch { return [] }
  })
  const [clearedIds, setClearedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('gv_cleared_orders') || '[]') } catch { return [] }
  })
  const [showCleared, setShowCleared] = useState(false)

  useEffect(() => {
    localStorage.setItem('gv_archived_orders', JSON.stringify(archivedIds))
  }, [archivedIds])

  useEffect(() => {
    localStorage.setItem('gv_cleared_orders', JSON.stringify(clearedIds))
  }, [clearedIds])

  const mine = useMemo(() => {
    if (!user) return []
    return orders.filter(
      (o) =>
        o.userId === user.id ||
        (user.phone && o.phone === user.phone) ||
        (user.email && o.userEmail.toLowerCase() === user.email.toLowerCase()),
    )
  }, [orders, user])

  const { recentOrders, archivedOrders, clearedOrders } = useMemo(() => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
    const rec: Order[] = []
    const arch: Order[] = []
    const clr: Order[] = []

    mine.forEach((o: Order) => {
      const isCompleted = o.status === 'delivered' || o.status === 'cancelled'
      const isOld = (Date.now() - new Date(o.createdAt).getTime()) >= SEVEN_DAYS
      const isManuallyArchived = archivedIds.includes(o.id)
      const isCleared = clearedIds.includes(o.id)

      if (isCleared) {
        clr.push(o)
      } else if ((isOld && isCompleted) || (isCompleted && isManuallyArchived)) {
        arch.push(o)
      } else {
        rec.push(o)
      }
    })

    return { recentOrders: rec, archivedOrders: arch, clearedOrders: clr }
  }, [mine, archivedIds, clearedIds])

  const displayOrders = useMemo(() => {
    return activeTab === 'recent'
      ? recentOrders
      : mine.filter((o: Order) => archivedOrders.includes(o) || (showCleared && clearedOrders.includes(o)))
  }, [activeTab, recentOrders, mine, archivedOrders, showCleared, clearedOrders])

  const archivedCount = archivedOrders.length + (showCleared ? clearedOrders.length : 0)

  if (!user) return <Navigate to="/auth" replace />

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

      {mine.length > 0 && (
        <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
          <button 
            type="button"
            style={{ 
              background: 'none', 
              border: 'none', 
              padding: '0.75rem 0',
              borderBottom: activeTab === 'recent' ? '2px solid var(--primary, #000)' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'recent' ? 'bold' : 'normal',
              color: activeTab === 'recent' ? 'inherit' : '#6b7280'
            }}
            onClick={() => setActiveTab('recent')}
          >
            {lang === 'bn' ? 'সাম্প্রতিক' : 'Recent'}
          </button>
          <button 
            type="button"
            style={{ 
              background: 'none', 
              border: 'none', 
              padding: '0.75rem 0',
              borderBottom: activeTab === 'archived' ? '2px solid var(--primary, #000)' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'archived' ? 'bold' : 'normal',
              color: activeTab === 'archived' ? 'inherit' : '#6b7280'
            }}
            onClick={() => setActiveTab('archived')}
          >
            {lang === 'bn' ? `আর্কাইভ (${archivedCount})` : `Archived (${archivedCount})`}
          </button>
        </div>
      )}

      {activeTab === 'archived' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={showCleared} onChange={e => setShowCleared(e.target.checked)} /> 
            {lang === 'bn' ? 'মুছে ফেলাগুলি দেখুন' : 'Show cleared'}
          </label>
          {archivedOrders.length > 0 && (
            <button 
              type="button"
              className="btn btn-secondary" 
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
              onClick={() => {
                setClearedIds(prev => [...new Set([...prev, ...archivedOrders.map((o: Order) => o.id)])])
              }}
            >
              {lang === 'bn' ? 'সব মুছুন' : 'Clear All'}
            </button>
          )}
        </div>
      )}

      {displayOrders.length === 0 ? (
        <div className="empty-block">
          <p>{activeTab === 'recent' ? (lang === 'bn' ? 'কোনো সাম্প্রতিক অর্ডার নেই।' : 'No recent orders.') : (lang === 'bn' ? 'কোনো আর্কাইভ অর্ডার নেই।' : 'No archived orders.')}</p>
          {mine.length === 0 && (
            <Link to="/" className="btn btn-primary">
              {t(lang, 'startShopping')}
            </Link>
          )}
        </div>
      ) : (
        <div className="order-list">
          {displayOrders.map((o: Order) => (
            <article key={o.id} className={`order-card${o.status === 'delivered' ? ' delivered' : ''}`}>
              <header>
                <div>
                  <strong>{o.id}</strong>
                  <span className="muted">{new Date(o.createdAt).toLocaleString()}</span>
                </div>
                <span className={`status-pill ${o.status}`}>
                  {o.status === 'pending'
                    ? (lang === 'bn' ? 'পেন্ডিং' : 'Pending')
                    : o.status === 'advance_paid'
                    ? (lang === 'bn' ? 'অগ্রিম পেইড' : 'Advance Paid')
                    : o.status === 'confirmed'
                    ? (lang === 'bn' ? 'কনফার্মড' : 'Confirmed')
                    : o.status === 'delivered'
                    ? (lang === 'bn' ? 'ডেলিভারড' : 'Delivered')
                    : o.status === 'refunded'
                    ? (lang === 'bn' ? 'রিফান্ড' : 'Refunded')
                    : (lang === 'bn' ? 'বাতিল' : 'Cancelled')}
                </span>
              </header>
              <OrderTimeline 
                order={o} 
                lang={lang} 
                createdAt={o.createdAt} 
                updatedAt={o.updatedAt} 
                deliverySlot={o.deliverySlot} 
              />
              <ul>
                {o.items.map((it: OrderItem) => (
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

              {o.status === 'delivered' && (
                <div style={{ marginTop: '0.75rem' }}>
                  <FreshnessRating orderId={o.id} lang={lang} />
                </div>
              )}

              <div style={{ marginTop: '0.75rem' }}>
                <OrderChat orderId={o.id} role="customer" lang={lang} />
              </div>
              {(o.status !== 'cancelled' || (activeTab === 'recent' && !archivedIds.includes(o.id))) && (
                <div className="form-actions" style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {o.status !== 'cancelled' && (
                    <button type="button" className="btn btn-secondary" onClick={() => onReorder(o)}>
                      {lang === 'bn' ? 'আবার অর্ডার' : 'Reorder'}
                    </button>
                  )}
                  {o.status !== 'cancelled' && !o.utrVerified && o.status === 'pending' && (Date.now() - new Date(o.createdAt).getTime() < 30 * 60 * 1000) && (
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={() => onEditUtr(o.id, o.utr)}
                    >
                      ✏️ {lang === 'bn' ? 'UTR সংশোধন' : 'Edit UTR'}
                    </button>
                  )}
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => onShareReceipt(o)}
                  >
                    💬 {lang === 'bn' ? 'WhatsApp রসিদ' : 'WhatsApp Receipt'}
                  </button>
                  {o.status !== 'cancelled' && (o.status === 'pending' || o.status === 'advance_paid') && (Date.now() - new Date(o.createdAt).getTime() < 30 * 60 * 1000) && (
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
                  {activeTab === 'recent' && (o.status === 'delivered' || o.status === 'cancelled') && !archivedIds.includes(o.id) && (
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.85rem', marginLeft: 'auto' }}
                      onClick={() => setArchivedIds(prev => [...new Set([...prev, o.id])])}
                    >
                      📁 {lang === 'bn' ? 'আর্কাইভ' : 'Archive'}
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
