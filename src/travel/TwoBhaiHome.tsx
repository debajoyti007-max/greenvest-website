// ============================================================
// TWO BHAI TRAVELS — Main Homepage + 3D Hero + Booking Form
// Ponytail: pure CSS 3D, Web Audio, native inputs, no libs
// ============================================================
import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { buildUpiPayUri, generateDynamicUpiQr } from '../lib/payment'
import { showToast } from '../lib/toast'
import { TRAVEL_CONFIG, TRAVEL_ROUTES, buildWhatsAppBookingMsg, generateBookingCode, computeAdvance } from './travelConfig'
import { insertTravelBooking } from './travelApi'

// ── Web Audio: dual-tone harmonic chime (reused from Layout.tsx pattern)
function playBookingChime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    ;[880, 1108.73, 1318.51].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.13)
      g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.13 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.35)
      osc.connect(g); g.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.13)
      osc.stop(ctx.currentTime + i * 0.13 + 0.38)
    })
    if ('vibrate' in navigator) navigator.vibrate([200, 80, 200])
  } catch { /* AudioContext blocked — silent fail */ }
}

// ── Emergency hospital button (direct call, zero form)
function EmergencyBtn() {
  return (
    <a
      href={`tel:${TRAVEL_CONFIG.primaryPhone}`}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        background: 'linear-gradient(135deg,#dc2626,#b91c1c)',
        color: '#fff', padding: '14px 20px', borderRadius: '14px',
        textDecoration: 'none', fontWeight: 700, fontSize: '1rem',
        boxShadow: '0 4px 20px rgba(220,38,38,0.45)',
        border: '1px solid rgba(255,255,255,0.15)',
        transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1)',
      }}
      onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.97)')}
      onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <span style={{ fontSize: '1.4rem' }}>🚨</span>
      <div>
        <div>হাসপাতাল ইমার্জেন্সি ক্যাব</div>
        <div style={{ fontSize: '0.78rem', opacity: 0.85, fontWeight: 500 }}>Hospital Emergency — Instant Call</div>
      </div>
    </a>
  )
}

// ── Trust Badges
const TRUST_BADGES = [
  { icon: '🛡️', en: '100% Verified Driver', bn: 'ভেরিফাইড ড্রাইভার' },
  { icon: '❄️', en: 'Chilled AC Guaranteed', bn: 'গ্যারান্টেড এসি' },
  { icon: '⏱️', en: 'On-Time Pickup', bn: 'অন-টাইম পিকআপ' },
  { icon: '🚫', en: 'No Hidden Charges', bn: 'কোনো গোপন চার্জ নেই' },
]

export default function TwoBhaiHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const submitLockRef = useRef(false)
  const parallaxRef = useRef<HTMLDivElement>(null)

  // Form state
  const [pickup, setPickup] = useState('')
  const [drop, setDrop] = useState('')
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [time, setTime] = useState('06:00')
  const [passengers, setPassengers] = useState(2)
  const [luggage] = useState(2)
  const [fare, setFare] = useState(2800)
  const [payMode, setPayMode] = useState<'advance' | 'full'>('advance')
  const [utr, setUtr] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [detectingGps, setDetectingGps] = useState(false)
  const [qrDataUri, setQrDataUri] = useState('')
  const [lang] = useState<'bn' | 'en'>('bn')

  const advance = computeAdvance(fare)
  const payable = payMode === 'full' ? fare : advance
  const balance = fare - payable

  // Auto-generate QR when payable changes
  useEffect(() => {
    let active = true
    if (payable > 0) {
      generateDynamicUpiQr(payable, 'Two Bhai Travels Cab Booking')
        .then(uri => { if (active) setQrDataUri(uri) })
        .catch(() => {})
    }
    return () => { active = false }
  }, [payable])

  // Parallax mouse/gyro tilt on hero
  useEffect(() => {
    const el = parallaxRef.current
    if (!el) return
    const onMove = (e: MouseEvent) => {
      const { innerWidth: w, innerHeight: h } = window
      const x = ((e.clientX / w) - 0.5) * 14
      const y = ((e.clientY / h) - 0.5) * -8
      el.style.transform = `translate3d(${x}px,${y}px,0) rotateY(${x * 0.3}deg)`
    }
    const onTilt = (e: DeviceOrientationEvent) => {
      const x = Math.min(10, Math.max(-10, (e.gamma ?? 0) * 0.4))
      const y = Math.min(6, Math.max(-6, (e.beta ?? 0) * 0.15))
      el.style.transform = `translate3d(${x}px,${y}px,0)`
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('deviceorientation', onTilt)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('deviceorientation', onTilt)
    }
  }, [])

  // 1-tap GPS pickup
  const handleGps = useCallback(() => {
    if (!navigator.geolocation) return
    setDetectingGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDetectingGps(false)
        const url = `https://www.google.com/maps/search/?api=1&query=${pos.coords.latitude},${pos.coords.longitude}`
        setPickup(`GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} — ${url}`)
        showToast('📍 লোকেশন ধরা হয়েছে!', '✅')
      },
      () => { setDetectingGps(false); showToast('GPS পাওয়া যায়নি। ম্যানুয়ালি লিখুন।', '⚠️') },
      { timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    if (submitLockRef.current) return
    if (!user) { navigate('/auth'); return }
    if (!pickup.trim() || !drop.trim()) { showToast('পিকআপ ও গন্তব্য লিখুন।', '⚠️'); return }
    if (passengers > TRAVEL_CONFIG.maxPassengers) {
      showToast('সর্বোচ্চ ৪ জন যাত্রী! বেশি হলে ফোনে যোগাযোগ করুন।', '⚠️')
      return
    }

    submitLockRef.current = true
    setSubmitting(true)

    const code = generateBookingCode()
    const payload = {
      booking_code: code,
      user_id: user.id,
      customer_name: user.name || '',
      customer_phone: user.phone || '',
      pickup_address: pickup.trim(),
      drop_address: drop.trim(),
      pickup_date: date,
      pickup_time: time,
      passengers,
      luggage_bags: luggage,
      car_type: TRAVEL_CONFIG.carLabel,
      estimated_fare: fare,
      advance_amount: advance,
      balance_due: balance,
      payment_mode: payMode,
      utr: utr.trim() || undefined,
      notes: notes.trim() || undefined,
    }

    try {
      const booking = await insertTravelBooking(payload)
      playBookingChime()
      navigate(`/trip/${booking.bookingCode}`, { state: { booking } })
    } catch (err) {
      // Offline fallback — WhatsApp dispatch
      const wa = buildWhatsAppBookingMsg({
        bookingCode: code,
        customerName: user.name || user.email || '',
        customerPhone: user.phone || '',
        pickupAddress: pickup.trim(),
        dropAddress: drop.trim(),
        pickupDate: date,
        pickupTime: time,
        passengers,
        estimatedFare: fare,
        advanceAmount: advance,
        balanceDue: balance,
      })
      showToast('নেটওয়ার্ক সমস্যা! WhatsApp-এ বুকিং পাঠান।', '⚠️')
      window.open(wa, '_blank')
    } finally {
      setSubmitting(false)
      submitLockRef.current = false
    }
  }, [user, pickup, drop, date, time, passengers, luggage, fare, advance, balance, payMode, utr, notes, navigate])

  return (
    <div style={{ minHeight: '100vh', background: '#0A0F1D', color: '#F8FAFC', fontFamily: 'system-ui, sans-serif' }}>

      {/* ══ 3D HERO SECTION ══ */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        minHeight: '45vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(180deg,#0A0F1D 0%,#0F172A 60%,#1E293B 100%)',
        paddingTop: '5rem',
      }}>
        {/* Road perspective grid */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
          background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 18px, rgba(251,191,36,0.12) 18px, rgba(251,191,36,0.12) 22px)',
          transform: 'perspective(400px) rotateX(55deg)', transformOrigin: 'bottom center',
          opacity: 0.5,
        }} />

        {/* Headlight glow beams */}
        <div style={{ position: 'absolute', bottom: '25%', left: '30%', width: 120, height: 220,
          background: 'radial-gradient(ellipse at top, rgba(251,191,36,0.22) 0%, transparent 70%)',
          transform: 'skewX(-15deg)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '25%', right: '30%', width: 120, height: 220,
          background: 'radial-gradient(ellipse at top, rgba(251,191,36,0.22) 0%, transparent 70%)',
          transform: 'skewX(15deg)', pointerEvents: 'none' }} />

        {/* 3D Car silhouette (CSS + parallax) */}
        <div ref={parallaxRef} style={{
          transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1)',
          willChange: 'transform', zIndex: 2, textAlign: 'center',
        }}>
          {/* Photorealistic car rendered in SVG */}
          <svg viewBox="0 0 480 220" style={{ width: '90vw', maxWidth: 420, height: 'auto', filter: 'drop-shadow(0 8px 40px rgba(251,191,36,0.30))' }} aria-hidden="true">
            {/* Asphalt ground */}
            <ellipse cx="240" cy="200" rx="220" ry="18" fill="rgba(0,0,0,0.55)" />
            {/* Car body — premium sedan silhouette */}
            <path d="M60,170 Q60,135 100,130 L150,100 Q185,72 240,70 Q295,72 330,100 L380,130 Q420,135 420,170 Z" fill="#CBD5E1" />
            {/* Roof */}
            <path d="M155,100 Q185,68 240,66 Q295,68 325,100 Z" fill="#94A3B8" />
            {/* Windshield */}
            <path d="M162,100 Q188,72 240,70 Q292,72 318,100 Z" fill="rgba(186,230,253,0.50)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
            {/* Rear window */}
            <path d="M162,100 L200,110 L240,108 L280,110 L318,100 L310,98 L240,97 Z" fill="rgba(186,230,253,0.20)" />
            {/* Hood */}
            <path d="M60,170 L100,130 L150,105 Q100,108 80,150 Z" fill="#B8C4CE" />
            <path d="M420,170 L380,130 L330,105 Q380,108 400,150 Z" fill="#B8C4CE" />
            {/* Chrome grille */}
            <rect x="108" y="155" width="60" height="12" rx="4" fill="rgba(255,255,255,0.18)" />
            <rect x="312" y="155" width="60" height="12" rx="4" fill="rgba(255,255,255,0.18)" />
            {/* LED Headlights — golden glow */}
            <ellipse cx="118" cy="152" rx="26" ry="12" fill="rgba(251,191,36,0.15)" />
            <ellipse cx="118" cy="152" rx="18" ry="7" fill="rgba(251,191,36,0.55)" />
            <ellipse cx="118" cy="152" rx="10" ry="4" fill="#FBBF24" />
            <ellipse cx="362" cy="152" rx="26" ry="12" fill="rgba(251,191,36,0.15)" />
            <ellipse cx="362" cy="152" rx="18" ry="7" fill="rgba(251,191,36,0.55)" />
            <ellipse cx="362" cy="152" rx="10" ry="4" fill="#FBBF24" />
            {/* Tail lights */}
            <ellipse cx="96" cy="160" rx="10" ry="5" fill="rgba(239,68,68,0.7)" />
            <ellipse cx="384" cy="160" rx="10" ry="5" fill="rgba(239,68,68,0.7)" />
            {/* Wheels */}
            <circle cx="148" cy="178" r="30" fill="#1E293B" stroke="#475569" strokeWidth="4" />
            <circle cx="148" cy="178" r="16" fill="#334155" />
            <circle cx="148" cy="178" r="7" fill="#94A3B8" />
            <circle cx="332" cy="178" r="30" fill="#1E293B" stroke="#475569" strokeWidth="4" />
            <circle cx="332" cy="178" r="16" fill="#334155" />
            <circle cx="332" cy="178" r="7" fill="#94A3B8" />
            {/* Specular highlight on roof */}
            <path d="M195,80 Q240,66 285,80" stroke="rgba(255,255,255,0.30)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>

          {/* Brand title */}
          <h1 style={{
            margin: '0.5rem 0 0.25rem', fontSize: 'clamp(1.6rem,5vw,2.2rem)',
            fontWeight: 800, letterSpacing: '-0.5px',
            background: 'linear-gradient(135deg,#F8FAFC 0%,#FBBF24 60%,#F59E0B 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Two Bhai Travels
          </h1>
          <p style={{ margin: 0, color: '#94A3B8', fontSize: '0.9rem', fontWeight: 500 }}>
            টু ভাই ট্রাভেলস · নন্দকুমার, পূর্ব মেদিনীপুর
          </p>
        </div>

        {/* Live availability badge */}
        <div style={{
          position: 'absolute', top: '5.5rem', right: '1rem',
          background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)',
          borderRadius: '20px', padding: '4px 12px', fontSize: '0.72rem',
          fontWeight: 700, color: '#34D399', display: 'flex', alignItems: 'center', gap: '5px',
          backdropFilter: 'blur(8px)',
        }}>
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
          গাড়ি প্রস্তুত · Available
        </div>
      </section>

      {/* ══ EMERGENCY BUTTON ══ */}
      <div style={{ padding: '0 1rem', maxWidth: 500, margin: '0 auto' }}>
        <EmergencyBtn />
      </div>

      {/* ══ TRUST BADGES ══ */}
      <div style={{ display: 'flex', gap: '8px', padding: '1rem', overflowX: 'auto', maxWidth: 500, margin: '0 auto' }}>
        {TRUST_BADGES.map(b => (
          <div key={b.en} style={{
            flexShrink: 0, background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
            padding: '8px 12px', fontSize: '0.72rem', fontWeight: 600, color: '#94A3B8',
            display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
          }}>
            {b.icon} {lang === 'bn' ? b.bn : b.en}
          </div>
        ))}
      </div>

      {/* ══ BOOKING FORM — frosted glass card ══ */}
      <form onSubmit={handleSubmit} style={{ padding: '0 1rem 2rem', maxWidth: 500, margin: '0 auto' }}>
        <div style={{
          background: 'rgba(15,23,42,0.80)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.10)', borderRadius: '20px', padding: '1.25rem',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#FBBF24' }}>
            🚗 গাড়ি বুক করুন (Book Your AC Cab)
          </h2>

          {/* Pickup */}
          <label style={labelStyle}>📍 পিকআপ লোকেশন (Pickup)</label>
          <div style={{ position: 'relative' }}>
            <input
              value={pickup} onChange={e => setPickup(e.target.value)}
              placeholder="আপনার গ্রাম / বাড়ির ঠিকানা লিখুন..."
              required style={inputStyle}
            />
            <button
              type="button" onClick={handleGps}
              disabled={detectingGps}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: '#1E3A5F', border: 'none', color: '#FBBF24',
                borderRadius: '8px', padding: '6px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              {detectingGps ? '...' : '📍 GPS'}
            </button>
          </div>

          {/* Drop */}
          <label style={labelStyle}>🏁 গন্তব্য (Drop Destination)</label>
          <input
            value={drop} onChange={e => setDrop(e.target.value)}
            placeholder="যেমন: কলকাতা বিমানবন্দর, SSKM হাসপাতাল, দিঘা..."
            required style={inputStyle}
          />

          {/* Popular destinations */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '1rem' }}>
            {TRAVEL_ROUTES.map(r => (
              <button
                key={r.id} type="button"
                onClick={() => { setDrop(r.labelBn); setFare(r.minFare) }}
                style={{
                  flexShrink: 0, background: drop === r.labelBn ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)',
                  border: drop === r.labelBn ? '1px solid #FBBF24' : '1px solid rgba(255,255,255,0.1)',
                  color: drop === r.labelBn ? '#FBBF24' : '#94A3B8',
                  borderRadius: '20px', padding: '5px 12px', fontSize: '0.72rem',
                  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {r.labelBn}
              </button>
            ))}
          </div>

          {/* Date & Time row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>📅 তারিখ</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                min={new Date().toISOString().split('T')[0]} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>⏰ পিকআপ সময়</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} required style={inputStyle} />
            </div>
          </div>

          {/* Passengers */}
          <label style={labelStyle}>👥 যাত্রী সংখ্যা (সর্বোচ্চ ৪)</label>
          {passengers > TRAVEL_CONFIG.maxPassengers ? (
            <div style={{ padding: '10px', background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '10px', marginBottom: '0.75rem', fontSize: '0.82rem', color: '#FCA5A5' }}>
              ⚠️ আমাদের ৪-সিটার গাড়ি সর্বোচ্চ ৪ জন নিতে পারে। বেশি যাত্রীর জন্য{' '}
              <a href={`tel:${TRAVEL_CONFIG.primaryPhone}`} style={{ color: '#FBBF24', fontWeight: 700 }}>ফোনে কথা বলুন</a>।
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem' }}>
            {[1, 2, 3, 4].map(n => (
              <button key={n} type="button" onClick={() => setPassengers(n)} style={{
                flex: 1, padding: '10px', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem',
                cursor: 'pointer', border: passengers === n ? '2px solid #FBBF24' : '1px solid rgba(255,255,255,0.1)',
                background: passengers === n ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)',
                color: passengers === n ? '#FBBF24' : '#94A3B8',
                transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
              }}>{n} জন</button>
            ))}
          </div>

          {/* Fare estimate */}
          <label style={labelStyle}>💰 আনুমানিক ভাড়া (Estimated Fare)</label>
          <input
            type="number" value={fare} onChange={e => setFare(Number(e.target.value))}
            min={500} max={15000} step={50} required style={inputStyle}
          />
          <p style={{ margin: '-0.5rem 0 0.75rem', fontSize: '0.72rem', color: '#64748B' }}>
            ⚠️ টোল ট্যাক্স ও পার্কিং চার্জ আলাদা (রসিদ অনুযায়ী)।
          </p>

          {/* Payment mode */}
          <label style={labelStyle}>💳 পেমেন্ট পদ্ধতি বেছে নিন</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '1rem' }}>
            <button type="button" onClick={() => setPayMode('advance')} style={{
              padding: '0.75rem', borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
              border: payMode === 'advance' ? '2px solid #10B981' : '1px solid rgba(255,255,255,0.1)',
              background: payMode === 'advance' ? 'rgba(16,185,129,0.10)' : 'rgba(255,255,255,0.04)',
              transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: payMode === 'advance' ? '#34D399' : '#F8FAFC' }}>
                ⚡ {TRAVEL_CONFIG.advancePercent}% অগ্রিম
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>এখন ₹{advance} · বাকি ক্যাশ</div>
            </button>
            <button type="button" onClick={() => setPayMode('full')} style={{
              padding: '0.75rem', borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
              border: payMode === 'full' ? '2px solid #10B981' : '1px solid rgba(255,255,255,0.1)',
              background: payMode === 'full' ? 'rgba(16,185,129,0.10)' : 'rgba(255,255,255,0.04)',
              transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: payMode === 'full' ? '#34D399' : '#F8FAFC' }}>
                💎 ১০০% ফুল পে
              </div>
              <div style={{ fontSize: '0.72rem', color: '#10B981', marginTop: 2, fontWeight: 600 }}>✓ ক্যাশলেস যাত্রা</div>
            </button>
          </div>

          {/* UPI Section */}
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '14px', padding: '1rem', marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#FBBF24', textTransform: 'uppercase' }}>
              ⚡ ₹{payable} পেমেন্ট করুন:
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              {qrDataUri && (
                <div style={{ flexShrink: 0 }}>
                  <img src={qrDataUri} alt={`UPI QR ₹${payable}`} width={90} height={90} style={{ borderRadius: 8, border: '2px solid rgba(251,191,36,0.3)' }} />
                  <p style={{ margin: '3px 0 0', fontSize: '0.62rem', color: '#64748B', textAlign: 'center' }}>🔒 ₹{payable} Auto-Locked</p>
                </div>
              )}
              <div style={{ flex: 1 }}>
                <code style={{ fontSize: '0.8rem', color: '#FBBF24', display: 'block', marginBottom: '6px' }}>{TRAVEL_CONFIG.upiId}</code>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(['GPay', 'PhonePe', 'Paytm'] as const).map(app => (
                    <a
                      key={app}
                      href={buildUpiPayUri(payable, 'Two Bhai Travels Cab Booking')}
                      style={{
                        display: 'inline-block', padding: '6px 12px', borderRadius: '8px',
                        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                        color: '#F8FAFC', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none',
                      }}
                    >
                      {app === 'GPay' ? '🟢' : app === 'PhonePe' ? '🟣' : '🔵'} {app}
                    </a>
                  ))}
                </div>
              </div>
            </div>
            <label style={{ ...labelStyle, marginTop: '0.75rem' }}>UTR / Transaction ID (পেমেন্টের পরে লিখুন)</label>
            <input value={utr} onChange={e => setUtr(e.target.value)}
              placeholder="12-digit UTR number (optional)"
              style={{ ...inputStyle, fontSize: '0.82rem' }} />
          </div>

          {/* Notes */}
          <label style={labelStyle}>📝 বিশেষ নির্দেশনা (Optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="যেমন: ভোরবেলা খুব তাড়া আছে, হাসপাতালের গেট নম্বর..."
            rows={2} style={{ ...inputStyle, resize: 'none' }} />

          {/* Fare summary */}
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94A3B8' }}>আনুমানিক ভাড়া:</span>
              <span style={{ fontWeight: 700 }}>₹{fare}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ color: '#94A3B8' }}>{payMode === 'advance' ? `এখন দিন (${TRAVEL_CONFIG.advancePercent}% অগ্রিম):` : 'এখন দিন (১০০%):'}</span>
              <span style={{ fontWeight: 700, color: '#34D399' }}>₹{payable}</span>
            </div>
            {payMode === 'advance' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ color: '#94A3B8' }}>ট্রিপ শেষে ড্রাইভারকে:</span>
                <span style={{ fontWeight: 700, color: '#FBBF24' }}>₹{balance}</span>
              </div>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit" disabled={submitting || passengers > TRAVEL_CONFIG.maxPassengers}
            style={{
              width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
              background: submitting ? '#334155' : 'linear-gradient(135deg,#F59E0B,#D97706)',
              color: '#0A0F1D', fontWeight: 800, fontSize: '1.05rem', cursor: submitting ? 'not-allowed' : 'pointer',
              boxShadow: submitting ? 'none' : '0 4px 20px rgba(245,158,11,0.40)',
              transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {submitting ? '⏳ বুকিং প্রসেস হচ্ছে...' : '🚗 বুকিং নিশ্চিত করুন (Confirm Booking)'}
          </button>
          {!user && (
            <p style={{ textAlign: 'center', margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#94A3B8' }}>
              বুকিং করতে প্রথমে{' '}
              <button type="button" onClick={() => navigate('/auth')} style={{ background: 'none', border: 'none', color: '#FBBF24', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}>
                লগইন করুন
              </button>
              {' '}(ফোন নম্বর + ৪-সংখ্যার PIN)
            </p>
          )}

          {/* WhatsApp fallback */}
          <a
            href={buildWhatsAppBookingMsg({
              bookingCode: 'TBT-XXXXXX', customerName: 'আপনার নাম', customerPhone: '',
              pickupAddress: pickup || 'পিকআপ ঠিকানা', dropAddress: drop || 'গন্তব্য',
              pickupDate: date, pickupTime: time, passengers,
              estimatedFare: fare, advanceAmount: advance, balanceDue: balance,
            })}
            target="_blank" rel="noreferrer"
            style={{
              display: 'block', textAlign: 'center', marginTop: '0.75rem',
              color: '#34D399', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none',
            }}
          >
            🟢 সরাসরি WhatsApp-এ বুকিং করুন
          </a>
        </div>
      </form>

      {/* ══ ROUTE PACKAGES INFO ══ */}
      <div style={{ padding: '0 1rem 3rem', maxWidth: 500, margin: '0 auto' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FBBF24', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
          জনপ্রিয় রুট ও আনুমানিক ভাড়া
        </h3>
        {TRAVEL_ROUTES.map(r => (
          <div key={r.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px', padding: '12px 16px', marginBottom: '8px',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{r.labelBn}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>{r.label}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: '#FBBF24', fontSize: '0.9rem' }}>₹{r.minFare}–{r.maxFare}</div>
              <div style={{ fontSize: '0.68rem', color: '#34D399' }}>অগ্রিম: ₹{computeAdvance(r.minFare)}</div>
            </div>
          </div>
        ))}
        <p style={{ fontSize: '0.72rem', color: '#475569', marginTop: '0.75rem' }}>
          ⚠️ উপরের ভাড়া আনুমানিক। টোল ট্যাক্স, পার্কিং ও নাইট হল্ট চার্জ আলাদা।
        </p>
      </div>
    </div>
  )
}

// ── Shared styles (Ponytail: avoid prop-drilling inline objects)
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px', marginBottom: '0.75rem',
  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '10px', color: '#F8FAFC', fontSize: '0.9rem',
  outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 700,
  color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.3px',
  marginBottom: '0.35rem',
}
