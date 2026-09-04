import { useMemo, useState, useEffect, useRef } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { showToast } from '../components/Toast'
import { getOrderDeliveryOtp } from '../lib/business'
import { generateDynamicUpiQr } from '../lib/payment'
import { STORE_LOCATION, calculateDistanceKm } from '../lib/delivery'
import type { Order } from '../types'

type RiderTab = 'active' | 'upcoming' | 'done' | 'all'

// 🔔 Pleasant Melodic Web Audio Chime & Vibration for Rider Dispatch
function playRiderChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    // 3-tone ascending alert (E5 -> A5 -> C6)
    const notes = [659.25, 880.00, 1046.50]
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.1)
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + idx * 0.1 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.25)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + idx * 0.1)
      osc.stop(ctx.currentTime + idx * 0.1 + 0.28)
    })
    if ('vibrate' in navigator) {
      navigator.vibrate([250, 100, 250])
    }
  } catch (err) {
    console.debug('Rider audio chime blocked:', err)
  }
}

export default function RiderView() {
  const { user } = useAuth()
  const { orders, lang, updateOrderStatus } = useStore()
  const [tab, setTab] = useState<RiderTab>('active')
  const [completingId, setCompletingId] = useState<string | null>(null)

  // Audio sound toggle persisted in localStorage
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('gv_rider_sound') !== 'false'
  })

  // Smart Route Sequencer toggle (by PIN / proximity)
  const [routeOptimized, setRouteOptimized] = useState<boolean>(false)

  // OTP Verification Modal State
  const [otpModalOrder, setOtpModalOrder] = useState<Order | null>(null)
  const [inputOtp, setInputOtp] = useState<string>('')
  const [otpError, setOtpError] = useState<string>('')

  // Dynamic UPI QR Modal State
  const [qrModalOrder, setQrModalOrder] = useState<Order | null>(null)
  const [dynamicQrData, setDynamicQrData] = useState<string>('')
  const [qrLoading, setQrLoading] = useState<boolean>(false)

  const todayIso = new Date().toISOString().split('T')[0]

  // All non-pending deliveries assigned to delivery pool
  const allActive = useMemo(() => {
    return orders.filter((o) => o.status === 'confirmed' || o.status === 'out_for_delivery')
  }, [orders])

  // 1. Today's Deliveries: Standard (12–24h) + orders scheduled for today or past due
  const activeToday = useMemo(() => {
    return allActive.filter((o) => {
      return !o.deliveryDate || o.deliveryDate === 'standard' || o.deliveryDate <= todayIso
    })
  }, [allActive, todayIso])

  // 2. Upcoming Deliveries: Scheduled for future dates
  const upcomingScheduled = useMemo(() => {
    return allActive
      .filter((o) => Boolean(o.deliveryDate && o.deliveryDate !== 'standard' && o.deliveryDate > todayIso))
      .sort((a, b) => (a.deliveryDate || '').localeCompare(b.deliveryDate || ''))
  }, [allActive, todayIso])

  // 3. Delivered Today
  const deliveredToday = useMemo(() => {
    const today = new Date().toDateString()
    return orders.filter((o) => o.status === 'delivered' && new Date(o.createdAt).toDateString() === today)
  }, [orders])

  // 4. Cash collected today
  const cashCollectedToday = useMemo(() => {
    return deliveredToday.reduce((sum, o) => sum + Math.max(0, o.total - o.advanceAmount), 0)
  }, [deliveredToday])

  // 5. All deliveries (excluding pending)
  const allDeliveries = useMemo(() => {
    return orders.filter((o) => o.status !== 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [orders])

  // 6. Smart Route Sequencer for Active Today
  const sortedActiveToday = useMemo(() => {
    const list = [...activeToday]
    if (!routeOptimized) {
      return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    }
    // Sort by PIN group and GPS distance from store location
    return list.sort((a, b) => {
      const pinA = a.pin || ''
      const pinB = b.pin || ''
      if (pinA !== pinB) {
        return pinA.localeCompare(pinB)
      }
      if (a.geoLat && a.geoLng && b.geoLat && b.geoLng) {
        const distA = calculateDistanceKm(STORE_LOCATION.lat, STORE_LOCATION.lng, a.geoLat, a.geoLng)
        const distB = calculateDistanceKm(STORE_LOCATION.lat, STORE_LOCATION.lng, b.geoLat, b.geoLng)
        return distA - distB
      }
      return a.createdAt.localeCompare(b.createdAt)
    })
  }, [activeToday, routeOptimized])

  // Active displayed list based on active tab
  const displayedOrders = useMemo(() => {
    if (tab === 'upcoming') return upcomingScheduled
    if (tab === 'done') return deliveredToday
    if (tab === 'all') return allDeliveries
    return sortedActiveToday
  }, [tab, sortedActiveToday, upcomingScheduled, deliveredToday, allDeliveries])

  // 🔔 Live Audio Chime on New Dispatched Orders
  const prevCount = useRef(activeToday.length)
  useEffect(() => {
    if (activeToday.length > prevCount.current) {
      if (soundEnabled) {
        playRiderChime()
        showToast(
          lang === 'bn'
            ? '🛵 নতুন কনফার্মড ডেলিভারি আপনার রুটে যোগ হয়েছে!'
            : '🛵 New confirmed delivery assigned to your route!',
          '🔔',
        )
      }
    }
    prevCount.current = activeToday.length
  }, [activeToday.length, soundEnabled, lang])

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem('gv_rider_sound', String(next))
    if (next) playRiderChime()
    showToast(next ? '🔊 নোটিফিকেশন সাউন্ড চালু' : '🔇 সাউন্ড বন্ধ', '🔔')
  }

  if (!user || (user.role !== 'rider' && user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  // Open OTP verification modal
  const handleOpenOtpModal = (o: Order) => {
    setOtpModalOrder(o)
    setInputOtp('')
    setOtpError('')
  }

  // Verify OTP and complete delivery (Mandatory OTP verification)
  const handleVerifyOtpAndDeliver = async () => {
    if (!otpModalOrder) return
    const expectedOtp = getOrderDeliveryOtp(otpModalOrder)

    if (!inputOtp.trim() || inputOtp.trim() !== expectedOtp) {
      setOtpError(
        lang === 'bn'
          ? '❌ ভুল ওটিপি। কাস্টমারের ট্র্যাকিং স্ক্রিনে প্রদর্শিত ৪ সংখ্যার ওটিপি দিন।'
          : '❌ Incorrect OTP. Ask the customer for the 4-digit code on their order screen.',
      )
      return
    }

    try {
      setCompletingId(otpModalOrder.id)
      await updateOrderStatus(otpModalOrder.id, 'delivered')
      const targetOrder = otpModalOrder
      setOtpModalOrder(null)
      showToast(
        lang === 'bn'
          ? `✅ ${targetOrder.userName}-এর অর্ডার সফলভাবে ডেলিভারি সম্পন্ন হয়েছে!`
          : `✅ Order for ${targetOrder.userName} delivered!`,
        '🎉',
      )
    } finally {
      setCompletingId(null)
    }
  }

  // Open Dynamic UPI QR code modal
  const handleOpenQrModal = async (o: Order) => {
    setQrModalOrder(o)
    setQrLoading(true)
    try {
      const balance = Math.max(0, o.total - o.advanceAmount)
      const shortId = o.id.slice(0, 6).toUpperCase()
      const qrData = await generateDynamicUpiQr(balance, `GreenVest Order ${shortId}`)
      setDynamicQrData(qrData)
    } catch (err) {
      console.error('QR code generation error:', err)
      setDynamicQrData('')
    } finally {
      setQrLoading(false)
    }
  }

  const copyDeliveryNotice = async (userName: string, id: string) => {
    const msg = `নমস্কার ${userName}, আপনার GreenVest অর্ডার #${id.slice(0, 6)} রাইডারের কাছে ডেলিভারির জন্য রওয়ানা হয়েছে! 🛵`
    try {
      await navigator.clipboard.writeText(msg)
      showToast(lang === 'bn' ? 'বার্তা কপি হয়েছে!' : 'Notice copied!', '📋')
    } catch {}
  }

  const copyDeliveredInvoice = async (o: Order) => {
    const balance = Math.max(0, o.total - o.advanceAmount)
    const itemsText = o.items.map((it) => `• ${it.name} (${it.qty}x)`).join('\n')
    const msg = `🎉 GreenVest ডেলিভারি সম্পন্ন\n\nনমস্কার ${o.userName},\nআপনার অর্ডার #${o.id.slice(0, 6)} সফলভাবে ডেলিভারি করা হয়েছে।\n\n📦 সামগ্রী:\n${itemsText}\n\n💰 মোট: ₹${o.total}\n💵 সংগৃহীত ক্যাশ: ₹${balance}\n\nধন্যবাদ! তাজা শাকসবজির জন্য আবার GreenVest ব্যবহার করুন 🌱`
    if (navigator.share) {
      try {
        await navigator.share({
          title: `GreenVest Delivery #${o.id.slice(0, 6)}`,
          text: msg,
        })
        return
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(msg)
      showToast(lang === 'bn' ? 'রসিদ কপি হয়েছে!' : 'Receipt copied!', '📋')
    } catch {}
  }

  return (
    <div className="page narrow rider-page">
      <div className="rider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>
            🛵 {lang === 'bn' ? 'রাইডার লাইভ ডেলিভারি' : 'Rider Live Delivery'}
          </h1>
          <button
            type="button"
            onClick={toggleSound}
            title={soundEnabled ? 'Mute Chime' : 'Unmute Chime'}
            style={{
              background: soundEnabled ? '#dcfce7' : '#f1f5f9',
              border: `1px solid ${soundEnabled ? '#86efac' : '#cbd5e1'}`,
              borderRadius: '20px',
              padding: '0.2rem 0.5rem',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {soundEnabled ? '🔔 Sound ON' : '🔕 Muted'}
          </button>
        </div>

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
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#2563eb' }}>
            {deliveredToday.length} / {deliveredToday.length + activeToday.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{lang === 'bn' ? 'আজকের ডেলিভারি স্টপ' : 'Today Stops Done'}</div>
        </div>
      </div>

      {/* Filter Tabs for Rider */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', overflowX: 'auto', paddingBottom: '2px' }}>
        <button
          type="button"
          onClick={() => setTab('active')}
          style={{
            flex: 1, padding: '0.5rem 0.4rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap',
            background: tab === 'active' ? '#166534' : '#f3f4f6',
            color: tab === 'active' ? 'white' : '#374151',
          }}
        >
          ⚡ {lang === 'bn' ? 'আজকের' : 'Today'} ({activeToday.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('upcoming')}
          style={{
            flex: 1, padding: '0.5rem 0.4rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap',
            background: tab === 'upcoming' ? '#166534' : '#f3f4f6',
            color: tab === 'upcoming' ? 'white' : '#374151',
          }}
        >
          🗓️ {lang === 'bn' ? 'শিডিউল্ড' : 'Upcoming'} ({upcomingScheduled.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('done')}
          style={{
            flex: 1, padding: '0.5rem 0.4rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap',
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
            flex: 1, padding: '0.5rem 0.4rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap',
            background: tab === 'all' ? '#166534' : '#f3f4f6',
            color: tab === 'all' ? 'white' : '#374151',
          }}
        >
          📋 {lang === 'bn' ? 'সব' : 'All'} ({allDeliveries.length})
        </button>
      </div>

      {/* Live Route Sequencer & Action Bar (When in Active Tab) */}
      {tab === 'active' && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.65rem 0.85rem', borderRadius: '10px', fontSize: '0.85rem', color: '#166534', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>🔔 <strong>{activeToday.length}</strong> {lang === 'bn' ? 'টি স্টপ বাকি' : 'active stops left'}</span>
            <span style={{ fontSize: '0.7rem', background: '#22c55e', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '6px', fontWeight: 700 }}>LIVE ⚡</span>
          </div>

          <button
            type="button"
            onClick={() => setRouteOptimized(!routeOptimized)}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: '8px',
              border: '1.5px solid #166534',
              background: routeOptimized ? '#166534' : '#ffffff',
              color: routeOptimized ? '#ffffff' : '#166534',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            🧭 {routeOptimized ? (lang === 'bn' ? '✓ রুট সাজানো (PIN)' : '✓ Route Optimized') : (lang === 'bn' ? 'রুট সাজান (PIN)' : 'Optimize Route')}
          </button>
        </div>
      )}

      {/* Upcoming Tab Notice Banner */}
      {tab === 'upcoming' && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.65rem 0.85rem', borderRadius: '10px', fontSize: '0.82rem', color: '#1e40af', marginBottom: '1rem' }}>
          🗓️ <strong>{lang === 'bn' ? 'আসন্ন তারিখের শিডিউল্ড অর্ডার:' : 'Upcoming Scheduled Orders:'}</strong> {lang === 'bn' ? 'এই অর্ডারগুলো তাদের নির্ধারিত দিনে ডেলিভারি করতে হবে।' : 'These orders are booked for future dates. Deliver on the scheduled day.'}
        </div>
      )}

      {displayedOrders.length === 0 ? (
        <p className="empty text-center" style={{ padding: '2rem 0' }}>
          🎉 {lang === 'bn' ? 'কোনো অর্ডারের তালিকা নেই।' : 'No orders found for this view.'}
        </p>
      ) : (
        <div className="rider-orders-list">
          {displayedOrders.map((o, idx) => {
            const balance = Math.max(0, o.total - o.advanceAmount)
            const destParam = (o.geoLat && o.geoLng)
              ? `${o.geoLat},${o.geoLng}`
              : encodeURIComponent(`${o.address}, ${o.pin || ''}, West Bengal`)
            const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${destParam}&travelmode=driving`

            return (
              <div key={o.id} className="rider-order-card">
                <div className="rider-card-top">
                  <span className="stop-num">Stop #{idx + 1}</span>
                  <span
                    className="slot-tag"
                    style={{
                      background: o.status === 'delivered' ? '#dcfce7' : o.deliveryDate && o.deliveryDate !== 'standard' ? '#eff6ff' : undefined,
                      color: o.status === 'delivered' ? '#166534' : o.deliveryDate && o.deliveryDate !== 'standard' ? '#1d4ed8' : undefined,
                      borderColor: o.deliveryDate && o.deliveryDate !== 'standard' ? '#bfdbfe' : undefined,
                    }}
                  >
                    {o.status === 'delivered' ? '✅ Delivered' : (o.deliveryDate && o.deliveryDate !== 'standard' ? `📅 ${o.deliveryDate}` : '⚡ 12–24h')}
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

                {/* Balance Collection Box with 1-Tap Dynamic UPI QR */}
                <div className="rider-balance-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.76rem', color: '#6b7280' }}>
                      {lang === 'bn' ? 'কাস্টমারের থেকে সংগ্রহযোগ্য:' : 'Collect Balance on Arrival:'}
                    </span>
                    <strong className="balance-amount" style={{ fontSize: '1.25rem', color: '#166534' }}>₹{balance}</strong>
                  </div>

                  {balance > 0 && o.status !== 'delivered' && (
                    <button
                      type="button"
                      onClick={() => void handleOpenQrModal(o)}
                      className="btn btn-secondary btn-sm"
                      style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#166534', fontWeight: 700, fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                    >
                      💳 {lang === 'bn' ? 'UPI QR কোড' : 'UPI QR'}
                    </button>
                  )}
                </div>

                {/* Actions: Call, Notice, GPS Navigation */}
                <div className="rider-actions-grid" style={{ flexWrap: 'wrap' }}>
                  <a href={`tel:${o.phone}`} className="btn btn-secondary rider-btn">
                    📞 {lang === 'bn' ? 'ফোন' : 'Call'}
                  </a>
                  <button type="button" onClick={() => void copyDeliveryNotice(o.userName, o.id)} className="btn btn-secondary rider-btn">
                    📋 {lang === 'bn' ? 'বার্তা কপি' : 'Notice'}
                  </button>
                  <a
                    href={navUrl}
                    className="btn btn-primary rider-btn rider-nav-btn"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    🧭 {o.geoLat && o.geoLng
                      ? (lang === 'bn' ? 'GPS ম্যাপ ➔' : 'GPS Nav ➔')
                      : (lang === 'bn' ? 'ম্যাপে চলুন ➔' : 'Navigate ➔')}
                  </a>
                </div>

                {/* Handover OTP Verification Delivery Button */}
                {o.status !== 'delivered' ? (
                  <button
                    type="button"
                    className="btn btn-primary rider-complete-btn"
                    disabled={completingId === o.id}
                    onClick={() => handleOpenOtpModal(o)}
                  >
                    {completingId === o.id ? '⏳...' : `🔐 ${lang === 'bn' ? `ওটিপি দিয়ে ডেলিভারি সম্পন্ন (₹${balance})` : `Verify OTP & Collect ₹${balance}`}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: '0.5rem', background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0', fontWeight: 600, fontSize: '0.85rem' }}
                    onClick={() => void copyDeliveredInvoice(o)}
                  >
                    🧾 {lang === 'bn' ? 'ডেলিভারি রসিদ কপি / শেয়ার' : 'Copy / Share Delivery Invoice'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 🔐 4-Digit Handover OTP Modal */}
      {otpModalOrder && (
        <div className="modal-backdrop" role="presentation" onClick={() => setOtpModalOrder(null)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(400px, 94vw)',
              borderRadius: '16px',
              padding: '1.25rem',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '1rem', color: '#166534' }}>
                🔐 {lang === 'bn' ? 'ডেলিভারি ওটিপি যাচাই' : 'Delivery Handover OTP'}
              </strong>
              <button
                type="button"
                onClick={() => setOtpModalOrder(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#475569' }}>
              {lang === 'bn'
                ? `কাস্টমার ${otpModalOrder.userName}-এর কাছে থাকা ৪ সংখ্যার ওটিপিটি দিন:`
                : `Ask customer ${otpModalOrder.userName} for their 4-digit code:`}
            </p>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
              <div>💰 <strong>{lang === 'bn' ? 'সংগ্রহযোগ্য ক্যাশ:' : 'Balance to Collect:'}</strong> <span style={{ color: '#166534', fontWeight: 800 }}>₹{Math.max(0, otpModalOrder.total - otpModalOrder.advanceAmount)}</span></div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>📍 {otpModalOrder.address}</div>
            </div>

            <input
              type="tel"
              maxLength={4}
              value={inputOtp}
              onChange={(e) => {
                setInputOtp(e.target.value.replace(/\D/g, ''))
                setOtpError('')
              }}
              placeholder="••••"
              autoFocus
              style={{
                width: '100%',
                fontSize: '2rem',
                fontWeight: 800,
                textAlign: 'center',
                letterSpacing: '10px',
                padding: '0.6rem',
                borderRadius: '10px',
                border: '2px solid var(--primary, #166534)',
                marginBottom: '0.75rem',
                background: '#ffffff',
              }}
            />

            {otpError && (
              <div style={{ color: '#dc2626', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                {otpError}
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 700 }}
              disabled={completingId === otpModalOrder.id || inputOtp.length !== 4}
              onClick={() => void handleVerifyOtpAndDeliver()}
            >
              {completingId === otpModalOrder.id ? '⏳...' : `✓ ${lang === 'bn' ? 'যাচাই ও ডেলিভারি সম্পন্ন' : 'Verify & Mark Delivered'}`}
            </button>
          </div>
        </div>
      )}

      {/* 💳 Dynamic UPI Balance QR Code Modal */}
      {qrModalOrder && (
        <div className="modal-backdrop" role="presentation" onClick={() => setQrModalOrder(null)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(360px, 94vw)',
              borderRadius: '16px',
              padding: '1.25rem',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '1rem', color: '#166534' }}>
                💳 {lang === 'bn' ? 'UPI পেমেন্ট QR' : 'UPI Payment QR'}
              </strong>
              <button
                type="button"
                onClick={() => setQrModalOrder(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#166534', margin: '0.2rem 0' }}>
              ₹{Math.max(0, qrModalOrder.total - qrModalOrder.advanceAmount)}
            </div>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 0.85rem' }}>
              {lang === 'bn' ? 'PhonePe, GPay, Paytm বা যে কোনো UPI অ্যাপে স্ক্যান করুন' : 'Scan using PhonePe, GPay, Paytm, or any UPI app'}
            </p>

            <div style={{ margin: '0 auto 1rem', width: '220px', height: '220px', display: 'grid', placeItems: 'center', background: '#f8fafc', borderRadius: '12px', border: '1.5px solid #e2e8f0' }}>
              {qrLoading ? (
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>⏳ QR তৈরি হচ্ছে...</div>
              ) : dynamicQrData ? (
                <img src={dynamicQrData} alt="UPI QR" style={{ width: '200px', height: '200px', borderRadius: '8px' }} />
              ) : (
                <div style={{ fontSize: '0.8rem', color: '#dc2626' }}>QR তৈরি ব্যর্থ</div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.65rem', fontSize: '0.88rem', fontWeight: 700 }}
              onClick={() => {
                const target = qrModalOrder
                setQrModalOrder(null)
                handleOpenOtpModal(target)
              }}
            >
              ✓ {lang === 'bn' ? 'পেমেন্ট সম্পন্ন ➔ ওটিপি দিন' : 'Payment Received ➔ Enter OTP'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
