import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { printOrderInvoice } from '../../lib/printOrder'
import type { Order, OrderStatus } from '../../types'

const STATUSES: OrderStatus[] = ['pending', 'advance_paid', 'confirmed', 'delivered', 'cancelled']

type Filter = 'all' | 'utr' | 'today' | 'active' | 'done'

function openMaps(address: string, pin: string) {
  const q = encodeURIComponent(`${address} ${pin}`.trim())
  window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank', 'noopener,noreferrer')
}

function openWhatsApp(order: Order, lang: 'en' | 'bn') {
  const phone = order.phone.replace(/\D/g, '').replace(/^0/, '91')
  const text = encodeURIComponent(
    lang === 'bn'
      ? `GreenVest অর্ডার ${order.id}\nনমস্কার ${order.userName}, মোট ৳${order.total}। UTR: ${order.utr}। স্ট্যাটাস: ${order.status}।`
      : `GreenVest order ${order.id}\nHi ${order.userName}, total ৳${order.total}. UTR: ${order.utr}. Status: ${order.status}.`,
  )
  window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener,noreferrer')
}

function isToday(iso: string) {
  const d = new Date(iso)
  const n = new Date()
  return d.toDateString() === n.toDateString()
}

const statusBn: Record<OrderStatus, string> = {
  pending: 'অপেক্ষমাণ',
  advance_paid: 'অগ্রিম দেওয়া',
  confirmed: 'কনফার্ম',
  delivered: 'ডেলিভারড',
  cancelled: 'বাতিল',
}

export default function SellerOrders() {
  const { user } = useAuth()
  const { orders, lang, updateOrderStatus, verifyUtr } = useStore()
  const [filter, setFilter] = useState<Filter>('all')

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const filtered = useMemo(() => {
    const sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return sorted.filter((o) => {
      if (filter === 'utr') return !o.utrVerified && o.status !== 'cancelled'
      if (filter === 'today') return isToday(o.createdAt)
      if (filter === 'active') return o.status !== 'delivered' && o.status !== 'cancelled'
      if (filter === 'done') return o.status === 'delivered'
      return true
    })
  }, [orders, filter])

  const filters: { id: Filter; en: string; bn: string }[] = [
    { id: 'all', en: 'All', bn: 'সব' },
    { id: 'utr', en: 'UTR pending', bn: 'UTR বাকি' },
    { id: 'today', en: 'Today', bn: 'আজ' },
    { id: 'active', en: 'Active', bn: 'চলমান' },
    { id: 'done', en: 'Delivered', bn: 'ডেলিভারড' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lang === 'bn' ? 'অর্ডার ম্যানেজমেন্ট' : 'Order management'}</h1>
        <Link to="/seller" className="btn btn-ghost">
          {lang === 'bn' ? '← ড্যাশবোর্ড' : '← Dashboard'}
        </Link>
      </div>

      <div className="cat-filters seller-filters">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {lang === 'bn' ? f.bn : f.en}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="empty">{lang === 'bn' ? 'এই ফিল্টারে অর্ডার নেই।' : 'No orders in this filter.'}</p>
      ) : (
        <div className="order-list">
          {filtered.map((o) => (
            <article key={o.id} className="order-card seller-order">
              <header>
                <div>
                  <strong>{o.id}</strong>
                  <span className="muted">
                    {o.userName} · {o.phone}
                  </span>
                  <span className="muted">{new Date(o.createdAt).toLocaleString()}</span>
                </div>
                <span className={`status status-${o.status}`}>
                  {lang === 'bn' ? statusBn[o.status] : o.status.replace('_', ' ')}
                </span>
              </header>
              <ul>
                {o.items.map((it) => (
                  <li key={`${it.productId}-${it.grade}`}>
                    {it.emoji} {it.name} · Grade {it.grade} × {it.qty} — ৳{it.unitPrice * it.qty}
                  </li>
                ))}
              </ul>
              <p>
                {o.address} · PIN {o.pin || '—'}
                {o.deliverySlot
                  ? ` · ${o.deliverySlot === 'morning' ? (lang === 'bn' ? 'সকাল' : 'Morning') : lang === 'bn' ? 'সন্ধ্যা' : 'Evening'}`
                  : ''}
              </p>
              <p className="muted">
                {lang === 'bn' ? 'মোট' : 'Total'} ৳{o.total} · {lang === 'bn' ? 'অগ্রিম' : 'Advance'} ৳
                {o.advanceAmount}
              </p>
              <div className="utr-row">
                <span>
                  UTR: <code>{o.utr}</code>
                </span>
                <button
                  type="button"
                  className={`btn ${o.utrVerified ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => void verifyUtr(o.id, !o.utrVerified)}
                >
                  {o.utrVerified
                    ? lang === 'bn'
                      ? 'যাচাই সরান'
                      : 'Unverify UTR'
                    : lang === 'bn'
                      ? 'UTR যাচাই'
                      : 'Verify UTR'}
                </button>
              </div>
              <div className="seller-order-actions">
                <button type="button" className="btn btn-secondary" onClick={() => openWhatsApp(o, lang)}>
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
                  {lang === 'bn' ? 'প্রিন্ট' : 'Print'}
                </button>
              </div>
              <label className="status-select">
                {lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}
                <select
                  value={o.status}
                  onChange={(e) => void updateOrderStatus(o.id, e.target.value as OrderStatus)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {lang === 'bn' ? statusBn[s] : s}
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
