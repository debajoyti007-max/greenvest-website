import { useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { formatWhatsAppPhone } from '../lib/whatsapp'
import { showToast } from '../components/Toast'

export default function RiderView() {
  const { user } = useAuth()
  const { orders, lang, updateOrderStatus } = useStore()

  if (!user || (user.role !== 'rider' && user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const activeDeliveries = useMemo(() => {
    return orders
      .filter((o) => o.status === 'confirmed')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [orders])

  const deliveredToday = useMemo(() => {
    return orders.filter((o) => o.status === 'delivered')
  }, [orders])

  const cashCollectedToday = useMemo(() => {
    return deliveredToday.reduce((sum, o) => sum + Math.max(0, o.total - o.advanceAmount), 0)
  }, [deliveredToday])

  const handleCompleteDelivery = async (orderId: string, userName: string) => {
    await updateOrderStatus(orderId, 'delivered')
    showToast(lang === 'bn' ? `✅ ${userName}-এর অর্ডার ডেলিভারি সম্পন্ন হয়েছে!` : `✅ Order for ${userName} delivered!`, '🎉')
  }

  const sendOutForDeliveryWA = (phone: string, userName: string, id: string) => {
    const waDigits = formatWhatsAppPhone(phone)
    const msg = encodeURIComponent(
      `নমস্কার ${userName}, আপনার GreenVest অর্ডার #${id.slice(0, 6)} রাইডারের কাছে ডেলিভারির জন্য রওয়ানা হয়েছে! 🛵`
    )
    window.open(`https://wa.me/${waDigits}?text=${msg}`, '_blank')
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

      {/* Live Rider Notification Banner */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.65rem 0.85rem', borderRadius: '10px', fontSize: '0.85rem', color: '#166534', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>🔔 <strong>{activeDeliveries.length}</strong> {lang === 'bn' ? 'টি অ্যাক্টিভ ডেলিভারি বরাদ্দ হয়েছে' : 'active deliveries assigned'}</span>
        <span style={{ fontSize: '0.75rem', background: '#22c55e', color: 'white', padding: '0.15rem 0.4rem', borderRadius: '6px', fontWeight: 600 }}>LIVE ⚡</span>
      </div>

      {activeDeliveries.length === 0 ? (
        <p className="empty text-center" style={{ padding: '2rem 0' }}>
          🎉 {lang === 'bn' ? 'আজকের সব ডেলিভারি সম্পন্ন হয়েছে!' : 'All deliveries completed for now!'}
        </p>
      ) : (
        <div className="rider-orders-list">
          {activeDeliveries.map((o, idx) => {
            const balance = Math.max(0, o.total - o.advanceAmount)
            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address} PIN ${o.pin}`)}`
            return (
              <div key={o.id} className="rider-order-card">
                <div className="rider-card-top">
                  <span className="stop-num">Stop #{idx + 1}</span>
                  <span className="slot-tag">⚡ Guaranteed Delivery</span>
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
                    💬 WhatsApp Alert (Optional)
                  </button>
                  <a href={mapUrl} className="btn btn-secondary rider-btn" target="_blank" rel="noopener noreferrer">
                    🗺️ Maps
                  </a>
                </div>

                <button
                  type="button"
                  className="btn btn-primary rider-complete-btn"
                  onClick={() => handleCompleteDelivery(o.id, o.userName)}
                >
                  ✓ {lang === 'bn' ? 'ডেলিভারি সম্পন্ন হয়েছে চিহ্নিত করুন' : 'Mark as Delivered & Collect Cash'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
