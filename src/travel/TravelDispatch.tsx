// ============================================================
// TWO BHAI TRAVELS — Dispatch Dashboard (/travel/dispatch)
// Role-locked: seller + admin only. Realtime bookings.
// Ponytail: reuses playAlert from pattern, no extra libs.
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { showToast } from '../lib/toast'
import { fetchAllTravelBookings, updateTravelBooking, subscribeTravelBookingsAll } from './travelApi'
import { TRAVEL_CONFIG } from './travelConfig'
import type { TravelBooking } from './travelTypes'

// Web Audio 4-tone alert (same as SellerOrders.tsx pattern)
function playAlert() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    ;[523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain()
      osc.type = 'sine'; osc.frequency.value = freq
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.1)
      g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.1 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3)
      osc.connect(g); g.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.1); osc.stop(ctx.currentTime + i * 0.1 + 0.35)
    })
    if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 400])
  } catch { /* silent */ }
}

// Age badge — same mechanic as SellerOrders
function ageBadge(createdAt: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000))
  if (mins < 10) return { label: `🟢 সদ্য (${mins}মি)`, bg: '#dcfce7', color: '#15803d', border: '#86efac' }
  if (mins < 60) return { label: `🟡 অপেক্ষমাণ (${mins}মি)`, bg: '#fef9c3', color: '#854d0e', border: '#fde047' }
  const h = Math.floor(mins / 60); const m = mins % 60
  return { label: `🔴 বিলম্বিত (${h}ঘ ${m}মি)`, bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
}

const STATUS_LABELS: Record<TravelBooking['status'], string> = {
  pending: '📋 গৃহীত',
  confirmed: '✅ নিশ্চিত',
  dispatched: '🚗 রওনা',
  completed: '🏁 সম্পন্ন',
  cancelled: '❌ বাতিল',
}

type Filter = 'active' | 'completed' | 'all'

interface AssignState {
  id: string
  driverName: string
  driverPhone: string
  carNumber: string
  status: TravelBooking['status']
}

export default function TravelDispatch() {
  const { user } = useAuth()
  if (!user || (user.role !== 'seller' && user.role !== 'admin' && !user.isSuperAdmin)) {
    return <Navigate to="/auth" replace />
  }

  const [bookings, setBookings] = useState<TravelBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('active')
  const [assign, setAssign] = useState<AssignState | null>(null)
  const [saving, setSaving] = useState(false)
  const saveLockRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    const all = await fetchAllTravelBookings()
    setBookings(all)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // Realtime — new booking arrives → alert + prepend
  useEffect(() => {
    return subscribeTravelBookingsAll((newBooking) => {
      playAlert()
      showToast(`🚗 নতুন বুকিং! ${newBooking.bookingCode}`, '🔔')
      setBookings(prev => [newBooking, ...prev])
    })
  }, [])

  const filtered = bookings.filter(b => {
    if (filter === 'active') return !['completed', 'cancelled'].includes(b.status)
    if (filter === 'completed') return ['completed', 'cancelled'].includes(b.status)
    return true
  })

  const handleSave = useCallback(async () => {
    if (!assign || saveLockRef.current) return
    saveLockRef.current = true; setSaving(true)
    try {
      await updateTravelBooking(assign.id, {
        status: assign.status,
        driver_name: assign.driverName,
        driver_phone: assign.driverPhone,
        car_number: assign.carNumber,
      })
      showToast('✅ আপডেট সফল হয়েছে!', '✅')
      setAssign(null)
      await load()
    } catch {
      showToast('❌ সেভ করতে পারিনি। আবার চেষ্টা করুন।', '❌')
    } finally {
      setSaving(false); saveLockRef.current = false
    }
  }, [assign, load])

  const handleStatusOnly = useCallback(async (id: string, status: TravelBooking['status']) => {
    try {
      await updateTravelBooking(id, { status })
      showToast(`স্ট্যাটাস: ${STATUS_LABELS[status]}`, '✅')
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
    } catch { showToast('আপডেট ব্যর্থ।', '❌') }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0A0F1D', color: '#F8FAFC', fontFamily: 'system-ui, sans-serif', paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 1rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#FBBF24' }}>🚗 ডিসপ্যাচ ড্যাশবোর্ড</h1>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B' }}>Two Bhai Travels · {TRAVEL_CONFIG.baseLocation}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
            <span style={{ fontSize: '0.72rem', color: '#34D399', fontWeight: 700 }}>{bookings.filter(b => b.status === 'pending').length} Pending</span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '1rem' }}>
          {(['pending', 'confirmed', 'dispatched', 'completed'] as TravelBooking['status'][]).map(s => (
            <div key={s} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color: s === 'pending' ? '#FBBF24' : s === 'dispatched' ? '#60A5FA' : '#34D399' }}>
                {bookings.filter(b => b.status === s).length}
              </div>
              <div style={{ fontSize: '0.62rem', color: '#64748B' }}>{STATUS_LABELS[s]}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem' }}>
          {(['active', 'completed', 'all'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', borderRadius: '20px', border: 'none', fontWeight: 700, fontSize: '0.78rem',
              cursor: 'pointer',
              background: filter === f ? '#F59E0B' : 'rgba(255,255,255,0.07)',
              color: filter === f ? '#0A0F1D' : '#94A3B8',
            }}>
              {f === 'active' ? '🟡 সক্রিয়' : f === 'completed' ? '✅ সম্পন্ন' : '📋 সব'}
            </button>
          ))}
          <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748B', fontSize: '0.78rem', cursor: 'pointer' }}>
            🔄 রিফ্রেশ
          </button>
        </div>

        {/* Booking cards */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>⏳ লোড হচ্ছে...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>কোনো বুকিং নেই।</div>
        ) : filtered.map(b => {
          const age = ageBadge(b.createdAt)
          return (
            <div key={b.id} style={{
              background: 'rgba(15,23,42,0.8)', border: `1px solid ${b.status === 'pending' ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '16px', padding: '1rem', marginBottom: '10px',
            }}>
              {/* Top row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <span style={{ fontWeight: 800, color: '#FBBF24', fontSize: '0.9rem' }}>{b.bookingCode}</span>
                  {b.status === 'pending' && (
                    <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 700, background: age.bg, color: age.color, border: `1px solid ${age.border}` }}>
                      {age.label}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8' }}>{STATUS_LABELS[b.status]}</span>
              </div>

              {/* Customer */}
              <p style={{ margin: '0 0 3px', fontWeight: 700, fontSize: '0.88rem' }}>👤 {b.customerName}</p>
              <p style={{ margin: '0 0 6px', color: '#94A3B8', fontSize: '0.78rem' }}>
                📞 <a href={`tel:${b.customerPhone}`} style={{ color: '#FBBF24', textDecoration: 'none' }}>{b.customerPhone}</a>
                &nbsp;·&nbsp;👥 {b.passengers} জন · 📅 {b.pickupDate} {b.pickupTime}
              </p>

              {/* Route */}
              <div style={{ fontSize: '0.8rem', color: '#CBD5E1', marginBottom: '6px' }}>
                <span style={{ color: '#10B981' }}>📍</span> {b.pickupAddress} → <span style={{ color: '#60A5FA' }}>🏁</span> {b.dropAddress}
              </div>

              {/* Fare */}
              <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '8px' }}>
                💰 ভাড়া: <strong style={{ color: '#F8FAFC' }}>₹{b.estimatedFare}</strong>
                &nbsp;| অগ্রিম: <strong style={{ color: '#34D399' }}>₹{b.advanceAmount}</strong>
                &nbsp;| বাকি: <strong style={{ color: '#FBBF24' }}>₹{b.balanceDue}</strong>
                {b.utr && <span>&nbsp;| UTR: {b.utr} {b.utrVerified ? '✅' : '⏳'}</span>}
              </div>

              {/* Driver assigned info */}
              {b.driverName && (
                <div style={{ fontSize: '0.78rem', color: '#34D399', marginBottom: '8px' }}>
                  🚘 {b.driverName} · {b.carNumber} · {b.driverPhone}
                </div>
              )}

              {/* Quick status + Assign button */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(['confirmed', 'dispatched', 'completed', 'cancelled'] as TravelBooking['status'][]).map(s => (
                  s !== b.status && (
                    <button key={s} onClick={() => handleStatusOnly(b.id, s)} style={{
                      padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
                      background: s === 'cancelled' ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.07)',
                      color: s === 'cancelled' ? '#FCA5A5' : '#94A3B8',
                    }}>
                      {STATUS_LABELS[s]}
                    </button>
                  )
                ))}
                <button
                  onClick={() => setAssign({ id: b.id, status: b.status, driverName: b.driverName || '', driverPhone: b.driverPhone || '', carNumber: b.carNumber || '' })}
                  style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.08)', color: '#FBBF24', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}
                >
                  🚘 ড্রাইভার অ্যাসাইন
                </button>
                <a href={`tel:${b.customerPhone}`} style={{ padding: '5px 12px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#34D399', textDecoration: 'none', fontSize: '0.72rem', fontWeight: 700 }}>
                  📞 Call
                </a>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Driver assign modal */}
      {assign && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
        }}
          onClick={e => { if (e.target === e.currentTarget) setAssign(null) }}
        >
          <div style={{ width: '100%', maxWidth: 500, background: '#0F172A', borderRadius: '20px 20px 0 0', padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ margin: '0 0 1rem', fontWeight: 800, color: '#FBBF24' }}>🚘 ড্রাইভার অ্যাসাইন করুন</h3>

            {(['driverName', 'driverPhone', 'carNumber'] as const).map(key => {
              const labels = { driverName: 'ড্রাইভারের নাম', driverPhone: 'ড্রাইভারের ফোন', carNumber: 'গাড়ির নম্বর' }
              return (
                <div key={key} style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', marginBottom: '4px' }}>{labels[key]}</label>
                  <input
                    value={assign[key]}
                    onChange={e => setAssign(a => a ? { ...a, [key]: e.target.value } : a)}
                    style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#F8FAFC', fontSize: '0.9rem', boxSizing: 'border-box' }}
                  />
                </div>
              )
            })}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', marginBottom: '4px' }}>স্ট্যাটাস</label>
              <select
                value={assign.status}
                onChange={e => setAssign(a => a ? { ...a, status: e.target.value as TravelBooking['status'] } : a)}
                style={{ width: '100%', padding: '10px', background: '#1E293B', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#F8FAFC', fontSize: '0.9rem' }}
              >
                {(['confirmed', 'dispatched', 'completed', 'cancelled'] as TravelBooking['status'][]).map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '13px', borderRadius: '12px', border: 'none', background: saving ? '#334155' : 'linear-gradient(135deg,#F59E0B,#D97706)', color: '#0A0F1D', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.95rem' }}>
                {saving ? '⏳ সেভ হচ্ছে...' : '✅ সেভ করুন'}
              </button>
              <button onClick={() => setAssign(null)} style={{ padding: '13px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: '0.95rem' }}>
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
