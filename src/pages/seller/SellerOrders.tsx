import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { showToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { printOrderInvoice, printThermalReceipt } from '../../lib/printOrder'
import { formatWhatsAppPhone, orderStatusWhatsAppUrl, paymentVerifiedWhatsAppUrl, riderDispatchWhatsAppUrl } from '../../lib/whatsapp'
import { isOrderStalePending } from '../../lib/business'
import OrderChat from '../../components/OrderChat'
import type { Order, OrderStatus } from '../../types'

const STATUSES: OrderStatus[] = ['pending', 'advance_paid', 'confirmed', 'delivered', 'cancelled', 'refunded']

type Filter = 'active' | 'utr' | 'to_pack' | 'today' | 'done' | 'archived' | 'cancelled' | 'all'

const suffix = (n: number) => {
  if (n % 10 === 1 && n % 100 !== 11) return 'st'
  if (n % 10 === 2 && n % 100 !== 12) return 'nd'
  if (n % 10 === 3 && n % 100 !== 13) return 'rd'
  return 'th'
}

// 🔔 4-Tone Pleasant Melodic Ringtone & Multi-Vibrate for Incoming Orders
function playAlert() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    
    // Notes: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
    const notes = [523.25, 659.25, 783.99, 1046.50]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.1)
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.1 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.1)
      osc.stop(ctx.currentTime + i * 0.1 + 0.35)
    })

    if ('vibrate' in navigator) {
      navigator.vibrate([300, 100, 300, 100, 400])
    }
  } catch (e) {
    console.warn('Audio alert error:', e)
  }
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString()
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function isArchivedOld(order: Order) {
  const isDone = order.status === 'delivered' || order.status === 'cancelled'
  return isDone && (Date.now() - new Date(order.createdAt).getTime() > SEVEN_DAYS_MS)
}

function isCancelledOld(order: Order) {
  if (order.status !== 'cancelled') return false
  return Date.now() - new Date(order.updatedAt || order.createdAt).getTime() > 24 * 60 * 60 * 1000
}

// ⏱️ Order Age Badges: 🟢 Just Now (<10m) ➔ 🟡 Waiting 10-60m ➔ 🔴 Delayed >1h
function renderOrderAgeBadge(createdAt: string, status: OrderStatus, lang: 'bn' | 'en') {
  if (status === 'delivered' || status === 'cancelled') return null
  const elapsedMins = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000))
  
  if (elapsedMins < 10) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '0.68rem',
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: '12px',
        background: '#dcfce7',
        color: '#15803d',
        border: '1px solid #86efac',
      }}>
        🟢 {lang === 'bn' ? `সদ্য এসেছে (${elapsedMins} মি)` : `Just Now (${elapsedMins}m)`}
      </span>
    )
  } else if (elapsedMins < 60) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '0.68rem',
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: '12px',
        background: '#fef9c3',
        color: '#854d0e',
        border: '1px solid #fde047',
      }}>
        🟡 {lang === 'bn' ? `অপেক্ষমাণ (${elapsedMins} মি)` : `Waiting (${elapsedMins}m)`}
      </span>
    )
  } else {
    const hours = Math.floor(elapsedMins / 60)
    const mins = elapsedMins % 60
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '0.68rem',
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: '12px',
        background: '#fee2e2',
        color: '#b91c1c',
        border: '1px solid #fca5a5',
      }}>
        🔴 {lang === 'bn' ? `দেরি হচ্ছে (${hours}ঘ ${mins}মি)` : `Delayed (${hours}h ${mins}m)`}
      </span>
    )
  }
}

// 📊 1-Click Excel / CSV Export
function exportOrdersToCSV(ordersToExport: Order[], lang: 'bn' | 'en') {
  if (ordersToExport.length === 0) {
    showToast(lang === 'bn' ? 'এক্সপোর্ট করার মতো কোনো অর্ডার নেই' : 'No orders to export', '⚠️')
    return
  }

  const headers = [
    'Order ID',
    'Date',
    'Time',
    'Customer Name',
    'Phone',
    'Address',
    'PIN',
    'Total Amount (INR)',
    'Advance Paid (INR)',
    'Balance Due (INR)',
    'UTR / Ref',
    'Status',
    'Items Summary'
  ]

  const rows = ordersToExport.map(o => {
    const d = new Date(o.createdAt)
    const dateStr = d.toLocaleDateString('en-IN')
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    const balance = Math.max(0, o.total - (o.advanceAmount || 0))
    const itemsSummary = o.items.map(i => `${i.name} (${i.qty}x)`).join('; ')

    return [
      `"${o.id}"`,
      `"${dateStr}"`,
      `"${timeStr}"`,
      `"${(o.userName || '').replace(/"/g, '""')}"`,
      `"${o.phone || ''}"`,
      `"${(o.address || '').replace(/"/g, '""')}"`,
      `"${o.pin || ''}"`,
      o.total,
      o.advanceAmount || 0,
      balance,
      `"${o.utr || ''}"`,
      `"${o.status}"`,
      `"${itemsSummary.replace(/"/g, '""')}"`
    ].join(',')
  })

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `GreenVest_Orders_${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  showToast(lang === 'bn' ? '📊 এক্সেল / CSV রিপোর্ট ডাউনলোড হয়েছে!' : '📊 Orders exported to CSV!', '🎉')
}

const statusBn: Record<OrderStatus, string> = {
  pending: 'অপেক্ষমাণ',
  advance_paid: 'অগ্রিম দেওয়া',
  confirmed: 'কনফার্ম',
  delivered: 'ডেলিভারড',
  cancelled: 'বাতিল',
  refunded: 'রিফান্ড হয়েছে',
}

const statusIcon: Record<OrderStatus, string> = {
  pending: '⏳',
  advance_paid: '💵',
  confirmed: '✅',
  delivered: '🚚',
  cancelled: '❌',
  refunded: '💸',
}

export default function SellerOrders() {
  const { user } = useAuth()
  const { orders, lang, updateOrderStatus, bulkUpdateOrderStatus, verifyUtr, deleteOrder, autoCancelStaleOrders } = useStore()
  const [filter, setFilter] = useState<Filter>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [customerFilter, setCustomerFilter] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [purging, setPurging] = useState(false)
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
    try {
      await deleteOrder(id)
      showToast(lang === 'bn' ? 'অর্ডার মুছে ফেলা হয়েছে' : 'Order deleted', '🗑️')
    } catch (err) {
      console.error('Delete order error:', err)
    }
  }

  // 1-Click Purge All Cancelled Orders
  const handlePurgeAllCancelled = async () => {
    const cancelledList = orders.filter(o => o.status === 'cancelled')
    if (cancelledList.length === 0) return
    if (!confirm(lang === 'bn' ? `সকল ${cancelledList.length}টি বাতিল অর্ডার স্থায়ীভাবে ডাটাবেস থেকে মুছে ফেলতে চান?` : `Permanently purge all ${cancelledList.length} cancelled orders from database?`)) return

    setPurging(true)
    try {
      await Promise.allSettled(cancelledList.map(o => deleteOrder(o.id)))
      showToast(
        lang === 'bn' ? `🗑️ ${cancelledList.length}টি বাতিল অর্ডার সফলভাবে সাফ করা হয়েছে!` : `🗑️ ${cancelledList.length} cancelled orders purged!`,
        '✨'
      )
    } finally {
      setPurging(false)
    }
  }

  // S3: One-tap accept (verify UTR + confirm + WhatsApp)
  const handleAcceptOrder = async (o: Order) => {
    try {
      await verifyUtr(o.id, true)
      await updateOrderStatus(o.id, 'confirmed')
      window.open(orderStatusWhatsAppUrl(o, 'confirmed'), '_blank', 'noopener,noreferrer')
      showToast(lang === 'bn' ? '✅ অর্ডার কনফার্ম হয়েছে!' : '✅ Order confirmed!', '🎉')
    } catch (err) {
      console.error('Accept order error:', err)
      showToast(lang === 'bn' ? 'অর্ডার গ্রহণ ব্যর্থ হয়েছে' : 'Failed to accept order', '❌', 'error')
    }
  }

  const handleMarkDelivered = async (o: Order) => {
    try {
      await updateOrderStatus(o.id, 'delivered')
      window.open(orderStatusWhatsAppUrl(o, 'delivered'), '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('Mark delivered error:', err)
    }
  }

  const handleCancel = async (o: Order) => {
    const reason = prompt(
      lang === 'bn'
        ? 'অর্ডার বাতিলের কারণ লিখুন (যেমন: ডেলিভারি রুটের বাইরে / স্টক নেই):'
        : 'Enter cancellation reason (e.g. Out of delivery area / stock unavailable):',
      lang === 'bn' ? 'ডেলিভারি লোকেশন আমাদের সার্ভিস রুটের বাইরে' : 'Location out of delivery route'
    )
    if (reason === null) return // user cancelled prompt

    try {
      await updateOrderStatus(o.id, 'cancelled', reason)
      window.open(orderStatusWhatsAppUrl(o, 'cancelled', reason), '_blank', 'noopener,noreferrer')
      showToast(lang === 'bn' ? 'অর্ডার বাতিল ও কারণ WhatsApp-এ পাঠানো হয়েছে' : 'Order cancelled & reason sent via WhatsApp', 'ℹ️')
    } catch (err) {
      console.error('Cancel order error:', err)
    }
  }

  const handleVerifyUtr = async (o: Order) => {
    const next = !o.utrVerified
    try {
      await verifyUtr(o.id, next)
      if (next) window.open(paymentVerifiedWhatsAppUrl(o, lang), '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('Verify UTR error:', err)
    }
  }

  const handleRejectUtr = async (o: Order) => {
    if (!confirm(lang === 'bn' ? 'ভুল UTR হলে অর্ডার বাতিল করবেন?' : 'Reject invalid UTR and cancel order?')) return
    try {
      await updateOrderStatus(o.id, 'cancelled')
      const phone = formatWhatsAppPhone(o.phone)
      const msg = encodeURIComponent(
        lang === 'bn'
          ? `❌ আপনার অর্ডার ${o.id}-এর UTR (${o.utr}) ব্যাংক স্টেটমেন্টে পাওয়া যায়নি। অনুগ্রহ করে সঠিক UTR পাঠান।`
          : `❌ Your UTR (${o.utr}) for Order #${o.id} could not be verified in bank records. Please send your correct 12-digit UTR.`
      )
      window.open(`https://wa.me/${phone}?text=${msg}`, '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('Reject UTR error:', err)
    }
  }

  // Today's summary
  const todayOrders = useMemo(() => orders.filter(o => isToday(o.createdAt)), [orders])
  const todayStats = useMemo(() => {
    const active = todayOrders.filter(o => o.status !== 'cancelled' && o.status !== 'delivered')
    const delivered = todayOrders.filter(o => o.status === 'delivered')
    const revenue = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0)
    const pending = todayOrders.filter(o => !o.utrVerified && o.status !== 'cancelled')
    return { total: todayOrders.length, active: active.length, delivered: delivered.length, revenue, pendingUtr: pending.length }
  }, [todayOrders])

  // Filtered orders with search
  const filtered = useMemo(() => {
    let sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    // Customer filter
    if (customerFilter) {
      sorted = sorted.filter(o => o.phone === customerFilter || o.userId === customerFilter)
    }

    // Search query
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      sorted = sorted.filter(o =>
        o.id.toLowerCase().includes(q) ||
        o.phone.toLowerCase().includes(q) ||
        o.userName.toLowerCase().includes(q) ||
        o.address.toLowerCase().includes(q) ||
        o.pin.toLowerCase().includes(q) ||
        (o.utr && o.utr.toLowerCase().includes(q))
      )
    }

    // Category / Status Filter
    return sorted.filter(o => {
      if (filter === 'all') return true
      if (filter === 'archived') return isArchivedOld(o)
      if (filter === 'done') return o.status === 'delivered' && !isArchivedOld(o)
      if (filter === 'cancelled') return o.status === 'cancelled'
      if (isCancelledOld(o)) return false
      if (filter === 'utr') return !o.utrVerified && o.status !== 'cancelled'
      if (filter === 'to_pack') return (o.status === 'confirmed' || (o.status === 'advance_paid' && o.utrVerified))
      if (filter === 'today') return isToday(o.createdAt)
      if (filter === 'active') return o.status !== 'delivered' && o.status !== 'cancelled'
      return true
    })
  }, [orders, filter, customerFilter, searchQuery])

  const toggleSelect = (id: string) => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const toggleSelectAll = () => setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map(o => o.id))

  const handleBulkStatus = async (status: OrderStatus) => {
    if (selectedIds.length === 0) return
    await bulkUpdateOrderStatus(selectedIds, status)
    setSelectedIds([])
    showToast(lang === 'bn' ? 'স্ট্যাটাস আপডেট হয়েছে' : 'Status updated', '✅')
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(lang === 'bn' ? `নির্বাচিত ${selectedIds.length}টি অর্ডার মুছে ফেলতে চান?` : `Delete ${selectedIds.length} selected orders?`)) return
    await Promise.allSettled(selectedIds.map(id => deleteOrder(id)))
    setSelectedIds([])
    showToast(lang === 'bn' ? 'অর্ডারগুলো মুছে ফেলা হয়েছে' : 'Orders deleted', '🗑️')
  }

  const filters: { id: Filter; en: string; bn: string; count?: number }[] = [
    { id: 'active', en: 'Active 🛵', bn: 'চলমান 🛵', count: orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length },
    { id: 'utr', en: 'Pending UTR ⏳', bn: 'UTR বাকি ⏳', count: orders.filter(o => !o.utrVerified && o.status !== 'cancelled').length },
    { id: 'to_pack', en: 'To Pack 📦', bn: 'প্যাকিং বাকি 📦', count: orders.filter(o => (o.status === 'confirmed' || (o.status === 'advance_paid' && o.utrVerified))).length },
    { id: 'today', en: 'Today 📅', bn: 'আজ 📅', count: todayOrders.length },
    { id: 'done', en: 'Done ✅', bn: 'ডেলিভারড ✅', count: orders.filter(o => o.status === 'delivered' && !isArchivedOld(o)).length },
    { id: 'archived', en: 'Archived 📂', bn: 'আর্কাইভ 📂', count: orders.filter(o => isArchivedOld(o)).length },
    { id: 'cancelled', en: 'Trash / Cancelled ❌', bn: 'বাতিল / ট্র্যাশ ❌', count: orders.filter(o => o.status === 'cancelled').length },
    { id: 'all', en: 'All 🌐', bn: 'সব 🌐' },
  ]

  const cs: React.CSSProperties = { background: 'var(--white, #fff)', borderRadius: '12px', border: '1px solid var(--line, #e5e7eb)' }

  return (
    <div className="page" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.2rem', margin: 0 }}>{lang === 'bn' ? '📋 অর্ডার ম্যানেজমেন্ট' : '📋 Order Management'}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => exportOrdersToCSV(filtered, lang)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              background: '#f0fdf4',
              border: '1.5px solid #86efac',
              color: '#166534',
              padding: '0.35rem 0.75rem',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
            title={lang === 'bn' ? 'এক্সেল / CSV ফাইল ডাউনলোড করুন' : 'Download orders as CSV / Excel spreadsheet'}
          >
            📊 {lang === 'bn' ? 'এক্সেল CSV' : 'Export CSV'} ({filtered.length})
          </button>
          <Link to="/seller" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>
            {lang === 'bn' ? '← ড্যাশবোর্ড' : '← Dashboard'}
          </Link>
        </div>
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

      {/* ⏱️ Auto Smart Remove: Stale Pending Orders Alert */}
      {orders.filter(o => isOrderStalePending(o, 2)).length > 0 && (
        <div
          style={{
            ...cs,
            background: '#fffbeb',
            border: '1.5px solid #fde68a',
            padding: '0.75rem 1rem',
            marginBottom: '0.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div>
            <strong style={{ color: '#92400e', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ⏱️ {orders.filter(o => isOrderStalePending(o, 2)).length}টি অর্ডার ২ ঘণ্টার বেশি সময় ধরে পেমেন্ট যাচাইহীন (Unverified Pending)
            </strong>
            <span style={{ fontSize: '0.75rem', color: '#78350f', display: 'block', marginTop: '2px' }}>
              {lang === 'bn'
                ? 'অটো-ক্লিন করলে এই অর্ডারগুলো বাতিল করে স্টক অন্য কাস্টমারদের জন্য মুক্ত করা হবে।'
                : 'Auto-clean will cancel these unpaid orders and release inventory for waiting customers.'}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: '#d97706', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer' }}
            onClick={async () => {
              const count = await autoCancelStaleOrders(2)
              showToast(
                lang === 'bn'
                  ? `🧹 ${count}টি মেয়াদোত্তীর্ণ অর্ডার স্বয়ংক্রিয়ভাবে বাতিল করা হয়েছে!`
                  : `🧹 ${count} stale orders auto-cancelled!`,
                '✅',
              )
            }}
          >
            🧹 {lang === 'bn' ? 'অটো-ক্লিন বাতিল করুন' : 'Auto-Cancel Stale'} ({orders.filter(o => isOrderStalePending(o, 2)).length})
          </button>
        </div>
      )}

      {/* 🔍 Fast Search Bar */}
      <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={lang === 'bn' ? '🔍 ফোন নম্বর, নাম, UTR বা অর্ডার ID খুঁজুন...' : '🔍 Search by Phone, Name, UTR, or Order ID...'}
          style={{
            width: '100%',
            padding: '0.65rem 2.2rem 0.65rem 0.85rem',
            borderRadius: '10px',
            border: '1.5px solid var(--line, #cbd5e1)',
            fontSize: '0.9rem',
            background: '#ffffff',
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              fontSize: '1rem',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        )}
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

      {/* Cancelled Orders Purge Header (When in cancelled tab) */}
      {filter === 'cancelled' && filtered.length > 0 && (
        <div style={{ ...cs, padding: '0.75rem 1rem', marginBottom: '0.75rem', background: '#fef2f2', border: '1.5px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <strong style={{ color: '#991b1b', fontSize: '0.88rem', display: 'block' }}>
              🗑️ {lang === 'bn' ? 'বাতিল অর্ডার ট্র্যাশ বিন' : 'Cancelled Orders Trash Bin'}
            </strong>
            <span style={{ fontSize: '0.78rem', color: '#b91c1c' }}>
              {lang === 'bn' ? 'ডাটাবেস ফাস্ট ও ক্লিন রাখতে সকল বাতিল অর্ডার মুছে দিন।' : 'Purge old cancelled orders to keep database clean and fast.'}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePurgeAllCancelled}
            disabled={purging}
            style={{ background: '#dc2626', borderColor: '#dc2626', fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}
          >
            {purging ? '⏳...' : `🗑️ ${lang === 'bn' ? 'সকল বাতিল সাফ করুন' : 'Purge All Cancelled'}`}
          </button>
        </div>
      )}

      {/* Bulk toolbar */}
      {filtered.length > 0 && (
        <div style={{ ...cs, padding: '0.5rem 0.75rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontWeight: 600 }}>
            <input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
            {selectedIds.length > 0 ? `${selectedIds.length} selected` : (lang === 'bn' ? 'সব নির্বাচন' : 'Select all')}
          </label>
          {selectedIds.length > 0 && (
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => void handleBulkStatus('confirmed')}>
                ✅ {lang === 'bn' ? 'কনফার্ম' : 'Confirm'}
              </button>
              <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => void handleBulkStatus('delivered')}>
                🚚 {lang === 'bn' ? 'ডেলিভারড' : 'Delivered'}
              </button>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }} onClick={handleBulkDelete}>
                🗑️ {lang === 'bn' ? 'ডিলিট' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Order list */}
      {filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
          {searchQuery
            ? (lang === 'bn' ? 'কোনো অর্ডারের মিল পাওয়া যায়নি।' : 'No orders matched your search.')
            : (lang === 'bn' ? 'এই ফিল্টারে অর্ডার নেই।' : 'No orders here.')}
        </p>
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
                      {renderOrderAgeBadge(o.createdAt, o.status, lang)}
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

                {/* 📍 Location Inspection Card (Before Acceptance) */}
                {(o.status === 'pending' || o.status === 'advance_paid') && (
                  <div style={{ margin: '0 1rem 0.6rem', padding: '0.65rem 0.85rem', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '0.84rem', color: '#166534' }}>
                        📍 {lang === 'bn' ? 'ডেলিভারি লোকেশন যাচাই:' : 'Delivery Location Check:'}
                      </strong>
                      <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                        PIN: {o.pin}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#1f2937', marginBottom: '0.45rem', lineHeight: 1.4 }}>
                      🏡 {o.address}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <a
                        href={
                          o.geoLat && o.geoLng
                            ? `https://www.google.com/maps?q=${o.geoLat},${o.geoLng}`
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address + ' ' + o.pin)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: '#166534',
                          color: '#ffffff',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        🗺️ {lang === 'bn' ? 'Google Maps-এ অবস্থান দেখুন' : 'View on Google Maps'}
                      </a>
                      {o.geoLat && o.geoLng ? (
                        <span style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>
                          ✓ GPS Verified ({o.geoLat.toFixed(4)}, {o.geoLng.toFixed(4)})
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                          (Text Address)
                        </span>
                      )}
                    </div>
                  </div>
                )}

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
