import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { printOrderInvoice, printThermalReceipt } from '../../lib/printOrder'
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
  const { orders, lang, updateOrderStatus, bulkUpdateOrderStatus, verifyUtr } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filtered.map((o) => o.id))
    }
  }

  const handleBulkStatus = async (status: OrderStatus) => {
    if (selectedIds.length === 0) return
    await bulkUpdateOrderStatus(selectedIds, status)
    setSelectedIds([])
  }

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

      {filtered.length > 0 && (
        <div className="bulk-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.75rem 0 1rem', padding: '0.6rem 0.85rem', background: 'var(--white)', border: '1px solid var(--line)', borderRadius: '10px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
            <input
              type="checkbox"
              checked={selectedIds.length === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll}
            />
            {lang === 'bn' ? 'সব নির্বাচন' : 'Select all'} ({selectedIds.length})
          </label>
          {selectedIds.length > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleBulkStatus('confirmed')}
              >
                {lang === 'bn' ? '✓ কনফার্ম করুন' : 'Mark Confirmed'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleBulkStatus('delivered')}
              >
                {lang === 'bn' ? '🚚 ডেলিভারড করুন' : 'Mark Delivered'}
              </button>
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="empty">{lang === 'bn' ? 'এই ফিল্টারে অর্ডার নেই।' : 'No orders in this filter.'}</p>
      ) : (
        <div className="order-list">
          {filtered.map((o) => (
            <article key={o.id} className="order-card seller-order">
              <header style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(o.id)}
                  onChange={() => toggleSelect(o.id)}
                  style={{ marginTop: '0.2rem', cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
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
              <div className="seller-order-actions" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
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
                  {lang === 'bn' ? 'ইনভয়েস' : 'Invoice'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => printThermalReceipt(o)}>
                  {lang === 'bn' ? '🖨️ থার্মাল রিসিপ্ট' : '🖨️ Thermal Slip'}
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
