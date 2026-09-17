import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { showToast } from '../../lib/toast'
import { useAuth } from '../../context/useAuth'
import { useStore } from '../../context/useStore'
import { printOrderInvoice, printThermalReceipt } from '../../lib/printOrder'
import { isOrderStalePending, formatItemWeightDetail, getOrderDeliveryOtp } from '../../lib/business'
import OrderChat from '../../components/OrderChat'
import ItemPackingManifest from '../../components/seller/ItemPackingManifest'
import { resolveNavDestination, createLocationRequestWhatsAppUrl } from '../../lib/delivery'
import type { Order, OrderStatus } from '../../types'

const STATUSES: OrderStatus[] = ['pending', 'advance_paid', 'confirmed', 'delivered', 'cancelled', 'refunded']

type Filter = 'active' | 'today_delivery' | 'scheduled' | 'to_pack' | 'done' | 'archived' | 'cancelled' | 'all'

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
  out_for_delivery: 'ডেলিভারিতে বের হয়েছে',
  delivered: 'ডেলিভারড',
  cancelled: 'বাতিল',
  refunded: 'রিফান্ড হয়েছে',
}

const statusIcon: Record<OrderStatus, string> = {
  pending: '⏳',
  advance_paid: '💵',
  confirmed: '✅',
  out_for_delivery: '🛵',
  delivered: '🚚',
  cancelled: '❌',
  refunded: '💸',
}

function cleanDisplayAddress(raw: string): string {
  if (!raw) return ''
  const cleaned = raw
    // Remove markdown or bracketed map search URLs
    .replace(/\[\s*Maps:\s*https?:\/\/[^\]]+\]/gi, '')
    // Remove standalone web links
    .replace(/https?:\/\/\S+/gi, '')
    // Remove GPS location saved text markers in Bengali & English
    .replace(/GPS\s*অবস্থান\s*সংরক্ষিত/gi, '')
    .replace(/GPS\s*Location\s*Saved/gi, '')
    // Remove bracketed coordinate strings like [22.1741403, 87.9040403]
    .replace(/\[\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*\]/g, '')
    .trim()

  // Extract landmark if present
  const nearMatch = cleaned.match(/\(Near:\s*([^)]+)\)/i)
  const landmark = nearMatch ? nearMatch[1].trim() : ''

  // Strip all (Near: ...) markers
  const base = cleaned.replace(/\(Near:[^)]+\)/gi, '').trim()

  // Deduplicate consecutive words (handles Unicode/Bengali properly)
  const tokens = base.split(/\s+/).filter(Boolean)
  const uniqueTokens: string[] = []
  for (const t of tokens) {
    if (uniqueTokens.length === 0 || uniqueTokens[uniqueTokens.length - 1] !== t) {
      uniqueTokens.push(t)
    }
  }
  const cleanBase = uniqueTokens.join(' ').replace(/^[,\s-]+|[,\s-]+$/g, '')

  if (landmark && cleanBase) {
    if (cleanBase.toLowerCase().includes(landmark.toLowerCase())) {
      return cleanBase
    }
    return `${cleanBase} (Near: ${landmark})`
  }

  return cleanBase || landmark || raw
}

export default function SellerOrders() {
  const { user } = useAuth()
  const { orders, products, lang, updateOrderStatus, updateOrderDeliveryDate, bulkUpdateOrderStatus, deleteOrder, autoCancelStaleOrders } = useStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewMode, setViewMode] = useState<'orders' | 'manifest'>(() => {
    return searchParams.get('view') === 'manifest' ? 'manifest' : 'orders'
  })
  const [filter, setFilter] = useState<Filter>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [customerFilter, setCustomerFilter] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingDateOrderId, setEditingDateOrderId] = useState<string | null>(null)
  const [openChatOrderId, setOpenChatOrderId] = useState<string | null>(null)
  const [purging, setPurging] = useState(false)
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const prevCount = useRef(orders.length)

  // S1: Sound alert on new order
  useEffect(() => {
    if (orders.length > prevCount.current) {
      if (soundEnabled) {
        playAlert()
      }
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
    }
    prevCount.current = orders.length
  }, [orders.length, soundEnabled])

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

  // S3: One-tap accept (confirm on website)
  const handleAcceptOrder = async (o: Order) => {
    if (processingOrderId === o.id) return
    setProcessingOrderId(o.id)
    try {
      await updateOrderStatus(o.id, 'confirmed')
      showToast(lang === 'bn' ? '✅ অর্ডার কনফার্ম হয়েছে ও কাস্টমারকে নোটিফিকেশন পাঠানো হয়েছে!' : '✅ Order confirmed! Customer notified.', '🎉')
    } catch (err) {
      console.error('Accept order error:', err)
      showToast(lang === 'bn' ? 'অর্ডার গ্রহণ ব্যর্থ হয়েছে' : 'Failed to accept order', '❌', 'error')
    } finally {
      setProcessingOrderId(null)
    }
  }

  const handleMarkDelivered = async (o: Order) => {
    if (processingOrderId === o.id) return
    setProcessingOrderId(o.id)
    try {
      await updateOrderStatus(o.id, 'delivered')
      showToast(lang === 'bn' ? '🚚 অর্ডার সফলভাবে ডেলিভারি সম্পন্ন হয়েছে!' : '🚚 Order marked as delivered!', '✅')
    } catch (err) {
      console.error('Mark delivered error:', err)
    } finally {
      setProcessingOrderId(null)
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
      showToast(lang === 'bn' ? 'অর্ডার বাতিল ও স্ট্যাটাস আপডেট হয়েছে' : 'Order cancelled & status updated', 'ℹ️')
    } catch (err) {
      console.error('Cancel order error:', err)
    }
  }

  // Today's summary
  const todayOrders = useMemo(() => orders.filter(o => isToday(o.createdAt)), [orders])
  const todayStats = useMemo(() => {
    const active = todayOrders.filter(o => o.status !== 'cancelled' && o.status !== 'delivered')
    const delivered = todayOrders.filter(o => o.status === 'delivered')
    const revenue = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0)
    return { total: todayOrders.length, active: active.length, delivered: delivered.length, revenue }
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
      const todayIso = new Date().toISOString().split('T')[0]

      if (filter === 'all') return true
      if (filter === 'archived') return isArchivedOld(o)
      if (filter === 'done') return o.status === 'delivered' && !isArchivedOld(o)
      if (filter === 'cancelled') return o.status === 'cancelled'
      if (isCancelledOld(o)) return false
      if (filter === 'to_pack') return o.status === 'confirmed' || o.status === 'advance_paid'
      if (filter === 'today_delivery') {
        return (o.deliveryDate === todayIso || ((!o.deliveryDate || o.deliveryDate === 'standard') && isToday(o.createdAt))) && o.status !== 'cancelled'
      }
      if (filter === 'scheduled') {
        return Boolean(o.deliveryDate && o.deliveryDate !== 'standard' && o.deliveryDate !== todayIso) && o.status !== 'cancelled'
      }
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

  const todayIso = new Date().toISOString().split('T')[0]

  const filters: { id: Filter; en: string; bn: string; count?: number }[] = [
    { id: 'active', en: 'Active ⚡', bn: 'চলমান ⚡', count: orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length },
    { id: 'today_delivery', en: 'Today 📅', bn: 'আজ 📅', count: orders.filter(o => (o.deliveryDate === todayIso || ((!o.deliveryDate || o.deliveryDate === 'standard') && isToday(o.createdAt))) && o.status !== 'cancelled').length },
    { id: 'scheduled', en: 'Scheduled 🗓️', bn: 'শিডিউল্ড 🗓️', count: orders.filter(o => o.deliveryDate && o.deliveryDate !== 'standard' && o.deliveryDate !== todayIso && o.status !== 'cancelled').length },
    { id: 'to_pack', en: 'To Pack 📦', bn: 'প্যাকিং 📦', count: orders.filter(o => o.status === 'confirmed' || o.status === 'advance_paid').length },
    { id: 'done', en: 'Done ✅', bn: 'ডেলিভারড ✅', count: orders.filter(o => o.status === 'delivered' && !isArchivedOld(o)).length },
    { id: 'archived', en: 'Archived 📂', bn: 'আর্কাইভ 📂', count: orders.filter(o => isArchivedOld(o)).length },
    { id: 'cancelled', en: 'Trash ❌', bn: 'বাতিল ❌', count: orders.filter(o => o.status === 'cancelled').length },
    { id: 'all', en: 'All 🌐', bn: 'সব 🌐' },
  ]

  const cs: React.CSSProperties = { background: 'var(--white, #fff)', borderRadius: '12px', border: '1px solid var(--line, #e5e7eb)' }

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="page" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.2rem', margin: 0 }}>{lang === 'bn' ? '📋 অর্ডার ম্যানেজমেন্ট' : '📋 Order Management'}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              const next = !soundEnabled
              setSoundEnabled(next)
              if (next) playAlert()
              showToast(next ? (lang === 'bn' ? '🔊 সাউন্ড অ্যালার্ট সক্রিয়' : '🔊 Sound alerts ON') : (lang === 'bn' ? '🔕 সাউন্ড বন্ধ' : '🔕 Sound alerts MUTED'), '🔔')
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              background: soundEnabled ? '#eff6ff' : '#f1f5f9',
              border: '1.5px solid',
              borderColor: soundEnabled ? '#93c5fd' : '#cbd5e1',
              color: soundEnabled ? '#1e40af' : '#64748b',
              padding: '0.35rem 0.65rem',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
            title="Toggle sound alerts on new orders"
          >
            {soundEnabled ? '🔔 Sound: ON' : '🔕 Sound: OFF'}
          </button>
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

      {/* ── View Switcher: Orders vs Item Sourcing & Packing Manifest ── */}
      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          margin: '0.85rem 0',
          background: '#f1f5f9',
          padding: '4px',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setViewMode('orders')
            setSearchParams({})
          }}
          style={{
            flex: 1,
            padding: '0.55rem 0.75rem',
            fontSize: '0.84rem',
            fontWeight: viewMode === 'orders' ? 700 : 500,
            background: viewMode === 'orders' ? '#ffffff' : 'transparent',
            color: viewMode === 'orders' ? '#166534' : '#64748b',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: viewMode === 'orders' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          📋 {lang === 'bn' ? 'অর্ডার ভিত্তিক তালিকা' : 'Orders View'} ({filtered.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setViewMode('manifest')
            setSearchParams({ view: 'manifest' })
          }}
          style={{
            flex: 1,
            padding: '0.55rem 0.75rem',
            fontSize: '0.84rem',
            fontWeight: viewMode === 'manifest' ? 700 : 500,
            background: viewMode === 'manifest' ? '#ffffff' : 'transparent',
            color: viewMode === 'manifest' ? '#166534' : '#64748b',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: viewMode === 'manifest' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          📊 {lang === 'bn' ? 'মালামাল ও প্রকিউরমেন্ট শিট (কেজি ও পিস)' : 'Item Sourcing & Packing (kg / pcs)'}
        </button>
      </div>

      {viewMode === 'manifest' ? (
        <ItemPackingManifest
          orders={orders}
          products={products}
          lang={lang}
          onSelectOrder={(orderId) => {
            setViewMode('orders')
            setSearchParams({})
            setSearchQuery(orderId)
            setFilter('all')
          }}
        />
      ) : (
        <>
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
          placeholder={lang === 'bn' ? '🔍 ফোন নম্বর, নাম বা অর্ডার ID খুঁজুন...' : '🔍 Search by Phone, Name, or Order ID...'}
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
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>{o.items.map(i => i.emoji).join('')} ₹{o.total}</span>
                      <span>·</span>
                      <span>{new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>·</span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '6px',
                        background: o.deliveryDate && o.deliveryDate !== 'standard' ? '#eff6ff' : '#f0fdf4',
                        color: o.deliveryDate && o.deliveryDate !== 'standard' ? '#1d4ed8' : '#15803d',
                        border: '1px solid',
                        borderColor: o.deliveryDate && o.deliveryDate !== 'standard' ? '#bfdbfe' : '#bbf7d0',
                      }}>
                        {o.deliveryDate && o.deliveryDate !== 'standard' ? `📅 ${o.deliveryDate}` : `⚡ 12–24h`}
                      </span>
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
                    <span style={{
                      fontSize: '0.68rem', padding: '1px 6px', borderRadius: '6px', fontWeight: 700,
                      background: o.paymentType === 'full' ? '#ecfdf5' : '#eff6ff',
                      color: o.paymentType === 'full' ? '#047857' : '#1d4ed8',
                    }}>
                      {o.paymentType === 'full'
                        ? (lang === 'bn' ? '💎 ফুল পে' : '💎 Full Pay')
                        : (lang === 'bn' ? `💳 অগ্রিম ₹${o.advanceAmount}` : `💳 10% Adv ₹${o.advanceAmount}`)}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{expanded ? '▲' : '▼'}</span>
                </div>

                {/* 💳 Unified Financial Summary Banner */}
                {o.status !== 'cancelled' && (
                  <div style={{
                    margin: '0 1rem 0.65rem',
                    padding: '0.65rem 0.85rem',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '0.6rem',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                        {lang === 'bn' ? 'মোট অর্ডার' : 'Total Order'}
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                        ₹{o.total}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                        {o.paymentType === 'full' 
                          ? (lang === 'bn' ? '💎 সম্পূর্ণ পেইড' : '💎 100% Paid') 
                          : (lang === 'bn' ? '💳 ১০% অনলাইন পেইড' : '💳 10% Online Paid')}
                      </div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#166534' }}>
                        ₹{o.advanceAmount}
                        {o.payerUpiName && (
                          <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500, marginLeft: '4px' }}>
                            ({o.payerUpiName})
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: balance > 0 ? '#b45309' : '#15803d', fontWeight: 700 }}>
                        {lang === 'bn' ? 'দরজায় বাকি সংগ্রহ' : 'Due on Doorstep'}
                      </div>
                      <div style={{
                        fontSize: '0.92rem',
                        fontWeight: 800,
                        color: balance > 0 ? '#dc2626' : '#166534',
                      }}>
                        {balance > 0 ? `₹${balance}` : (lang === 'bn' ? '✅ পরিশোধিত' : '✅ Paid in Full')}
                      </div>
                    </div>
                  </div>
                )}

                {/* Primary Action Row */}
                <div style={{ padding: '0 1rem 0.65rem', display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {(o.status === 'pending' || o.status === 'advance_paid') && (
                    <button
                      type="button"
                      disabled={processingOrderId === o.id}
                      onClick={() => void handleAcceptOrder(o)}
                      style={{
                        flex: 1,
                        minWidth: '130px',
                        padding: '0.55rem 0.85rem',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: processingOrderId === o.id ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        fontSize: '0.86rem',
                        background: processingOrderId === o.id ? '#86efac' : '#16a34a',
                        color: '#ffffff',
                        opacity: processingOrderId === o.id ? 0.7 : 1,
                        boxShadow: '0 1px 2px rgba(22, 163, 74, 0.25)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {processingOrderId === o.id 
                        ? (lang === 'bn' ? '⏳ কনফার্ম হচ্ছে...' : '⏳ Confirming...')
                        : `✅ ${lang === 'bn' ? 'অর্ডার গ্রহণ করুন' : 'Accept Order'}`}
                    </button>
                  )}
                  {o.status === 'confirmed' && (
                    <button
                      type="button"
                      disabled={processingOrderId === o.id}
                      onClick={() => void handleMarkDelivered(o)}
                      style={{
                        flex: 1,
                        minWidth: '130px',
                        padding: '0.55rem 0.85rem',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: processingOrderId === o.id ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        fontSize: '0.86rem',
                        background: processingOrderId === o.id ? '#93c5fd' : '#2563eb',
                        color: '#ffffff',
                        opacity: processingOrderId === o.id ? 0.7 : 1,
                        boxShadow: '0 1px 2px rgba(37, 99, 235, 0.25)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {processingOrderId === o.id 
                        ? (lang === 'bn' ? '⏳ আপডেট হচ্ছে...' : '⏳ Updating...')
                        : `🚚 ${lang === 'bn' ? 'ডেলিভারি সম্পন্ন করুন' : 'Mark Delivered'}`}
                    </button>
                  )}
                  {o.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => void handleCancel(o)}
                      title={lang === 'bn' ? 'অর্ডার বাতিল করুন' : 'Cancel order'}
                      style={{
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #fca5a5',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        background: '#fef2f2',
                        color: '#dc2626',
                      }}
                    >
                      ✕ {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => sendOrderWhatsApp(o, lang)}
                    title={lang === 'bn' ? 'কাস্টমারকে WhatsApp-এ বিল ও লাইভ ট্র্যাকিং পাঠান' : 'Send WhatsApp invoice & tracking to customer'}
                    style={{
                      padding: '0.55rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #86efac',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      background: '#f0fdf4',
                      color: '#15803d',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    💬 WhatsApp
                  </button>
                </div>

                {/* Expanded details */}
                {expanded && (
                  <div style={{ borderTop: '1px solid var(--line, #e5e7eb)', padding: '0.85rem 1rem', background: '#fafbfc' }}>
                    {/* Ordered Items Breakdown */}
                    <div style={{ marginBottom: '0.85rem', background: '#ffffff', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.45rem' }}>
                        📦 {lang === 'bn' ? 'অর্ডারের পণ্যসমূহ' : 'Ordered Items'}
                      </div>
                      {o.items.map(it => {
                        const wd = formatItemWeightDetail(it.qty, it.weightMultiplier, it.weightLabel, 'kg', lang)
                        return (
                          <div key={`${it.productId}-${it.grade}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem', padding: '0.3rem 0', borderBottom: '1px dashed #f1f5f9' }}>
                            <span style={{ color: '#1f2937' }}>
                              {it.emoji} <strong style={{ fontWeight: 600 }}>{it.name}</strong> · Grade {it.grade} × {it.qty}
                              {it.qty > 1 && (
                                <span style={{ marginLeft: '6px', fontSize: '0.72rem', color: '#166534', background: '#dcfce7', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                  {wd.totalWeightText}
                                </span>
                              )}
                            </span>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>₹{it.unitPrice * it.qty}</span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Delivery Destination & Navigation */}
                    {(() => {
                      const navDest = resolveNavDestination(o)
                      const locWaUrl = createLocationRequestWhatsAppUrl(o, lang)
                      const cleanAddr = cleanDisplayAddress(o.address)
                      return (
                        <div style={{
                          marginBottom: '0.85rem',
                          background: '#ffffff',
                          padding: '0.65rem 0.85rem',
                          borderRadius: '10px',
                          border: '1px solid #e5e7eb',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              📍 {lang === 'bn' ? 'ডেলিভারি ঠিকানা' : 'Delivery Destination'}
                            </span>
                            <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                              PIN: {o.pin || '—'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 500, marginBottom: '0.45rem', lineHeight: 1.45 }}>
                            🏡 {cleanAddr}
                          </div>
                          {navDest.hasLandmark && (
                            <div style={{
                              marginBottom: '0.55rem',
                              padding: '0.35rem 0.65rem',
                              background: '#fefce8',
                              border: '1px solid #fde047',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              color: '#854d0e',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}>
                              🏛️ {lang === 'bn' ? 'চিহ্নিত ল্যান্ডমার্ক:' : 'Landmark:'} <span>{navDest.landmarkName}</span>
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <a
                              href={navDest.navUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: navDest.hasLandmark ? '#b45309' : navDest.isExact ? '#166534' : '#1d4ed8',
                                color: '#ffffff',
                                padding: '5px 11px',
                                borderRadius: '7px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                textDecoration: 'none',
                              }}
                            >
                              🗺️ {lang === 'bn' ? 'Google Maps-এ রুট দেখুন' : 'Open in Google Maps'}
                              <span style={{ opacity: 0.85, fontSize: '0.72rem', fontWeight: 600 }}>
                                ({navDest.hasLandmark ? 'Landmark' : navDest.isExact ? 'Exact GPS' : 'Area PIN'})
                              </span>
                            </a>
                            {locWaUrl && (
                              <a
                                href={locWaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: '#ffffff',
                                  border: '1.5px solid #86efac',
                                  color: '#166534',
                                  padding: '4px 10px',
                                  borderRadius: '7px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  textDecoration: 'none',
                                }}
                                title={lang === 'bn' ? 'কাস্টমারের কাছে WhatsApp-এ লাইভ লোকেশন চেয়ে বার্তা পাঠান' : 'Request exact WhatsApp location from customer'}
                              >
                                📲 {lang === 'bn' ? 'WhatsApp লোকেশন চান' : 'Request GPS Location'}
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Delivery Date Scheduling Bar */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                      padding: '0.55rem 0.85rem',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '10px',
                      marginBottom: '0.85rem',
                      fontSize: '0.82rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 700, color: '#374151' }}>
                          📅 {lang === 'bn' ? 'ডেলিভারি সময়সূচী:' : 'Delivery Schedule:'}
                        </span>
                        <span style={{ fontWeight: 600, color: '#14532d', background: '#dcfce7', padding: '2px 8px', borderRadius: '10px' }}>
                          {o.deliveryDate && o.deliveryDate !== 'standard' ? o.deliveryDate : (lang === 'bn' ? '⚡ স্ট্যান্ডার্ড (১২–২৪ ঘণ্টা)' : '⚡ Standard (12–24h)')}
                        </span>
                      </div>

                      <div>
                        {editingDateOrderId === o.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="date"
                              defaultValue={o.deliveryDate && o.deliveryDate !== 'standard' ? o.deliveryDate : todayIso}
                              onChange={async (e) => {
                                if (e.target.value) {
                                  await updateOrderDeliveryDate(o.id, e.target.value)
                                  setEditingDateOrderId(null)
                                  showToast(lang === 'bn' ? '✅ ডেলিভারি তারিখ আপডেট হয়েছে' : '✅ Delivery date updated', '📅')
                                }
                              }}
                              style={{ fontSize: '0.78rem', padding: '3px 6px', borderRadius: '6px', border: '1px solid #86efac' }}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                await updateOrderDeliveryDate(o.id, 'standard')
                                setEditingDateOrderId(null)
                                showToast(lang === 'bn' ? '✅ স্ট্যান্ডার্ড ১২–২৪ ঘণ্টা সেট হয়েছে' : '✅ Set to standard 12-24h', '⚡')
                              }}
                              style={{ fontSize: '0.74rem', padding: '3px 8px', borderRadius: '6px', background: '#dcfce7', border: '1px solid #86efac', color: '#166534', cursor: 'pointer', fontWeight: 600 }}
                            >
                              {lang === 'bn' ? 'স্ট্যান্ডার্ড' : 'Standard'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDateOrderId(null)}
                              style={{ fontSize: '0.74rem', padding: '3px 8px', borderRadius: '6px', background: '#fee2e2', border: 'none', color: '#991b1b', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingDateOrderId(o.id)}
                            style={{
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              padding: '3px 9px',
                              borderRadius: '6px',
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              color: '#334155',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            ✏️ {lang === 'bn' ? 'তারিখ পরিবর্তন' : 'Change Date'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Operations & Utility Actions */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      marginBottom: '0.85rem',
                      background: '#ffffff',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb',
                    }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🛠️ {lang === 'bn' ? 'অর্ডার টুলস ও ডকুমেন্টস' : 'Order Actions & Tools'}
                      </div>
                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Customer Comms */}
                        <a href={`tel:${o.phone}`} style={{ padding: '0.4rem 0.75rem', borderRadius: '7px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.8rem', textDecoration: 'none', color: '#166534', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          📞 {lang === 'bn' ? 'কল করুন' : 'Call'}
                        </a>
                        <Link to={o.userId ? `/seller/support?userId=${o.userId}` : '/seller/support'} style={{ padding: '0.4rem 0.75rem', borderRadius: '7px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.8rem', textDecoration: 'none', color: '#166534', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          💬 {lang === 'bn' ? 'গ্রাহক সহায়তা' : 'Support Chat'}
                        </Link>

                        {/* Delivery Ops */}
                        <Link to={`/orders/success/${o.id}`} target="_blank" style={{ padding: '0.4rem 0.75rem', borderRadius: '7px', background: '#e0e7ff', border: '1px solid #c7d2fe', fontSize: '0.8rem', textDecoration: 'none', color: '#3730a3', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          📲 {lang === 'bn' ? 'লাইভ ট্র্যাকিং' : 'Live Tracking'}
                        </Link>
                        <Link to="/rider" style={{ padding: '0.4rem 0.75rem', borderRadius: '7px', background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '0.8rem', textDecoration: 'none', color: '#1e40af', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          🛵 {lang === 'bn' ? 'রাইডার পোর্টাল' : 'Rider Portal'}
                        </Link>

                        {/* Printing */}
                        <button type="button" onClick={() => printOrderInvoice(o, lang)} style={{ padding: '0.4rem 0.75rem', borderRadius: '7px', background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '0.8rem', cursor: 'pointer', color: '#334155', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }} title={lang === 'bn' ? 'A4 সাইজ ইনভয়েস প্রিন্ট / PDF ডাউনলোড' : 'Print A4 Tax Invoice / PDF'}>
                          🧾 {lang === 'bn' ? 'ইনভয়েস' : 'A4 Invoice'}
                        </button>
                        <button type="button" onClick={() => printThermalReceipt(o, lang)} style={{ padding: '0.4rem 0.75rem', borderRadius: '7px', background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '0.8rem', cursor: 'pointer', color: '#334155', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }} title={lang === 'bn' ? 'থার্মাল পিওএস রসিদ প্রিন্ট (৫৮/৮০ মিমি)' : 'Print Thermal POS Receipt (58/80mm)'}>
                          🖨️ {lang === 'bn' ? 'থার্মাল স্লিপ' : 'POS Slip'}
                        </button>

                        {/* Delete DB */}
                        <button type="button" onClick={() => void handleDeleteOrder(o.id)} style={{ padding: '0.4rem 0.75rem', borderRadius: '7px', background: '#fef2f2', border: '1px solid #fca5a5', fontSize: '0.8rem', cursor: 'pointer', color: '#dc2626', fontWeight: 600, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          🗑️ {lang === 'bn' ? 'মুছে ফেলুন' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    {/* Customer Chat / Notes Collapsible Accordion */}
                    <div style={{
                      marginBottom: '0.85rem',
                      background: '#ffffff',
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb',
                      overflow: 'hidden',
                    }}>
                      <button
                        type="button"
                        onClick={() => setOpenChatOrderId(openChatOrderId === o.id ? null : o.id)}
                        style={{
                          width: '100%',
                          padding: '0.6rem 0.85rem',
                          background: openChatOrderId === o.id ? '#f1f5f9' : '#ffffff',
                          border: 'none',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          color: '#334155',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          💬 {lang === 'bn' ? 'কাস্টমার নোট ও চ্যাট হিস্ট্রি' : 'Customer Notes & Messages'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {openChatOrderId === o.id ? '▲ ' + (lang === 'bn' ? 'লুকান' : 'Hide') : '▼ ' + (lang === 'bn' ? 'দেখুন' : 'View')}
                        </span>
                      </button>

                      {openChatOrderId === o.id && (
                        <div style={{ padding: '0.65rem 0.85rem', borderTop: '1px solid #e5e7eb', background: '#f8fafc' }}>
                          <OrderChat orderId={o.id} role="seller" lang={lang} />
                        </div>
                      )}
                    </div>

                    {/* Status dropdown (advanced manual override) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                      <span>{lang === 'bn' ? 'ম্যানুয়াল স্ট্যাটাস পরিবর্তন:' : 'Override Status:'}</span>
                      <select
                        value={o.status}
                        onChange={e => {
                          const s = e.target.value as OrderStatus
                          void updateOrderStatus(o.id, s)
                        }}
                        style={{
                          padding: '0.35rem 0.6rem',
                          borderRadius: '7px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: '#1f2937',
                        }}
                      >
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
      </>
    )}
  </div>
)
}


function sendOrderWhatsApp(o: Order, lang: string) {
  const cleanPhone = o.phone.replace(/\D/g, '').slice(-10)
  if (!cleanPhone) {
    showToast(lang === 'bn' ? 'কাস্টমারের ফোন নম্বর পাওয়া যায়নি' : 'No phone number found for customer', '⚠️')
    return
  }
  const balance = Math.max(0, o.total - (o.advanceAmount || 0))
  const itemsSummary = o.items.map((it) => `• ${it.name} (${it.grade}) × ${it.qty}`).join('\n')
  const statusLabel =
    o.status === 'confirmed'
      ? (lang === 'bn' ? 'কনফার্ম করা হয়েছে এবং প্যাকিং চলছে 📦' : 'Confirmed & Packing in progress 📦')
      : o.status === 'delivered'
      ? (lang === 'bn' ? 'ডেলিভারি সম্পন্ন হয়েছে ✅' : 'Delivered successfully ✅')
      : (lang === 'bn' ? 'গ্রহণ করা হয়েছে ⏳' : 'Received & Processing ⏳')

  const otp = getOrderDeliveryOtp(o)
  const otpLine =
    o.status === 'confirmed' || (o.status as string) === 'out_for_delivery'
      ? (lang === 'bn' ? `🔐 ডেলিভারি ওটিপি: *${otp}* (ডেলিভারির সময় রাইডারকে দিন)\n\n` : `🔐 Delivery OTP: *${otp}* (give to rider upon delivery)\n\n`)
      : ''

  const shortId = o.id.length > 8 ? o.id.slice(0, 8).toUpperCase() : o.id

  const msg =
    lang === 'bn'
      ? `🥦 *MS Vegetable Center অর্ডার আপডেট*\n\nনমস্কার ${o.userName}!\nআপনার অর্ডার #${shortId} ${statusLabel}।\n\n${otpLine}🛍️ *পণ্য তালিকা:*\n${itemsSummary}\n\n💰 মোট: ₹${o.total} | অগ্রিম: ₹${o.advanceAmount} | সংগৃহীতব্য বাকি: ₹${balance}\n📍 ঠিকানা: ${o.address}\n\n📲 লাইভ ট্র্যাকিং:\nhttps://greenvest.shop/track?id=${o.id}\n\nMS Vegetable Center-এর সাথে থাকার জন্য ধন্যবাদ! 🌱`
      : `🥦 *MS Vegetable Center Order Update*\n\nHello ${o.userName}!\nYour order #${shortId} is ${statusLabel}.\n\n${otpLine}🛍️ *Items:*\n${itemsSummary}\n\n💰 Total: ₹${o.total} | Advance: ₹${o.advanceAmount} | Balance to Pay: ₹${balance}\n📍 Address: ${o.address}\n\n📲 Live Tracking:\nhttps://greenvest.shop/track?id=${o.id}\n\nThank you for choosing MS Vegetable Center! 🌱`

  const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}
