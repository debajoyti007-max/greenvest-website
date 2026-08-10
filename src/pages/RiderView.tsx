import { useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { formatWhatsAppPhone } from '../lib/whatsapp'

export default function RiderView() {
  const { user } = useAuth()
  const { orders, lang, updateOrderStatus } = useStore()

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const activeDeliveries = useMemo(() => {
    return orders
      .filter((o) => o.status === 'confirmed')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [orders])

  const handleCompleteDelivery = async (orderId: string) => {
    await updateOrderStatus(orderId, 'delivered')
  }

  return (
    <div className="page narrow rider-page">
      <div className="rider-header">
        <h1>🛵 {lang === 'bn' ? 'রাইডার ডেলিভারি ড্যাশবোর্ড' : 'Rider Delivery View'}</h1>
        <Link to="/seller" className="btn btn-ghost btn-sm">
          {lang === 'bn' ? '← সেলার হোম' : '← Seller Home'}
        </Link>
      </div>

      <div className="rider-summary-badge">
        <span>📍 {lang === 'bn' ? 'চলমান ডেলিভারি:' : 'Active Deliveries:'} <strong>{activeDeliveries.length}</strong></span>
      </div>

      {activeDeliveries.length === 0 ? (
        <p className="empty text-center" style={{ padding: '2rem 0' }}>
          🎉 {lang === 'bn' ? 'আজকের সব ডেলিভারি সম্পন্ন হয়েছে!' : 'All deliveries completed for now!'}
        </p>
      ) : (
        <div className="rider-orders-list">
          {activeDeliveries.map((o, idx) => {
            const balance = o.total - o.advanceAmount
            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address} PIN ${o.pin}`)}`
            return (
              <div key={o.id} className="rider-order-card">
                <div className="rider-card-top">
                  <span className="stop-num">Stop #{idx + 1}</span>
                  <span className="slot-tag">⚡ 12–24h Delivery</span>
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

                <div className="rider-actions-grid">
                  <a href={`tel:${o.phone}`} className="btn btn-secondary rider-btn">
                    📞 Call
                  </a>
                  <a href={`https://wa.me/${formatWhatsAppPhone(o.phone)}`} className="btn btn-secondary rider-btn" target="_blank" rel="noopener noreferrer">
                    💬 WhatsApp
                  </a>
                  <a href={mapUrl} className="btn btn-secondary rider-btn" target="_blank" rel="noopener noreferrer">
                    🗺️ Maps
                  </a>
                </div>

                <button
                  type="button"
                  className="btn btn-primary rider-complete-btn"
                  onClick={() => void handleCompleteDelivery(o.id)}
                >
                  ✅ {lang === 'bn' ? 'ডেলিভারি সম্পন্ন করুন' : 'Mark Delivered & Collected ₹' + balance}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
