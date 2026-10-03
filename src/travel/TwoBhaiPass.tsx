// ============================================================
// TWO BHAI TRAVELS — Digital VIP Boarding Pass
// Shown after a confirmed booking. Realtime status updates via WebSocket.
// ============================================================
import { useEffect, useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { fetchTravelBookingByCode, subscribeTravelBooking } from './travelApi'
import { buildWhatsAppBookingMsg, TRAVEL_CONFIG } from './travelConfig'
import type { TravelBooking } from './travelTypes'

// Web Audio chime — same pattern as Layout.tsx
function playStatusChime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    ;[523.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain()
      osc.type = 'sine'; osc.frequency.value = freq
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.1)
      g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + i * 0.1 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3)
      osc.connect(g); g.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.1); osc.stop(ctx.currentTime + i * 0.1 + 0.32)
    })
    if ('vibrate' in navigator) navigator.vibrate([200, 80, 200])
  } catch { /* silent */ }
}

const STATUS_STEPS: TravelBooking['status'][] = ['pending', 'confirmed', 'dispatched', 'completed']
const STATUS_LABELS: Record<TravelBooking['status'], { bn: string; en: string; icon: string }> = {
  pending:    { bn: 'বুকিং গৃহীত',     en: 'Booking Received',    icon: '📋' },
  confirmed:  { bn: 'ড্রাইভার নিশ্চিত',  en: 'Driver Confirmed',    icon: '✅' },
  dispatched: { bn: 'গাড়ি রওনা দিয়েছে', en: 'Car Dispatched',       icon: '🚗' },
  completed:  { bn: 'ট্রিপ সম্পন্ন',     en: 'Trip Completed',      icon: '🏁' },
  cancelled:  { bn: 'বাতিল',            en: 'Cancelled',           icon: '❌' },
}

function StatusBar({ status }: { status: TravelBooking['status'] }) {
  const steps = STATUS_STEPS
  const idx = steps.indexOf(status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '1rem 0' }}>
      {steps.map((s, i) => {
        const done = i <= idx
        const active = i === idx
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ textAlign: 'center', flex: 'none' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '0.75rem',
                background: done ? (active ? '#F59E0B' : '#10B981') : 'rgba(255,255,255,0.1)',
                boxShadow: active ? '0 0 10px rgba(245,158,11,0.6)' : 'none',
                transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)',
              }}>
                {STATUS_LABELS[s].icon}
              </div>
              <div style={{ fontSize: '0.58rem', marginTop: 3, color: done ? '#94A3B8' : '#475569', maxWidth: 54 }}>
                {STATUS_LABELS[s].bn}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: '0 2px', marginBottom: 18,
                background: i < idx ? '#10B981' : 'rgba(255,255,255,0.1)',
                transition: 'background 0.5s ease',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function TwoBhaiPass() {
  const { code } = useParams<{ code: string }>()
  const location = useLocation()
  const [booking, setBooking] = useState<TravelBooking | null>(
    (location.state as { booking?: TravelBooking })?.booking ?? null,
  )
  const [loading, setLoading] = useState(!booking)
  const prevStatusRef = { current: booking?.status }

  // Fetch if not passed via state
  useEffect(() => {
    if (booking || !code) return
    fetchTravelBookingByCode(code)
      .then(b => { setBooking(b); setLoading(false) })
      .catch(() => setLoading(false))
  }, [code, booking])

  // Realtime subscription — chime on status change
  useEffect(() => {
    if (!code) return
    return subscribeTravelBooking(code, (updated) => {
      if (prevStatusRef.current !== updated.status) {
        playStatusChime()
        prevStatusRef.current = updated.status
      }
      setBooking(updated)
    })
  }, [code])

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0F1D', color: '#94A3B8' }}>
        ⏳ বুকিং লোড হচ্ছে...
      </div>
    )
  }
  if (!booking) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0A0F1D', gap: '1rem' }}>
        <p style={{ color: '#94A3B8' }}>বুকিং খুঁজে পাওয়া যায়নি।</p>
        <Link to="/" style={{ color: '#FBBF24', fontWeight: 700 }}>← হোমে ফিরে যান</Link>
      </div>
    )
  }

  const isConfirmed = ['confirmed', 'dispatched', 'completed'].includes(booking.status)
  const isCancelled = booking.status === 'cancelled'

  const waLink = buildWhatsAppBookingMsg({
    bookingCode: booking.bookingCode,
    customerName: booking.customerName,
    customerPhone: booking.customerPhone,
    pickupAddress: booking.pickupAddress,
    dropAddress: booking.dropAddress,
    pickupDate: booking.pickupDate,
    pickupTime: booking.pickupTime,
    passengers: booking.passengers,
    estimatedFare: booking.estimatedFare,
    advanceAmount: booking.advanceAmount,
    balanceDue: booking.balanceDue,
  })

  return (
    <div style={{ minHeight: '100vh', background: '#0A0F1D', color: '#F8FAFC', padding: '5rem 1rem 2rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 500, margin: '0 auto' }}>

        {/* ── VIP Boarding Pass Card */}
        <div style={{
          background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(20px)',
          border: `1px solid ${isCancelled ? 'rgba(220,38,38,0.4)' : isConfirmed ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.3)'}`,
          borderRadius: '20px', padding: '1.5rem',
          boxShadow: `0 8px 40px ${isConfirmed ? 'rgba(16,185,129,0.15)' : 'rgba(0,0,0,0.5)'}`,
          transition: 'border-color 0.6s ease, box-shadow 0.6s ease',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#FBBF24' }}>
                🎫 ডিজিটাল ট্রিপ পাস
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748B' }}>Two Bhai Travels · Digital Boarding Pass</p>
            </div>
            <div style={{
              padding: '4px 12px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
              background: isCancelled ? 'rgba(220,38,38,0.15)' : isConfirmed ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
              color: isCancelled ? '#FCA5A5' : isConfirmed ? '#34D399' : '#FBBF24',
              border: `1px solid ${isCancelled ? 'rgba(220,38,38,0.3)' : isConfirmed ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
            }}>
              {STATUS_LABELS[booking.status].icon} {STATUS_LABELS[booking.status].bn}
            </div>
          </div>

          {/* Booking code */}
          <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 }}>বুকিং কোড</p>
            <p style={{ margin: '4px 0 0', fontSize: '1.6rem', fontWeight: 800, color: '#FBBF24', letterSpacing: '2px' }}>{booking.bookingCode}</p>
          </div>

          {/* Progress bar */}
          {!isCancelled && <StatusBar status={booking.status} />}
          {isCancelled && (
            <div style={{ padding: '10px', background: 'rgba(220,38,38,0.1)', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.82rem', color: '#FCA5A5' }}>
              ❌ বুকিং বাতিল: {booking.cancellationReason || 'No reason provided'}
            </div>
          )}

          {/* Route */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '10px' }}>
              <p style={{ margin: 0, fontSize: '0.65rem', color: '#64748B', textTransform: 'uppercase' }}>পিকআপ</p>
              <p style={{ margin: '3px 0 0', fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.3 }}>{booking.pickupAddress}</p>
            </div>
            <div style={{ color: '#FBBF24', fontSize: '1.2rem' }}>→</div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '10px' }}>
              <p style={{ margin: 0, fontSize: '0.65rem', color: '#64748B', textTransform: 'uppercase' }}>গন্তব্য</p>
              <p style={{ margin: '3px 0 0', fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.3 }}>{booking.dropAddress}</p>
            </div>
          </div>

          {/* Trip details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '1rem' }}>
            {[
              { label: 'তারিখ', value: booking.pickupDate },
              { label: 'সময়', value: booking.pickupTime },
              { label: 'যাত্রী', value: `${booking.passengers} জন` },
            ].map(d => (
              <div key={d.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '8px' }}>
                <p style={{ margin: 0, fontSize: '0.62rem', color: '#64748B', textTransform: 'uppercase' }}>{d.label}</p>
                <p style={{ margin: '3px 0 0', fontWeight: 700, fontSize: '0.82rem' }}>{d.value}</p>
              </div>
            ))}
          </div>

          {/* Financial */}
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '10px', marginBottom: '1rem', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#94A3B8' }}>আনুমানিক ভাড়া:</span><span style={{ fontWeight: 700 }}>₹{booking.estimatedFare}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}><span style={{ color: '#94A3B8' }}>অগ্রিম পেমেন্ট:</span><span style={{ fontWeight: 700, color: '#34D399' }}>₹{booking.advanceAmount}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}><span style={{ color: '#94A3B8' }}>ট্রিপ শেষে ড্রাইভারকে:</span><span style={{ fontWeight: 700, color: '#FBBF24' }}>₹{booking.balanceDue}</span></div>
            {booking.utr && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.72rem', color: '#64748B' }}>
                UTR: {booking.utr} {booking.utrVerified ? '✅ Verified' : '⏳ Pending'}
              </div>
            )}
          </div>

          {/* Driver info (once confirmed) */}
          {isConfirmed && (booking.driverName || booking.carNumber) && (
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '12px', padding: '12px', marginBottom: '1rem' }}>
              <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 700, color: '#34D399', textTransform: 'uppercase' }}>✅ ড্রাইভার তথ্য</p>
              {booking.driverName && <p style={{ margin: '0 0 3px', fontWeight: 700 }}>👤 {booking.driverName}</p>}
              {booking.carNumber && <p style={{ margin: '0 0 3px', color: '#94A3B8' }}>🚘 {booking.carNumber} · {booking.carType}</p>}
              {booking.driverPhone && (
                <a href={`tel:${booking.driverPhone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '8px 14px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', color: '#34D399', textDecoration: 'none', fontWeight: 700, fontSize: '0.85rem' }}>
                  📞 ড্রাইভারকে কল করুন ({booking.driverPhone})
                </a>
              )}
            </div>
          )}

          <p style={{ margin: '0 0 1rem', fontSize: '0.72rem', color: '#475569' }}>
            ⚠️ টোল ট্যাক্স ও পার্কিং চার্জ আলাদা (রসিদ অনুযায়ী)।
          </p>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a href={`tel:${TRAVEL_CONFIG.primaryPhone}`} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '13px', borderRadius: '12px', textDecoration: 'none', fontWeight: 700,
              background: 'linear-gradient(135deg,#F59E0B,#D97706)', color: '#0A0F1D',
              boxShadow: '0 4px 16px rgba(245,158,11,0.3)', fontSize: '0.95rem',
            }}>
              📞 Two Bhai Travels-এ কল করুন
            </a>
            <a href={waLink} target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '13px', borderRadius: '12px', textDecoration: 'none', fontWeight: 700,
              background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)',
              color: '#25D366', fontSize: '0.95rem',
            }}>
              🟢 WhatsApp-এ বুকিং পাঠান
            </a>
            <Link to="/" style={{
              display: 'block', textAlign: 'center', padding: '10px',
              color: '#64748B', fontSize: '0.82rem', textDecoration: 'none',
            }}>
              ← নতুন বুকিং করুন
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
