import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { formatWhatsAppPhone } from '../lib/whatsapp'
import { showToast } from '../components/Toast'

export default function RiderView() {
  const { user } = useAuth()
  const { orders, lang, updateOrderStatus } = useStore()
  const [tab, setTab] = useState<'active' | 'done' | 'all'>('active')
  const [completingId, setCompletingId] = useState<string | null>(null)

  const activeDeliveries = useMemo(() => {
    return orders
      .filter((o) => o.status !== 'delivered' && o.status !== 'cancelled')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [orders])

  const deliveredToday = useMemo(() => {
    const today = new Date().toDateString()
    return orders.filter((o) => o.status === 'delivered' && new Date(o.createdAt).toDateString() === today)
  }, [orders])

  const cashCollectedToday = useMemo(() => {
    return deliveredToday.reduce((sum, o) => sum + Math.max(0, o.total - o.advanceAmount), 0)
  }, [deliveredToday])

  const displayedOrders = useMemo(() => {
    if (tab === 'done') return deliveredToday
    if (tab === 'all') return [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return activeDeliveries
  }, [tab, activeDeliveries, deliveredToday, orders])

  if (!user || (user.role !== 'rider' && user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const handleCompleteDelivery = async (o: typeof orders[0]) => {
    const isReady = o.utrVerified || o.status === 'confirmed' || o.status === 'advance_paid'
    if (!isReady) {
      alert(
        lang === 'bn'
          ? '⚠️ সেলারের পেমেন্ট ভেরিফিকেশন অথবা অর্ডার কনফার্মেশন ছাড়া ডেলিভারি সম্পন্ন করা যাবে না।'
          : '⚠️ This order requires seller payment verification or confirmation before it can be marked as delivered.',
      )
      return
    }

    const balance = Math.max(0, o.total - o.advanceAmount)
    const confirmMsg = lang === 'bn'
      ? `${o.userName}-এর অর্ডার ডেলিভারি সম্পন্ন হয়েছে এবং বাকি ₹${balance} ক্যাশ সংগৃহীত হয়েছে?`
      : `Confirm delivery completed for ${o.userName} and ₹${balance} balance collected?`
    if (!confirm(confirmMsg)) return

    try {
      setCompletingId(o.id)
      await updateOrderStatus(o.id, 'delivered')
      showToast(lang === 'bn' ? `✅ ${o.userName}-এর অর্ডার ডেলিভারি সম্পন্ন হয়েছে!` : `✅ Order for ${o.userName} delivered!`, '🎉')
    } finally {
      setCompletingId(null)
    }
  }

  const sendOutForDeliveryWA = (phone: string, userName: string, id: string) => {
    const waDigits = formatWhatsAppPhone(phone)
    const msg = encodeURIComponent(
      `নমস্কার ${userName}, আপনার GreenVest অর্ডার #${id.slice(0, 6)} রাইডারের কাছে ডেলিভারির জন্য রওয়ানা হয়েছে! 🛵`
    )
    window.open(`https://wa.me/${waDigits}?text=${msg}`, '_blank', 'noopener,noreferrer')
  }

  const sendDeliveredInvoiceWA = (o: typeof orders[0]) => {
    const waDigits = formatWhatsAppPhone(o.phone)
    const balance = Math.max(0, o.total - o.advanceAmount)
    const itemsText = o.items.map(it => `• ${it.name} (${it.qty}x)`).join('\n')
    const msg = encodeURIComponent(
      `🎉 *GreenVest ডেলিভারি সম্পন্ন*\n\nনমস্কার ${o.userName},\nআপনার অর্ডার #${o.id.slice(0, 6)} সফলভাবে ডেলিভারি করা হয়েছে।\n\n📦 *সামগ্রী:*\n${itemsText}\n\n💰 মোট: ₹${o.total}\n💵 সংগৃহীত ক্যাশ: ₹${balance}\n\nধন্যবাদ! তাজা শাকসবজির জন্য আবার GreenVest ব্যবহার করুন 🌱`
    )
    window.open(`https://wa.me/${waDigits}?text=${msg}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="page narrow rider-page">
      <div className="rider-header">
        <h1>🛵 {lang === 'bn' ? 'রাইডার লাইভ ডেলিভারি ড্যাশবোর্ড' : 'Rider Live Delivery View'}</h1>
        {(user.role === 'seller' || user.role === 'admin') && (
          <Link to="/seller" className="btn btn-ghost btn-sm">
            {lang === 'bn' ? '← সেলার হোম' : '← Seller Home'}
          </Link>
        )}
      </div>

      {/* Daily Settlement Summary Counter */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', padding: '0.85rem', borderRadius: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#166534' }}>₹{cashCollectedToday}</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{lang === 'bn' ? 'আজকের সংগৃহীত ক্যাশ' : 'Cash Collected Today'}</div>
        </div>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', padding: '0.85rem', borderRadius: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#2563eb' }}>{deliveredToday.length} / {deliveredToday.length + activeDeliveries.length}</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{lang === 'bn' ? 'সম্পন্ন ডেলিভারি স্টপ' : 'Delivered Stops'}</div>
        </div>
      </div>

      {/* Filter Tabs for Rider */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
        <button
          type="button"
          onClick={() => setTab('active')}
          style={{
            flex: 1, padding: '0.5rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '0.8rem', fontWeight: 600,
            background: tab === 'active' ? '#166534' : '#f3f4f6',
            color: tab === 'active' ? 'white' : '#374151',
          }}
        >
          ⚡ {lang === 'bn' ? 'চলমান' : 'Active'} ({activeDeliveries.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('done')}
          style={{
            flex: 1, padding: '0.5rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '0.8rem', fontWeight: 600,
            background: tab === 'done' ? '#166534' : '#f3f4f6',
            color: tab === 'done' ? 'white' : '#374151',
          }}
        >
          ✅ {lang === 'bn' ? 'সম্পন্ন' : 'Done'} ({deliveredToday.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('all')}
          style={{
            flex: 1, padding: '0.5rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '0.8rem', fontWeight: 600,
            background: tab === 'all' ? '#166534' : '#f3f4f6',
            color: tab === 'all' ? 'white' : '#374151',
          }}
        >
          📋 {lang === 'bn' ? 'সব' : 'All'} ({orders.length})
        </button>
      </div>

      {/* Live Rider Notification Banner */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.65rem 0.85rem', borderRadius: '10px', fontSize: '0.85rem', color: '#166534', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>🔔 <strong>{activeDeliveries.length}</strong> {lang === 'bn' ? 'টি অ্যাক্টিভ ডেলিভারি বরাদ্দ হয়েছে' : 'active deliveries assigned'}</span>
        <span style={{ fontSize: '0.75rem', background: '#22c55e', color: 'white', padding: '0.15rem 0.4rem', borderRadius: '6px', fontWeight: 600 }}>LIVE ⚡</span>
      </div>

      {displayedOrders.length === 0 ? (
        <p className="empty text-center" style={{ padding: '2rem 0' }}>
          🎉 {lang === 'bn' ? 'কোনো অর্ডারের তালিকা নেই।' : 'No orders found for this view.'}
        </p>
      ) : (
        <div className="rider-orders-list">
          {displayedOrders.map((o, idx) => {
            const balance = Math.max(0, o.total - o.advanceAmount)
            const mapUrl = o.geoLat && o.geoLng
              ? `https://www.google.com/maps/search/?api=1&query=${o.geoLat},${o.geoLng}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address} PIN ${o.pin}`)}`
            return (
              <div key={o.id} className="rider-order-card">
                <div className="rider-card-top">
                  <span className="stop-num">Stop #{idx + 1}</span>
                  <span className="slot-tag" style={{ background: o.status === 'delivered' ? '#dcfce7' : undefined, color: o.status === 'delivered' ? '#166534' : undefined }}>
                    {o.status === 'delivered' ? '✅ Delivered' : '⚡ Guaranteed Delivery'}
                  </span>
                </div>

                <div className="rider-cust-info">
                  <h2>{o.userName}</h2>
                  <p className="rider-address">📍 {o.address} (PIN {o.pin})</p>
                </div>

                <div className="rider-items-summary">
                  {o.items.map((it) => (
                    <span key={`${it.productId}-${it.grade}`} className="rider-item-chip">
                      {it.emoji} {it.name} × {it.qty}
                    </span>
                  ))}
                </div>

                <div className="rider-balance-card">
                  <span>{lang === 'bn' ? 'কাস্টমারের থেকে সংগ্রহ করুন:' : 'Collect Balance on Arrival:'}</span>
                  <strong className="balance-amount">₹{balance}</strong>
                </div>

                <div className="rider-actions-grid" style={{ flexWrap: 'wrap' }}>
                  <a href={`tel:${o.phone}`} className="btn btn-secondary rider-btn">
                    📞 Call
                  </a>
                  <button type="button" onClick={() => sendOutForDeliveryWA(o.phone, o.userName, o.id)} className="btn btn-secondary rider-btn">
                    💬 WhatsApp Alert
                  </button>
                  <a href={mapUrl} className="btn btn-secondary rider-btn" target="_blank" rel="noopener noreferrer" style={o.geoLat && o.geoLng ? { background: '#dcfce7', color: '#166534', fontWeight: 600 } : {}}>
                    {o.geoLat && o.geoLng ? '📍 GPS Maps' : '🗺️ Maps'}
                  </a>
                </div>

                {o.status !== 'delivered' ? (
                  (o.utrVerified || o.status === 'confirmed' || o.status === 'advance_paid') ? (
                    <button
                      type="button"
                      className="btn btn-primary rider-complete-btn"
                      disabled={completingId === o.id}
                      onClick={() => handleCompleteDelivery(o)}
                    >
                      {completingId === o.id ? '⏳...' : `✓ ${lang === 'bn' ? `ডেলিভারি ও ক্যাশ (₹${balance}) সম্পন্ন` : `Mark Delivered & Collect ₹${balance}`}`}
                    </button>
                  ) : (
                    <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#fef3c7', border: '1px solid #fde047', borderRadius: '8px', fontSize: '0.8rem', color: '#92400e', textAlign: 'center', fontWeight: 600 }}>
                      ⏳ {lang === 'bn' ? 'সেলার কর্তৃক পেমেন্ট যাচাই অপেক্ষমাণ' : 'Payment Verification Pending from Seller'}
                    </div>
                  )
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: '0.5rem', background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0', fontWeight: 600, fontSize: '0.85rem' }}
                    onClick={() => sendDeliveredInvoiceWA(o)}
                  >
                    🧾 {lang === 'bn' ? 'কাস্টমারকে WhatsApp রসিদ পাঠান' : 'Send WhatsApp Invoice'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
