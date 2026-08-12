import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { showToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { printOrderInvoice, printThermalReceipt } from '../../lib/printOrder'
import { formatWhatsAppPhone, orderStatusWhatsAppUrl, paymentVerifiedWhatsAppUrl, riderDispatchWhatsAppUrl } from '../../lib/whatsapp'
import OrderChat from '../../components/OrderChat'
import type { Order, OrderStatus } from '../../types'

const STATUSES: OrderStatus[] = ['pending', 'advance_paid', 'confirmed', 'delivered', 'cancelled']

type Filter = 'all' | 'utr' | 'today' | 'active' | 'done' | 'cancelled'

const suffix = (n: number) => {
  if (n % 10 === 1 && n % 100 !== 11) return 'st'
  if (n % 10 === 2 && n % 100 !== 12) return 'nd'
  if (n % 10 === 3 && n % 100 !== 13) return 'rd'
  return 'th'
}

function playAlert() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800
    gain.gain.value = 0.3
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
    setTimeout(() => {
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.frequency.value = 1000
      gain2.gain.value = 0.3
      osc2.start()
      osc2.stop(ctx.currentTime + 0.2)
    }, 180)
  } catch { /* */ }
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString()
}

function isCancelledOld(order: Order) {
  if (order.status !== 'cancelled') return false
  return Date.now() - new Date(order.updatedAt || order.createdAt).getTime() > 12 * 60 * 60 * 1000
}

const statusBn: Record<OrderStatus, string> = {
  pending: 'অপেক্ষমাণ',
  advance_paid: 'অগ্রিম দেওয়া',
  confirmed: 'কনফার্ম',
  delivered: 'ডেলিভারড',
  cancelled: 'বাতিল',
}

const statusIcon: Record<OrderStatus, string> = {
  pending: '⏳',
  advance_paid: '💵',
  confirmed: '✅',
  delivered: '🚚',
  cancelled: '❌',
}

export default function SellerOrders() {
  const { user } = useAuth()
  const { orders, lang, updateOrderStatus, bulkUpdateOrderStatus, verifyUtr, deleteOrder } = useStore()
  const [filter, setFilter] = useState<Filter>('active')
  const [customerFilter, setCustomerFilter] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const prevCount = useRef(orders.length)

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  // S1: Sound alert on new order
  useEffect(() => {
    if (orders.length > prevCount.current) {
      playAlert()
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
    }
    prevCount.current = orders.length
  }, [orders.length])

  const handleDeleteOrder = async (id: string) => {
    if (!confirm(lang === 'bn' ? 'অর্ডারটি ডাটাবেস থেকে স্থায়ীভাবে মুছে ফেলতে চান?' : 'Permanently delete this order from the database?')) return
    await deleteOrder(id)
  }

  // S3: One-tap accept (verify UTR + confirm + WhatsApp)
  const handleAcceptOrder = async (o: Order) => {
    if (!o.utrVerified) await verifyUtr(o.id, true)
    await updateOrderStatus(o.id, 'confirmed')
    window.open(orderStatusWhatsAppUrl(o, 'confirmed'), '_blank', 'noopener,noreferrer')
  }

  const handleMarkDelivered = async (o: Order) => {
    await updateOrderStatus(o.id, 'delivered')
    window.open(orderStatusWhatsAppUrl(o, 'delivered'), '_blank', 'noopener,noreferrer')
  }

  const handleCancel = async (o: Order) => {
    if (!confirm(lang === 'bn' ? 'বাতিল করবেন?' : 'Cancel this order?')) return
    await updateOrderStatus(o.id, 'cancelled')
    window.open(orderStatusWhatsAppUrl(o, 'cancelled'), '_blank', 'noopener,noreferrer')
  }

  const handleVerifyUtr = async (o: Order) => {
    const next = !o.utrVerified
    await verifyUtr(o.id, next)
    if (next) window.open(paymentVerifiedWhatsAppUrl(o, lang), '_blank', 'noopener,noreferrer')
  }

  const handleRejectUtr = async (o: Order) => {
    if (!confirm(lang === 'bn' ? 'ভুল UTR হলে অর্ডার বাতিল করবেন?' : 'Reject invalid UTR and cancel order?')) return
    await updateOrderStatus(o.id, 'cancelled')
    const phone = formatWhatsAppPhone(o.phone)
    const msg = encodeURIComponent(
      lang === 'bn'
        ? `❌ আপনার অর্ডার ${o.id}-এর UTR (${o.utr}) ব্যাংক স্টেটমেন্টে পাওয়া যায়নি। অনুগ্রহ করে সঠিক UTR পাঠান।`
        : `❌ Your UTR (${o.utr}) for Order #${o.id} could not be verified in bank records. Please send your correct 12-digit UTR.`
    )
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank', 'noopener,noreferrer')
  }

  // S7: Today's summary
  const todayOrders = useMemo(() => orders.filter(o => isToday(o.createdAt)), [orders])
  const todayStats = useMemo(() => {
    const active = todayOrders.filter(o => o.status !== 'cancelled' && o.status !== 'delivered')
    const delivered = todayOrders.filter(o => o.status === 'delivered')
    const revenue = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0)
    const pending = todayOrders.filter(o => !o.utrVerified && o.status !== 'cancelled')
    return { total: todayOrders.length, active: active.length, delivered: delivered.length, revenue, pendingUtr: pending.length }
  }, [todayOrders])

  const filtered = useMemo(() => {
    let sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (customerFilter) {
      return sorted.filter(o => o.phone === customerFilter || o.userId === customerFilter)
    }
    return sorted.filter(o => {
      if (filter === 'all') return true
      if (filter !== 'cancelled' && isCancelledOld(o)) return false
      if (filter === 'utr') return !o.utrVerified && o.status !== 'cancelled'
      if (filter === 'today') return isToday(o.createdAt)
      if (filter === 'active') return o.status !== 'delivered' && o.status !== 'cancelled'
      if (filter === 'done') return o.status === 'delivered'
      if (filter === 'cancelled') return o.status === 'cancelled'
      return true
    })
  }, [orders, filter, customerFilter])

  const toggleSelect = (id: string) => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const toggleSelectAll = () => setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map(o => o.id))
  const handleBulkStatus = async (status: OrderStatus) => {
    if (selectedIds.length === 0) return
    await bulkUpdateOrderStatus(selectedIds, status)
    setSelectedIds([])
  }

  const filters: { id: Filter; en: string; bn: string; count?: number }[] = [
    { id: 'active', en: 'Active', bn: 'চলমান', count: orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length },
    { id: 'utr', en: 'UTR ⏳', bn: 'UTR বাকি', count: orders.filter(o => !o.utrVerified && o.status !== 'cancelled').length },
    { id: 'today', en: 'Today', bn: 'আজ', count: todayOrders.length },
    { id: 'all', en: 'All', bn: 'সব' },
    { id: 'done', en: 'Done', bn: 'ডেলিভারড' },
    { id: 'cancelled', en: 'Archived', bn: 'আর্কাইভ' },
  ]

  const cs: React.CSSProperties = { background: 'var(--white, #fff)', borderRadius: '12px', border: '1px solid var(--line, #e5e7eb)' }

  return (
    <div className="page" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.2rem', margin: 0 }}>{lang === 'bn' ? '📋 অর্ডার' : '📋 Orders'}</h1>
        <Link to="/seller" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>
          {lang === 'bn' ? '← ড্যাশবোর্ড' : '← Dashboard'}
        </Link>
      </div>

      {/* S7: Today's Summary Bar */}
      <div style={{ ...cs, padding: '0.75rem 1rem', margin: '0.75rem 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary)' }}>{todayStats.total}</div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{lang === 'bn' ? 'আজ মোট' : 'Today'}</div>
        </div>
        <div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#f59e0b' }}>{todayStats.active}</div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{lang === 'bn' ? 'চলমান' : 'Active'}</div>
        </div>
        <div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#22c55e' }}>{todayStats.delivered}</div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{lang === 'bn' ? 'ডেলিভারড' : 'Done'}</div>
        </div>
        <div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary)' }}>₹{todayStats.revenue}</div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{lang === 'bn' ? 'আয়' : 'Revenue'}</div>
        </div>
      </div>

      {/* Customer filter notice banner */}
      {customerFilter && (
        <div style={{ ...cs, padding: '0.6rem 1rem', marginBottom: '0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e40af' }}>
            👤 {lang === 'bn' ? `কাস্টমারের সকল অর্ডারের হিস্টোরি (${filtered.length})` : `Order History for Customer (${filtered.length} orders)`}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCustomerFilter(null)} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>
            ✕ {lang === 'bn' ? 'ক্লিয়ার ফিল্টার' : 'Clear Filter'}
          </button>
        </div>
      )}

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', padding: '0.25rem 0', marginBottom: '0.75rem' }}>
        {filters.map(f => (
          <button key={f.id} type="button"
            onClick={() => { setCustomerFilter(null); setFilter(f.id) }}
            style={{
              padding: '0.4rem 0.75rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
              background: !customerFilter && filter === f.id ? 'var(--primary, #166534)' : '#f3f4f6',
              color: !customerFilter && filter === f.id ? 'white' : '#374151',
            }}>
            {lang === 'bn' ? f.bn : f.en}{f.count !== undefined ? ` (${f.count})` : ''}
          </button>
        ))}
      </div>

      {/* Bulk toolbar */}
      {filtered.length > 0 && (
        <div style={{ ...cs, padding: '0.5rem 0.75rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontWeight: 600 }}>
            <input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
            {selectedIds.length > 0 ? `${selectedIds.length} selected` : (lang === 'bn' ? 'সব নির্বাচন' : 'Select all')}
          </label>
          {selectedIds.length > 0 && (
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => void handleBulkStatus('confirmed')}>
                ✅ {lang === 'bn' ? 'কনফার্ম' : 'Confirm'}
              </button>
              <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => void handleBulkStatus('delivered')}>
                🚚 {lang === 'bn' ? 'ডেলিভারড' : 'Delivered'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Order list */}
      {filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>{lang === 'bn' ? 'এই ফিল্টারে অর্ডার নেই।' : 'No orders here.'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {filtered.map(o => {
            const balance = o.total - o.advanceAmount
            const expanded = expandedId === o.id
            const custOrders = orders.filter(x => (x.userId === o.userId || x.phone === o.phone) && x.status !== 'cancelled' && new Date(x.createdAt).getTime() <= new Date(o.createdAt).getTime())
            const historyCount = custOrders.length

            return (
              <article key={o.id} style={{ ...cs, overflow: 'hidden' }}>
                {/* Compact header - always visible */}
                <div
                  onClick={() => setExpandedId(expanded ? null : o.id)}
                  style={{ padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <input type="checkbox" checked={selectedIds.includes(o.id)} onChange={(e) => { e.stopPropagation(); toggleSelect(o.id) }} style={{ cursor: 'pointer' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{o.userName}</span>
                      {/* S8: Quick call */}
                      <a href={`tel:${o.phone}`} onClick={e => e.stopPropagation()} style={{ fontSize: '0.85rem', textDecoration: 'none' }}>📞</a>
                      {historyCount <= 1 ? (
                        <span style={{ fontSize: '0.7rem', padding: '1px 6px', background: '#dcfce7', color: '#166534', borderRadius: '10px' }}>🆕</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setCustomerFilter(o.phone || o.userId || null)
                          }}
                          title={lang === 'bn' ? 'এই কাস্টমারের পূর্বের সব অর্ডার দেখুন' : 'Click to see all orders from this customer'}
                          style={{ fontSize: '0.7rem', padding: '1px 6px', background: '#e0e7ff', color: '#3730a3', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        >
                          🔁 {historyCount}{suffix(historyCount)} (History)
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span>{o.items.map(i => i.emoji).join('')} ₹{o.total}</span>
                      <span>·</span>
                      <span>{new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>· 12–24h Delivery</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <span style={{
                      fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 600,
                      background: o.status === 'delivered' ? '#dcfce7' : o.status === 'cancelled' ? '#fef2f2' : o.status === 'confirmed' ? '#dbeafe' : '#fef9c3',
                      color: o.status === 'delivered' ? '#166534' : o.status === 'cancelled' ? '#991b1b' : o.status === 'confirmed' ? '#1e40af' : '#854d0e',
                    }}>
                      {statusIcon[o.status]} {lang === 'bn' ? statusBn[o.status] : o.status.replace('_', ' ')}
                    </span>
                    {!o.utrVerified && o.status !== 'cancelled' && (
                      <span style={{ fontSize: '0.65rem', color: '#dc2626' }}>UTR ⏳</span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{expanded ? '▲' : '▼'}</span>
                </div>

                {/* Quick action buttons - available for all orders */}
                <div style={{ padding: '0 1rem 0.6rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {(o.status === 'pending' || o.status === 'advance_paid') && (
                    <button type="button" onClick={() => void handleAcceptOrder(o)}
                      style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', background: '#22c55e', color: 'white' }}>
                      ✅ {lang === 'bn' ? 'অর্ডার গ্রহণ' : 'Accept Order'}
                    </button>
                  )}
                  {o.status === 'confirmed' && (
                    <button type="button" onClick={() => void handleMarkDelivered(o)}
                      style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', background: '#3b82f6', color: 'white' }}>
                      🚚 {lang === 'bn' ? 'ডেলিভারড' : 'Mark Delivered'}
                    </button>
                  )}
                  {o.status !== 'cancelled' && (
                    <button type="button" onClick={() => void handleCancel(o)}
                      title={lang === 'bn' ? 'অর্ডার বাতিল করুন' : 'Cancel order'}
                      style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #fca5a5', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', background: '#fef2f2', color: '#dc2626' }}>
                      ✕ {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                    </button>
                  )}
                </div>

                {/* S4: Balance due for delivered orders */}
                {o.status === 'delivered' && balance > 0 && (
                  <div style={{ padding: '0 1rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '0.3rem 0.75rem', borderRadius: '8px' }}>
                      💰 {lang === 'bn' ? `বাকি: ₹${balance}` : `Balance: ₹${balance}`}
                    </span>
                  </div>
                )}

                {/* Expanded details */}
                {expanded && (
                  <div style={{ borderTop: '1px solid var(--line, #e5e7eb)', padding: '0.75rem 1rem' }}>
                    {/* Items */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      {o.items.map(it => (
                        <div key={`${it.productId}-${it.grade}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.2rem 0' }}>
                          <span>{it.emoji} {it.name} · Grade {it.grade} × {it.qty}</span>
                          <span style={{ fontWeight: 600 }}>₹{it.unitPrice * it.qty}</span>
                        </div>
                      ))}
                    </div>

                    {/* Address */}
                    <div style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '0.5rem', padding: '0.5rem', background: '#f9fafb', borderRadius: '8px' }}>
                      📍 {o.address} · PIN {o.pin || '—'}
                      {o.deliverySlot ? ` · ${o.deliverySlot === 'morning' ? (lang === 'bn' ? 'সকাল' : 'Morning') : (lang === 'bn' ? 'সন্ধ্যা' : 'Evening')}` : ''}
                    </div>

                    {/* Money */}
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                      <span>{lang === 'bn' ? 'মোট' : 'Total'}: <b>₹{o.total}</b></span>
                      <span>{lang === 'bn' ? 'অগ্রিম' : 'Advance'}: ₹{o.advanceAmount}</span>
                      <span style={{ color: balance > 0 ? '#dc2626' : '#22c55e', fontWeight: 600 }}>
                        {lang === 'bn' ? 'বাকি' : 'Balance'}: ₹{balance}
                      </span>
                    </div>

                    {/* UTR */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.85rem' }}>UTR: <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{o.utr}</code></span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(o.utr)
                            showToast(lang === 'bn' ? 'UTR কপি হয়েছে' : 'UTR copied!')
                          } catch {}
                        }}
                        style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid var(--line, #e5e7eb)', background: '#fff', fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        📋 {lang === 'bn' ? 'কপি' : 'Copy'}
                      </button>
                      <button type="button" onClick={() => void handleVerifyUtr(o)}
                        style={{
                          padding: '0.25rem 0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                          background: o.utrVerified ? '#dcfce7' : '#fef9c3', color: o.utrVerified ? '#166534' : '#854d0e'
                        }}>
                        {o.utrVerified ? '✅ Verified' : '⏳ Verify UTR'}
                      </button>
                      {!o.utrVerified && o.status !== 'cancelled' && (
                        <button type="button" onClick={() => void handleRejectUtr(o)}
                          style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                          ❌ {lang === 'bn' ? 'ভুল UTR' : 'Reject UTR'}
                        </button>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      <a href={`tel:${o.phone}`} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.8rem', textDecoration: 'none', color: '#166534' }}>📞 Call</a>
                      <button type="button" onClick={() => openWhatsApp(o, lang)} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.8rem', cursor: 'pointer', color: '#166534' }}>💬 WhatsApp</button>
                      <Link to={`/orders/success/${o.id}`} target="_blank" style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', background: '#e0e7ff', border: '1px solid #c7d2fe', fontSize: '0.8rem', textDecoration: 'none', color: '#3730a3', fontWeight: 600 }}>📲 Live Track</Link>
                      <button type="button" onClick={() => window.open(riderDispatchWhatsAppUrl(o, o.phone), '_blank', 'noopener,noreferrer')} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '0.8rem', cursor: 'pointer', color: '#1e40af' }}>🛵 Rider</button>
                      <button type="button" onClick={() => openMaps(o.address, o.pin || '')} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', background: '#f3f4f6', border: '1px solid #e5e7eb', fontSize: '0.8rem', cursor: 'pointer', color: '#374151' }}>🗺️ Maps</button>
                      <button type="button" onClick={() => printOrderInvoice(o)} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', background: '#f3f4f6', border: '1px solid #e5e7eb', fontSize: '0.8rem', cursor: 'pointer', color: '#374151' }}>🧾</button>
                      <button type="button" onClick={() => printThermalReceipt(o)} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', background: '#f3f4f6', border: '1px solid #e5e7eb', fontSize: '0.8rem', cursor: 'pointer', color: '#374151' }}>🖨️</button>
                      <button type="button" onClick={() => void handleDeleteOrder(o.id)} style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fca5a5', fontSize: '0.8rem', cursor: 'pointer', color: '#dc2626', marginLeft: 'auto' }}>🗑️ {lang === 'bn' ? 'মুছে ফেলুন' : 'Delete DB'}</button>
                    </div>

                    {/* Order Chat */}
                    <div style={{ marginTop: '0.75rem' }}>
                      <OrderChat orderId={o.id} role="seller" lang={lang} />
                    </div>

                    {/* Status dropdown (advanced) */}
                    <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{lang === 'bn' ? 'স্ট্যাটাস:' : 'Status:'}</span>
                      <select value={o.status} onChange={e => {
                        const s = e.target.value as OrderStatus
                        void updateOrderStatus(o.id, s)
                        if (['confirmed', 'delivered', 'cancelled'].includes(s)) {
                          window.open(orderStatusWhatsAppUrl(o, s), '_blank', 'noopener,noreferrer')
                        }
                      }} style={{ padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '0.8rem' }}>
                        {STATUSES.map(s => <option key={s} value={s}>{statusIcon[s]} {lang === 'bn' ? statusBn[s] : s}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function openWhatsApp(order: Order, lang: 'en' | 'bn') {
  const phone = formatWhatsAppPhone(order.phone)
  const text = encodeURIComponent(
    lang === 'bn'
      ? `GreenVest অর্ডার ${order.id}\nনমস্কার ${order.userName}, মোট ₹${order.total}। UTR: ${order.utr}। স্ট্যাটাস: ${order.status}।`
      : `GreenVest order ${order.id}\nHi ${order.userName}, total ₹${order.total}. UTR: ${order.utr}. Status: ${order.status}.`,
  )
  window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener,noreferrer')
}

function openMaps(address: string, pin: string) {
  const q = encodeURIComponent(`${address} ${pin}`.trim())
  window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank', 'noopener,noreferrer')
}
