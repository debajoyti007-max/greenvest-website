import { useState, useEffect, useRef, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import OrderTimeline from '../components/OrderTimeline'
import OrderChat from '../components/OrderChat'
import OrderSkeleton from '../components/OrderSkeleton'
import { useStore } from '../context/useStore'
import { useAuth } from '../context/useAuth'
import { formatOrderId, SUPPORT_PHONE } from '../lib/business'
import { fetchOrderByIdAndPhone, subscribeSingleOrder } from '../lib/api'


import { showToast } from '../lib/toast'
import { t } from '../lib/i18n'
import type { Order } from '../types'

/** Masks a phone number: shows only last 4 digits. e.g. ******1027 */
function maskPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '').slice(-10)
  if (digits.length < 4) return '**hidden**'
  return `******${digits.slice(-4)}`
}

/** Masks an address: shows only the PIN code area. e.g. "...PIN 721632" */
function maskAddress(address: string): string {
  if (!address) return '**hidden**'
  // Show only the PIN code if present, or just show first word + "..."
  const pinMatch = address.match(/\b\d{6}\b/)
  if (pinMatch) return `📍 Area PIN: ${pinMatch[0]}`
  return `📍 ${address.split(' ').slice(0, 3).join(' ')}...`
}

export default function TrackOrder() {
  const { orders, lang, updateOrderStatus } = useStore()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [orderId, setOrderId] = useState('')
  const [phone, setPhone] = useState('')
  const [matched, setMatched] = useState<Order | null>(null)
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const handleCancelOrder = async (o: Order) => {
    const confirmMsg = lang === 'bn'
      ? 'আপনি কি নিশ্চিত যে আপনি এই অর্ডারটি বাতিল করতে চান?'
      : 'Are you sure you want to cancel this order?'
    if (!window.confirm(confirmMsg)) return

    setCancelling(true)
    try {
      await updateOrderStatus(o.id, 'cancelled', 'Cancelled by customer')
      setMatched((prev) => (prev && prev.id === o.id ? { ...prev, status: 'cancelled' } : prev))
      showToast(lang === 'bn' ? 'অর্ডার সফলভাবে বাতিল করা হয়েছে' : 'Order cancelled successfully', 'info')
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel order', 'error')
    } finally {
      setCancelling(false)
    }
  }

  // Pre-fill phone from logged-in user for convenience
  useEffect(() => {
    if (user?.phone && !phone) {
      setPhone(user.phone)
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-track if URL contains ?id=849201 — only auto-searches if user is logged in
  // (so shared links don't expose other people's orders without phone verification)
  useEffect(() => {
    const paramId = searchParams.get('id') || searchParams.get('order') || searchParams.get('num')
    if (paramId) {
      setOrderId(paramId)
      // Only auto-resolve if the current logged-in user owns this order
      if (user) {
        const rawInput = paramId.trim().toLowerCase().replace(/^#/, '')
        const userPhone = (user.phone || '').replace(/\D/g, '').slice(-10)
        const found = orders.find((o) => {
          const oIdRaw = o.id.toLowerCase()
          const oIdFormatted = formatOrderId(o.id).toLowerCase()
          const oPhoneDigits = o.phone.replace(/\D/g, '').slice(-10)
          const isOwner = oPhoneDigits === userPhone || o.userId === user.id
          if (!isOwner) return false
          return (
            oIdRaw === rawInput ||
            oIdFormatted === rawInput ||
            oIdFormatted === `ord-${rawInput}` ||
            (rawInput.length >= 4 && (oIdRaw.endsWith(rawInput) || oIdFormatted.endsWith(rawInput)))
          )
        })
        if (found) {
          setMatched(found)
          setSearched(true)
        }
      }
    }
  }, [searchParams, orders, user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live single-order tracking subscription (free-tier optimized) ──────────
  // Uses payload.new directly from WebSocket — patches state in-memory instantly.
  // ZERO HTTP round-trips. Status bar updates in < 50ms when staff clicks any button.
  const trackRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!matched?.id) return
    const currentOrderId = matched.id
    const unsub = subscribeSingleOrder(currentOrderId, (updatedRow) => {
      if (trackRefreshTimerRef.current) clearTimeout(trackRefreshTimerRef.current)
      trackRefreshTimerRef.current = setTimeout(() => {
        // Patch the matched order state directly from WebSocket payload — no fetch needed
        setMatched((prev) => {
          if (!prev || prev.id !== currentOrderId) return prev
          const newStatus = (updatedRow.status as Order['status']) ?? prev.status
          const newDeliveryDate = (updatedRow.delivery_date as string | undefined) ?? prev.deliveryDate
          const newRejectionReason = (updatedRow.rejection_reason as string | undefined) ?? prev.rejectionReason
          return {
            ...prev,
            status: newStatus,
            deliveryDate: newDeliveryDate,
            rejectionReason: newRejectionReason,
          }
        })

        const statusLabels: Record<string, string> = {
          confirmed: '✅ Order confirmed!',
          out_for_delivery: '🚚 Out for delivery!',
          delivered: '🎉 Delivered successfully!',
          cancelled: '❌ Order was cancelled.',
          advance_paid: '💰 Advance payment received!',
        }
        const newStatus = updatedRow.status as string | undefined
        const msgEn = statusLabels[newStatus ?? ''] ?? `📦 Order status updated: ${newStatus}`
        showToast(lang === 'bn' ? '📦 অর্ডারের অবস্থা আপডেট হয়েছে!' : msgEn, '🚚')
      }, 300)
    })
    return () => {
      unsub()
      if (trackRefreshTimerRef.current) clearTimeout(trackRefreshTimerRef.current)
    }
  }, [matched?.id, lang])


  const onTrack = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setMatched(null)

    const rawOrderId = orderId.trim().replace(/^#/, '')
    const rawPhone = phone.trim().replace(/\D/g, '').slice(-10)

    // ── Input Validation ──────────────────────────────────────────
    if (!rawOrderId) {
      setError(
        lang === 'bn'
          ? '❌ অর্ডার আইডি দিন (৪–৬ সংখ্যা)'
          : '❌ Please enter your Order ID (4–6 digits)',
      )
      return
    }

    if (rawPhone.length < 10) {
      setError(
        lang === 'bn'
          ? '❌ ১০-সংখ্যার মোবাইল নম্বরটি দিন যেটি দিয়ে অর্ডার করেছিলেন'
          : '❌ Enter the 10-digit mobile number used when placing the order',
      )
      return
    }

    setSearched(true)
    const rawIdLower = rawOrderId.toLowerCase()

    // ── Step 1: Check local in-memory orders (logged-in user's own orders) ──
    let found: Order | undefined = orders.find((o) => {
      const oIdRaw = o.id.toLowerCase()
      const oIdFormatted = formatOrderId(o.id).toLowerCase()
      const oPhoneDigits = o.phone.replace(/\D/g, '').slice(-10)

      // MUST match phone first
      if (oPhoneDigits !== rawPhone) return false

      return (
        oIdRaw === rawIdLower ||
        oIdFormatted === rawIdLower ||
        oIdFormatted === `ord-${rawIdLower}` ||
        (rawIdLower.length >= 4 && (oIdRaw.endsWith(rawIdLower) || oIdFormatted.endsWith(rawIdLower)))
      )
    })

    // ── Step 2: Query Supabase — requires BOTH order ID + phone ──
    if (!found) {
      setLoading(true)
      try {
        found = (await fetchOrderByIdAndPhone(rawOrderId, rawPhone)) ?? undefined
      } catch {
        // ignore network errors silently
      }
      setLoading(false)
    }

    if (found) {
      setMatched(found)
    } else {
      setError(
        lang === 'bn'
          ? '❌ কোনো অর্ডার পাওয়া যায়নি। অর্ডার আইডি ও মোবাইল নম্বর সঠিক কিনা দেখুন।'
          : '❌ No order found. Please verify your Order ID and the mobile number used at checkout.',
      )
    }
  }

  // Is the logged-in user the owner of this matched order?
  const isOwner =
    user != null &&
    matched != null &&
    (matched.userId === user.id ||
      matched.phone.replace(/\D/g, '').slice(-10) === (user.phone || '').replace(/\D/g, '').slice(-10))

  return (
    <div className="page narrow track-page">
      <h1>{lang === 'bn' ? 'অর্ডার ট্র্যাক করুন' : 'Track Your Order'}</h1>
      <p className="lede center">
        {lang === 'bn'
          ? 'অর্ডার আইডি ও মোবাইল নম্বর দিয়ে আপনার অর্ডারের অবস্থা দেখুন।'
          : 'Enter your Order ID and the mobile number used at checkout to track your order.'}
      </p>

      <form className="form" onSubmit={onTrack}>
        {/* Row 1: Order ID */}
        <label>
          {lang === 'bn' ? 'অর্ডার আইডি' : 'Order ID'}
          <input
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder={lang === 'bn' ? 'যেমন: 849201 বা ORD-849201' : 'e.g. 849201 or ORD-849201'}
            autoComplete="off"
            style={{ fontSize: '1.05rem', fontWeight: 600 }}
          />
          <span style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem', display: 'block' }}>
            💡 {lang === 'bn' ? 'অর্ডার সফল হওয়ার পর SMS বা অর্ডার পেজে পাবেন' : 'Find it in your confirmation page or SMS'}
          </span>
        </label>

        {/* Row 2: Phone Number */}
        <label style={{ marginTop: '0.75rem' }}>
          {lang === 'bn' ? 'মোবাইল নম্বর (অর্ডারে যেটি দিয়েছিলেন)' : 'Mobile Number (used when ordering)'}
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={lang === 'bn' ? '১০-সংখ্যার মোবাইল নম্বর' : '10-digit mobile number'}
            maxLength={13}
            autoComplete="tel"
            style={{ fontSize: '1.05rem', fontWeight: 600 }}
          />
          <span style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem', display: 'block' }}>
            🔒 {lang === 'bn' ? 'আপনার তথ্য সুরক্ষিত রাখতে এটি প্রয়োজন' : 'Required to protect your order privacy'}
          </span>
        </label>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn btn-primary" style={{ marginTop: '0.75rem' }} disabled={loading}>
          {loading
            ? (lang === 'bn' ? '⏳ খোঁজা হচ্ছে...' : '⏳ Searching...')
            : (`🔍 ${lang === 'bn' ? 'অর্ডার দেখুন' : 'Track Order'}`)}
        </button>
      </form>

      {loading && (
        <div style={{ marginTop: '1.5rem' }}>
          <OrderSkeleton count={1} />
        </div>
      )}

      {!loading && searched && matched && (
        <article className="order-card" style={{ marginTop: '1.5rem' }}>
          <header>
            <div>
              <strong style={{ fontSize: '1.1rem', color: '#166534' }}>{formatOrderId(matched.id)}</strong>
              <span className="muted"> · {new Date(matched.createdAt).toLocaleDateString()}</span>
            </div>
            <span className={`status status-${matched.status}`}>{matched.status.replace('_', ' ')}</span>
          </header>

          <OrderTimeline
            order={matched}
            lang={lang}
            createdAt={matched.createdAt}
            updatedAt={(matched as any).updatedAt}
          />

          <ul style={{ margin: '0.75rem 0', paddingLeft: '1.25rem' }}>
            {matched.items.map((it) => (
              <li key={`${it.productId}-${it.grade}`}>
                {it.emoji} {it.name} · {t(lang, 'grade')} {it.grade} × {it.qty}
              </li>
            ))}
          </ul>

          {/* 🛵 Out for Delivery Rider Contact Card */}
          {matched.status === 'out_for_delivery' && (
            <div
              style={{
                margin: '0.85rem 0',
                padding: '0.85rem 1rem',
                background: '#f0fdf4',
                border: '1.5px solid #86efac',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                boxShadow: '0 2px 8px rgba(22,101,52,0.1)',
              }}
            >
              <div>
                <div style={{ fontWeight: 800, color: '#166534', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🛵</span>
                  <span>{lang === 'bn' ? 'রাইডার আপনার অর্ডারের পথে রয়েছে!' : 'Rider is on the way!'}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#15803d', marginTop: '3px' }}>
                  {lang === 'bn' ? 'দরজায় তাজা সামগ্রী পৌঁছাতে প্রস্তুত' : 'Fresh produce arriving shortly at your door'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <a
                  href={`tel:${SUPPORT_PHONE}`}
                  className="btn btn-secondary btn-sm"
                  style={{
                    background: '#ffffff',
                    color: '#166534',
                    border: '1.5px solid #86efac',
                    fontWeight: 700,
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.82rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    textDecoration: 'none',
                  }}
                >
                  📞 {lang === 'bn' ? 'রাইডার / হেল্পলাইন' : 'Call Dispatch'}
                </a>
                <a
                  href={`https://wa.me/91${SUPPORT_PHONE.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                    lang === 'bn'
                      ? `নমস্কার, আমি অর্ডার #${formatOrderId(matched.id)}-এর কাস্টমার (${matched.userName})। ডেলিভারি লোকেশন/নির্দেশ:`
                      : `Hello, I am the customer for Order #${formatOrderId(matched.id)} (${matched.userName}). Delivery location/notes:`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{
                    background: '#25d366',
                    color: '#ffffff',
                    border: '1.5px solid #22c55e',
                    fontWeight: 700,
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.82rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    textDecoration: 'none',
                  }}
                >
                  💬 WhatsApp
                </a>
              </div>
            </div>
          )}

          {/* Address & phone are masked for privacy — only the owner (logged in) sees full details */}
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            {isOwner
              ? `📍 ${lang === 'bn' ? 'ডেলিভারি ঠিকানা:' : 'Delivery Address:'} ${matched.address} (PIN ${matched.pin})`
              : maskAddress(matched.address)}
          </p>
          {isOwner && (matched as any).deliveryNotes && (
            <p style={{ fontSize: '0.82rem', color: '#854d0e', background: '#fefce8', padding: '4px 10px', borderRadius: '6px', margin: '0.35rem 0' }}>
              🏛️ {lang === 'bn' ? 'ল্যান্ডমার্ক / নির্দেশ:' : 'Landmark / Note:'} {(matched as any).deliveryNotes}
            </p>
          )}
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            📞 {lang === 'bn' ? 'ফোন:' : 'Phone:'}{' '}
            {isOwner ? matched.phone : maskPhone(matched.phone)}
          </p>

          <footer style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              {t(lang, 'total')}: <strong style={{ fontSize: '1.1rem', color: '#166534' }}>₹{matched.total}</strong>
            </span>
            <span style={{ fontSize: '0.85rem' }}>
              {lang === 'bn' ? 'পেমেন্ট মোড:' : 'Payment Mode:'}{' '}
              <strong style={{ color: '#166534' }}>
                {matched.paymentType === 'full'
                  ? (lang === 'bn' ? 'সম্পূর্ণ (১০০%)' : 'Full (100%)')
                  : (lang === 'bn' ? `১০% অগ্রিম (₹${matched.advanceAmount})` : `10% Advance (₹${matched.advanceAmount})`)}
              </strong>
            </span>
          </footer>

          {/* Customer Self-Cancel within 15 mins */}
          {isOwner && matched.status !== 'cancelled' && (matched.status === 'pending' || matched.status === 'advance_paid') && (Date.now() - new Date(matched.createdAt).getTime() < 15 * 60 * 1000) && (
            <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid #f1f5f9' }}>
              <button
                type="button"
                className="btn btn-secondary warn"
                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                disabled={cancelling}
                onClick={() => handleCancelOrder(matched)}
              >
                {cancelling
                  ? (lang === 'bn' ? '⏳ বাতিল করা হচ্ছে...' : '⏳ Cancelling...')
                  : (lang === 'bn' ? '❌ অর্ডার বাতিল করুন (১৫ মিনিটের মধ্যে)' : '❌ Cancel Order (Within 15 mins)')}
              </button>
            </div>
          )}

          {/* Order Chat — only visible to the logged-in owner */}
          {isOwner && (
            <div style={{ marginTop: '1rem' }}>
              <OrderChat orderId={matched.id} role="customer" lang={lang} />
            </div>
          )}
        </article>
      )}

      <p className="hint" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <Link to="/auth">{lang === 'bn' ? 'লগইন করে সব অর্ডার দেখুন' : 'Log in to see all your orders'}</Link>
        {' · '}
        <Link to="/">{lang === 'bn' ? 'দোকানে ফিরুন' : 'Back to shop'}</Link>
      </p>
    </div>
  )
}
