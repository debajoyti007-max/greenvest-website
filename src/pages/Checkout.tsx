import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT } from '../lib/business'
import { calcDeliveryFee } from '../lib/delivery'
import { t } from '../lib/i18n'
import { UPI_BANK, UPI_ID, UPI_QR_SRC } from '../lib/payment'
import { getSavedDelivery } from '../lib/storage'
import {
  validateUtrStrict,
  validatePhoneStrict,
  getOrCreateCartIdempotencyKey,
  clearCartIdempotencyKey,
} from '../lib/validation'
import type { Address } from '../types'

export default function Checkout() {
  const { user, updateUserProfile } = useAuth()
  const {
    cart,
    cartTotal,
    lang,
    placeOrder,
    orders,
    checkDuplicateUtr,
    findRecentOrderByUtr,
    fetchAddresses,
    saveAddress,
    validateCoupon,
  } = useStore()
  const navigate = useNavigate()

  const userEditedAddress = useRef(false)
  const submitLockRef = useRef(false)
  const [house, setHouse] = useState('')
  const [landmark, setLandmark] = useState('')
  const [area, setArea] = useState('')
  const [geoCoords, setGeoCoords] = useState('')
  const [geoLat, setGeoLat] = useState<number | undefined>(undefined)
  const [geoLng, setGeoLng] = useState<number | undefined>(undefined)
  const [detectingGps, setDetectingGps] = useState(false)

  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [utr, setUtr] = useState('')
  const [utrPasted, setUtrPasted] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [slowNetwork, setSlowNetwork] = useState(false)
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)

  const [couponCode, setCouponCode] = useState('')
  const [couponApplied, setCouponApplied] = useState<{ discount: number; message: string } | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [saveAddressToDb, setSaveAddressToDb] = useState(false)

  const delivery = useMemo(() => calcDeliveryFee(pin), [pin])
  const grandTotal = Math.max(0, cartTotal + delivery.fee - (couponApplied?.discount || 0))
  const [paymentMode, setPaymentMode] = useState<'advance' | 'full'>('advance')
  const advance = Math.ceil(grandTotal * 0.5)
  const payableAmount = paymentMode === 'full' ? grandTotal : advance
  const balanceDue = grandTotal - payableAmount

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true
    fetchAddresses(user.id).then((addrs) => {
      if (active) setSavedAddresses(addrs)
    })
    return () => {
      active = false
    }
  }, [user, fetchAddresses])

  useEffect(() => {
    if (userEditedAddress.current) return
    if (!user) return
    const saved = getSavedDelivery(user.id)
    if (saved?.address) {
      setHouse(saved.address)
      setPhone(saved.phone || '')
      setPin(saved.pin || '')
      setPrefilled(true)
      return
    }
    const last = orders
      .filter((o) => o.userId === user.id && o.status !== 'cancelled')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (last) {
      setHouse(last.address)
      setPhone(last.phone)
      setPin(last.pin || '')
      setPrefilled(true)
      return
    }
    if (user.email.endsWith('@greenvest.shop')) {
      const raw = user.email.replace('@greenvest.shop', '')
      if (/^\d{10}$/.test(raw)) setPhone(raw)
    }
  }, [user, orders])

  if (!user) return <Navigate to="/auth" replace />
  if (cart.length === 0) {
    return (
      <div className="page narrow">
        <h1>{lang === 'bn' ? 'চেকআউট' : 'Checkout'}</h1>
        <p className="empty">{lang === 'bn' ? 'কার্ট খালি।' : 'Nothing to checkout.'}</p>
        <Link to="/" className="btn btn-primary">
          {lang === 'bn' ? 'দোকানে যান' : 'Go to shop'}
        </Link>
      </div>
    )
  }
  if (cartTotal < MIN_ORDER_AMOUNT) {
    return <Navigate to="/cart" replace />
  }

  const copyUpi = async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(lang === 'bn' ? 'কপি করা যায়নি — নিজে টাইপ করুন' : 'Could not copy — please type manually')
    }
  }

  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      setError(lang === 'bn' ? 'আপনার ব্রাউজারে GPS সাপোর্ট নেই' : 'Geolocation is not supported by your browser')
      return
    }
    setDetectingGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        setGeoCoords(mapUrl)
        setGeoLat(lat)
        setGeoLng(lng)
        if (!area) setArea(lang === 'bn' ? 'GPS অবস্থান সংরক্ষিত' : 'GPS Location Saved')
        setDetectingGps(false)
      },
      () => {
        setDetectingGps(false)
        setError(lang === 'bn' ? 'GPS অবস্থান পাওয়া যায়নি' : 'Unable to detect GPS position')
      },
    )
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    // Anti-double-click atomic ref guard
    if (submitLockRef.current || submitting) return
    submitLockRef.current = true
    setError('')
    setSlowNetwork(false)

    const fullAddress = `${house.trim()} ${landmark.trim() ? `(Near: ${landmark.trim()})` : ''} ${area.trim()} ${geoCoords ? `[Maps: ${geoCoords}]` : ''}`.trim()

    if (!house.trim() || !area.trim()) {
      setError(lang === 'bn' ? 'বাড়ি ও এলাকার নাম দিন' : 'Please enter your House name and Area/Village')
      submitLockRef.current = false
      return
    }

    // 1. Strict 10-digit Indian Mobile Validation & Fake Blacklist Check
    const phoneVal = validatePhoneStrict(phone)
    if (!phoneVal.isValid) {
      setError(lang === 'bn' ? phoneVal.errorBn : phoneVal.errorEn)
      submitLockRef.current = false
      return
    }

    if (!pin.trim() || !/^\d{6}$/.test(pin.trim())) {
      setError(lang === 'bn' ? '৬ সংখ্যার পিন কোড দিন (যেমন: ৭২১৬৩২)' : 'Enter your 6-digit PIN code (e.g. 721632)')
      submitLockRef.current = false
      return
    }

    // 2. Strict 12-digit UPI UTR Validation & Fake Blacklist Check
    const utrVal = validateUtrStrict(utr)
    if (!utrVal.isValid) {
      setError(lang === 'bn' ? utrVal.errorBn : utrVal.errorEn)
      submitLockRef.current = false
      return
    }

    if (cartTotal < MIN_ORDER_AMOUNT) {
      setError(
        lang === 'bn'
          ? `সর্বনিম্ন অর্ডার ₹${MIN_ORDER_AMOUNT}`
          : `Minimum order is ₹${MIN_ORDER_AMOUNT}`,
      )
      submitLockRef.current = false
      return
    }

    setSubmitting(true)
    // Trigger reassuring feedback if network takes >2.5s
    const slowTimer = setTimeout(() => {
      setSlowNetwork(true)
    }, 2500)

    try {
      // 3. Duplicate UTR check in database
      const isDup = await checkDuplicateUtr(utrVal.cleanedValue)
      if (isDup) {
        setError(
          lang === 'bn'
            ? 'এই UTR নম্বরটি আগেই ব্যবহৃত হয়েছে। অনুগ্রহ করে আপনার নতুন পেমেন্টের আসল UTR নম্বর দিন।'
            : 'This UTR number has already been used for another order. Please enter your new payment UTR.',
        )
        clearTimeout(slowTimer)
        setSlowNetwork(false)
        setSubmitting(false)
        submitLockRef.current = false
        return
      }

      // 4. Save address if opted
      if (saveAddressToDb) {
        try {
          await saveAddress({
            user_id: user.id,
            label: 'Saved',
            address: fullAddress,
            phone: phoneVal.cleanedValue,
            pin: pin.trim(),
            is_default: savedAddresses.length === 0,
          })
        } catch (addrErr) {
          console.warn('Address save failed:', addrErr)
        }
      }

      // 5. Track idempotency session
      getOrCreateCartIdempotencyKey(user.id, grandTotal)

      // 6. Execute order placement
      const order = await placeOrder({
        address: fullAddress,
        phone: phoneVal.cleanedValue,
        pin: pin.trim(),
        utr: utrVal.cleanedValue,
        deliverySlot: 'morning',
        discountAmount: couponApplied?.discount || 0,
        geoLat,
        geoLng,
        paymentType: paymentMode,
        advanceAmount: payableAmount,
      })

      clearTimeout(slowTimer)
      clearCartIdempotencyKey(user.id)

      if (order) {
        if (user && phoneVal.cleanedValue) {
          updateUserProfile({ phone: phoneVal.cleanedValue }).catch(() => {})
        }
        navigate(`/orders/success/${order.id}`, { state: { order } })
      } else {
        // Fallback recovery check: did Supabase insert it despite network lag?
        const recovered = await findRecentOrderByUtr(utrVal.cleanedValue)
        if (recovered) {
          navigate(`/orders/success/${recovered.id}`, { state: { order: recovered } })
        } else {
          setError(
            lang === 'bn'
              ? 'অর্ডার প্রসেস করা যাচ্ছে না। অনুগ্রহ করে ইন্টারনেট সংযোগ চেক করে আবার চেষ্টা করুন।'
              : 'Could not place order. Please check your internet connection and try again.',
          )
        }
      }
    } catch (err) {
      clearTimeout(slowTimer)
      // Check if order succeeded despite client-side network drop
      try {
        const recovered = await findRecentOrderByUtr(utrVal.cleanedValue)
        if (recovered) {
          clearCartIdempotencyKey(user.id)
          navigate(`/orders/success/${recovered.id}`, { state: { order: recovered } })
          return
        }
      } catch (recErr) {
        console.warn('Recovery check error:', recErr)
      }

      const raw = err instanceof Error ? err.message : 'Order failed'
      if (/already been used|duplicate/i.test(raw)) {
        setError(
          lang === 'bn'
            ? 'এই UTR নম্বরটি দিয়ে ইতিমধ্যে একটি অর্ডার করা হয়েছে। নতুন পেমেন্টের সঠিক UTR দিন।'
            : 'This UTR number has already been used for another active order. Please provide a new UTR.',
        )
      } else if (/row-level security|policy/i.test(raw)) {
        setError(
          lang === 'bn'
            ? 'অর্ডার করার অনুমতি নেই। অনুগ্রহ করে একবার লগআউট করে আবার লগইন করুন।'
            : 'Permission denied. Please log out and log in again.',
        )
      } else if (/network|fetch|timeout/i.test(raw)) {
        setError(
          lang === 'bn'
            ? 'ইন্টারনেট সমস্যা বা সংযোগ বিচ্ছিন্ন হয়েছে। আবার চেষ্টা করুন।'
            : 'Network timeout. Check your internet connection and try again.',
        )
      } else {
        setError(
          lang === 'bn'
            ? `অর্ডার ব্যর্থ হয়েছে: ${raw}`
            : `Order failed: ${raw}`,
        )
      }
    } finally {
      clearTimeout(slowTimer)
      setSubmitting(false)
      setSlowNetwork(false)
    }
  }

  return (
    <div className="page narrow">
      <h1>{lang === 'bn' ? 'চেকআউট' : 'Checkout'}</h1>
      <p className="friendly-tip">{t(lang, 'howToPay')}</p>
      {prefilled && (
        <p className="hint">
          {lang === 'bn'
            ? 'আগের ঠিকানা ও ফোন অটো ভরা হয়েছে — চাইলে বদলাতে পারেন।'
            : 'Address & phone filled from your last order — edit if needed.'}
        </p>
      )}
      <div className="checkout-panel">
        <div className="pay-box">
          <h2>{lang === 'bn' ? 'পেমেন্ট ও অর্ডার বিবরণ' : 'Payment & Order Details'}</h2>
          <p>
            {lang === 'bn'
              ? `নিচের QR স্ক্যান করে বা UPI অ্যাপ দিয়ে পেমেন্ট করুন, তারপর ১২ সংখ্যার UTR দিন। ডেলিভারি ${DELIVERY_WINDOW_BN}।`
              : `Scan QR or pay via UPI app, then enter your 12-digit UTR. Delivery within ${DELIVERY_WINDOW}.`}
          </p>
          <p className="hint pay-eta">
            {lang === 'bn'
              ? `মিনিমাম অর্ডার ₹${MIN_ORDER_AMOUNT} · সময় ${DELIVERY_WINDOW_BN}`
              : `Min order ₹${MIN_ORDER_AMOUNT} · ETA ${DELIVERY_WINDOW}`}
          </p>

          {/* 💳 2-Way Dual Payment Switch */}
          <div style={{ margin: '0.85rem 0', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', display: 'block', marginBottom: '0.45rem' }}>
              💳 {lang === 'bn' ? 'পেমেন্ট মোড বেছে নিন:' : 'Choose Payment Option:'}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setPaymentMode('advance')}
                style={{
                  padding: '0.65rem 0.5rem',
                  borderRadius: '10px',
                  border: paymentMode === 'advance' ? '2px solid #166534' : '1px solid #cbd5e1',
                  background: paymentMode === 'advance' ? '#f0fdf4' : '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: paymentMode === 'advance' ? '#166534' : '#1e293b' }}>
                  ⚡ {lang === 'bn' ? '৫০% অগ্রিম' : '50% Advance'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.15rem' }}>
                  {lang === 'bn' ? `এখন ₹${advance} · বাকি ₹${balanceDue} ক্যাশ` : `Pay ₹${advance} now · ₹${balanceDue} due`}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMode('full')}
                style={{
                  padding: '0.65rem 0.5rem',
                  borderRadius: '10px',
                  border: paymentMode === 'full' ? '2px solid #166534' : '1px solid #cbd5e1',
                  background: paymentMode === 'full' ? '#f0fdf4' : '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: paymentMode === 'full' ? '#166534' : '#1e293b' }}>
                  💎 {lang === 'bn' ? '১০০% ফুল পে' : '100% Full Pay'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 600, marginTop: '0.15rem' }}>
                  {lang === 'bn' ? '✓ ক্যাশলেস ডেলিভারি' : '✓ Zero cash on delivery'}
                </div>
              </button>
            </div>
          </div>

          <div className="upi-pay">
            <img
              src={UPI_QR_SRC}
              alt={`UPI QR for ${UPI_ID}`}
              className="upi-qr"
              width={220}
              height={220}
            />
            <div className="upi-details">
              <p className="upi-label">UPI ID</p>
              <code className="upi-id">{UPI_ID}</code>
              <button type="button" className="btn btn-secondary" onClick={copyUpi}>
                {copied ? t(lang, 'copied') : t(lang, 'copyUpi')}
              </button>
              <p className="muted upi-bank">{UPI_BANK}</p>
              <p className="hint">
                {lang === 'bn'
                  ? 'PhonePe / GPay / Paytm / যেকোনো UPI অ্যাপ'
                  : 'Works on PhonePe, GPay, Paytm & all UPI apps'}
              </p>
              {/* ⚡ 1-Tap UPI Intent Apps */}
              <div style={{ marginTop: '0.6rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
                  {lang === 'bn' ? `⚡ ১-ট্যাপে ₹${payableAmount} সরাসরি পেমেন্ট করুন:` : `⚡ 1-Tap Quick Pay ₹${payableAmount}:`}
                </span>
                <div className="upi-app-grid">
                  <a
                    href={`upi://pay?pa=${UPI_ID}&pn=GreenVest&am=${payableAmount}&cu=INR&tn=GreenVest+Order`}
                    className="upi-app-btn"
                    style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1e293b' }}
                  >
                    <span style={{ color: '#0f9d58' }}>●</span> GPay
                  </a>
                  <a
                    href={`upi://pay?pa=${UPI_ID}&pn=GreenVest&am=${payableAmount}&cu=INR&tn=GreenVest+Order`}
                    className="upi-app-btn"
                    style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1e293b' }}
                  >
                    <span style={{ color: '#5f259f' }}>●</span> PhonePe
                  </a>
                  <a
                    href={`upi://pay?pa=${UPI_ID}&pn=GreenVest&am=${payableAmount}&cu=INR&tn=GreenVest+Order`}
                    className="upi-app-btn"
                    style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1e293b' }}
                  >
                    <span style={{ color: '#00baf2' }}>●</span> Paytm
                  </a>
                  <a
                    href={`upi://pay?pa=${UPI_ID}&pn=GreenVest&am=${payableAmount}&cu=INR&tn=GreenVest+Order`}
                    className="upi-app-btn"
                    style={{ background: '#166534', border: '1px solid #166534', color: '#ffffff' }}
                  >
                    ⚡ Pay ₹{payableAmount}
                  </a>
                </div>
              </div>
            </div>
          </div>

          <dl className="totals">
            <div>
              <dt>{t(lang, 'subtotal')}</dt>
              <dd>₹{cartTotal}</dd>
            </div>
            <div>
              <dt>{t(lang, 'delivery')}</dt>
              <dd style={{ color: '#16a34a', fontWeight: 700 }}>
                {delivery.fee === 0 ? (lang === 'bn' ? 'বিনামূল্যে (FREE)' : 'FREE') : `₹${delivery.fee}`}
              </dd>
            </div>
            {couponApplied && (
              <div>
                <dt style={{ color: '#16a34a' }}>🎟️ {lang === 'bn' ? 'কুপন ছাড়' : 'Coupon Discount'}</dt>
                <dd style={{ color: '#16a34a' }}>-₹{couponApplied.discount}</dd>
              </div>
            )}
            <div>
              <dt>{t(lang, 'total')}</dt>
              <dd>₹{grandTotal}</dd>
            </div>
            <div>
              <dt>
                {paymentMode === 'full'
                  ? (lang === 'bn' ? '💎 সম্পূর্ণ পেমেন্ট (১০০%)' : '💎 Full Payment (100%)')
                  : (lang === 'bn' ? '⚡ অগ্রিম পাঠান (৫০%)' : '⚡ Pay Advance (50%)')}
              </dt>
              <dd className="accent">₹{payableAmount}</dd>
            </div>
            {paymentMode === 'advance' && balanceDue > 0 && (
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                <dt>{lang === 'bn' ? 'বাকি টাকা (ডেলিভারিতে ক্যাশ)' : 'Balance Due on Delivery'}</dt>
                <dd style={{ fontWeight: 600 }}>₹{balanceDue}</dd>
              </div>
            )}
          </dl>

          {/* 🎟️ Coupon Code with 4-attempts/min Throttling */}
          <div style={{ marginTop: '1rem', background: 'linear-gradient(135deg,#fefce8,#fef9c3)', border: '1.5px solid #fde047', borderRadius: '12px', padding: '0.85rem 1rem' }}>
            <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.88rem', color: '#854d0e' }}>
              🎟️ {lang === 'bn' ? 'প্রমো কোড / কুপন আছে?' : 'Have a Promo Code / Coupon?'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={couponCode}
                onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); setCouponApplied(null) }}
                placeholder={lang === 'bn' ? 'কুপন কোড লিখুন' : 'Enter coupon code'}
                style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid #fde047', fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.05rem' }}
              />
              <button
                type="button"
                disabled={couponLoading || !couponCode.trim()}
                onClick={async () => {
                  if (!couponCode.trim()) return

                  // 🛡️ Promo Coupon Throttling: Max 4 checks per minute
                  try {
                    const raw = sessionStorage.getItem('gv_coupon_checks')
                    const now = Date.now()
                    let timestamps: number[] = raw ? JSON.parse(raw) : []
                    timestamps = timestamps.filter(t => now - t < 60000)
                    if (timestamps.length >= 4) {
                      setCouponError(lang === 'bn' ? '⚠️ খুব বেশি কুপন চেষ্টা করা হয়েছে। ১ মিনিট পরে চেষ্টা করুন।' : '⚠️ Too many coupon attempts. Please wait 1 minute.')
                      return
                    }
                    timestamps.push(now)
                    sessionStorage.setItem('gv_coupon_checks', JSON.stringify(timestamps))
                  } catch {}

                  setCouponLoading(true)
                  setCouponError('')
                  try {
                    const result = await validateCoupon(couponCode.trim(), cartTotal + delivery.fee)
                    if (result && result.valid && result.discount) {
                      setCouponApplied({ discount: result.discount, message: result.message || `✅ ${lang === 'bn' ? 'কুপন প্রযোজ্য হয়েছে!' : 'Coupon applied!'}` })
                    } else {
                      setCouponError(lang === 'bn' ? '❌ এই কুপন কোডটি বৈধ নয় বা মেয়াদ শেষ।' : '❌ Invalid or expired coupon code.')
                    }
                  } catch {
                    setCouponError(lang === 'bn' ? 'কুপন যাচাই করা যায়নি। পরে চেষ্টা করুন।' : 'Could not verify coupon. Try again.')
                  } finally {
                    setCouponLoading(false)
                  }
                }}
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: '#eab308', color: '#1c1917', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
              >
                {couponLoading ? '⏳' : (lang === 'bn' ? 'প্রয়োগ করুন' : 'Apply')}
              </button>
            </div>
            {couponApplied && <p style={{ color: '#166534', fontWeight: 600, fontSize: '0.85rem', margin: '0.4rem 0 0' }}>{couponApplied.message}</p>}
            {couponError && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0.4rem 0 0' }}>{couponError}</p>}
          </div>
        </div>

        <form className="form" onSubmit={onSubmit}>
          {savedAddresses.length > 0 && (
            <label>
              {lang === 'bn' ? 'সংরক্ষিত ঠিকানা নির্বাচন করুন' : 'Select a saved address'}
              <select onChange={e => {
                if (!e.target.value) return
                const addr = savedAddresses.find(a => a.id === Number(e.target.value))
                if (addr) {
                  setHouse(addr.address)
                  setPhone(addr.phone)
                  setPrefilled(true)
                }
              }}>
                <option value="">{lang === 'bn' ? 'নতুন ঠিকানা লিখুন...' : 'Enter new address...'}</option>
                {savedAddresses.map(a => (
                  <option key={a.id} value={a.id}>{a.label || a.address.slice(0, 35)}</option>
                ))}
              </select>
            </label>
          )}

          {/* Option 2: GPS Auto-Location Button */}
          <div className="gps-detector-box" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.85rem 1rem', borderRadius: '12px', marginBottom: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDetectGps}
              disabled={detectingGps}
              style={{ width: '100%', background: '#16a34a' }}
            >
              📍 {detectingGps ? (lang === 'bn' ? '⏳ অবস্থান চিহ্নিত করা হচ্ছে...' : '⏳ Detecting GPS...') : (lang === 'bn' ? 'আমার বর্তমান অবস্থান চিহ্নিত করুন (GPS)' : 'Auto-Fill My Location (GPS)')}
            </button>
            {geoCoords && <p className="hint" style={{ color: '#16a34a', marginTop: '0.4rem', margin: '0.4rem 0 0' }}>✓ {lang === 'bn' ? 'GPS অবস্থান সফলভাবে পিন করা হয়েছে!' : 'GPS coordinates linked for delivery rider!'}</p>}
          </div>

          {/* Option 1: Guided 3-Field Address Box */}
          <label>
            🏡 {lang === 'bn' ? 'বাড়ি / শপ / পারা নাম' : 'House / Shop / Para Name'}
            <input
              value={house}
              onChange={(e) => { setHouse(e.target.value); userEditedAddress.current = true }}
              required
              placeholder={lang === 'bn' ? 'যেমন: কয়েল বাগান, বিশ্বাস বাড়ি / House #12' : 'e.g. Biswas House, House #12'}
            />
          </label>

          <label>
            🏛️ {lang === 'bn' ? 'কাছের পরিচিত চিহ্নিত স্থান (ল্যান্ডমার্ক)' : 'Nearby Famous Landmark'}
            <input
              value={landmark}
              onChange={(e) => { setLandmark(e.target.value); userEditedAddress.current = true }}
              placeholder={lang === 'bn' ? 'যেমন: প্রাইমারি স্কুলের পাশে / হাসপাতাল মোড়' : 'e.g. Near Primary School / Hospital More'}
            />
          </label>

          <label>
            📍 {lang === 'bn' ? 'গ্রাম / শহর / এলাকা' : 'Village / Town / Area Name'}
            <input
              value={area}
              onChange={(e) => { setArea(e.target.value); userEditedAddress.current = true }}
              required
              placeholder={lang === 'bn' ? 'যেমন: কাঁথি শহর / সাবাজপুট' : 'e.g. Contai Town / Sabajput'}
            />
          </label>

          {/* 12-24 Hour Guaranteed Delivery Timeframe Banner */}
          <div className="delivery-timeframe-box" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.85rem 1rem', borderRadius: '12px', fontSize: '0.9rem', color: '#166534' }}>
            ⚡ <strong>{lang === 'bn' ? 'ডেলিভারি সময়:' : 'Delivery Timeframe:'}</strong> {lang === 'bn' ? `অর্ডার করার ${DELIVERY_WINDOW_BN}-এর মধ্যে সরাসরি ডোরস্টেপ ডেলিভারি।` : `Guaranteed doorstep delivery within ${DELIVERY_WINDOW}.`}
          </div>

          {/* 📶 Network Offline Alert */}
          {!isOnline && (
            <div
              style={{
                background: '#fef2f2',
                border: '1.5px solid #fca5a5',
                borderRadius: '12px',
                padding: '0.75rem 1rem',
                color: '#991b1b',
                fontWeight: 700,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}
            >
              <span>⚠️</span>
              <span>
                {lang === 'bn'
                  ? 'আপনার ইন্টারনেট সংযোগ বিচ্ছিন্ন! পুনরায় কানেক্ট হওয়ার চেষ্টা চলছে...'
                  : 'You appear to be offline! Attempting to reconnect...'}
              </span>
            </div>
          )}

          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span>{t(lang, 'phone')}</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: phone.length === 10 ? '#16a34a' : '#6b7280',
                }}
              >
                {phone.length === 10
                  ? (lang === 'bn' ? '✅ ১০ সংখ্যা ঠিক আছে' : '✅ 10 digits')
                  : `${phone.length}/10 ${lang === 'bn' ? 'সংখ্যা' : 'digits'}`}
              </span>
            </div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              required
              inputMode="numeric"
              maxLength={10}
              placeholder={lang === 'bn' ? '১০ সংখ্যার মোবাইল (যেমন 9876543210)' : '10-digit mobile (e.g. 9876543210)'}
            />
          </label>
          <label>
            📮 {lang === 'bn' ? 'আপনার এলাকার পিন কোড (৬ সংখ্যা)' : 'Your Area PIN Code (6 digits)'}
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              maxLength={6}
              inputMode="numeric"
              placeholder={lang === 'bn' ? 'যেমন: ৭২১৬৩২' : 'e.g. 721632'}
            />
          </label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '-0.5rem' }}>
            <input type="checkbox" checked={saveAddressToDb} onChange={e => setSaveAddressToDb(e.target.checked)} />
            {lang === 'bn' ? 'ভবিষ্যতের জন্য এই ঠিকানা সংরক্ষণ করুন' : 'Save this address for future'}
          </label>
          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span>{t(lang, 'utrLabel')}</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: utr.length === 12 ? '#16a34a' : '#6b7280',
                }}
              >
                {utr.length === 12
                  ? (lang === 'bn' ? '✅ ১২ সংখ্যা সম্পূর্ণ' : '✅ 12 digits valid')
                  : `${utr.length}/12 ${lang === 'bn' ? 'সংখ্যা' : 'digits'}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={utr}
                onChange={(e) => {
                  setUtr(e.target.value.replace(/\D/g, '').slice(0, 12))
                  setError('')
                }}
                placeholder={lang === 'bn' ? '১২ সংখ্যার UTR (যেমন 408123456789)' : '12-digit UTR (e.g. 408123456789)'}
                required
                maxLength={12}
                inputMode="numeric"
                style={{ flex: 1, letterSpacing: '0.05rem', fontFamily: 'monospace', fontWeight: 700 }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText()
                    const cleaned = text.replace(/\D/g, '').slice(0, 12)
                    if (cleaned) {
                      setUtr(cleaned)
                      setUtrPasted(true)
                    }
                  } catch {}
                }}
              >
                📋 {lang === 'bn' ? 'পেস্ট' : 'Paste'}
              </button>
            </div>
          </label>
          {utrPasted && <p className="hint" style={{ color: '#16a34a', marginTop: '-0.5rem' }}>UTR auto-filled from clipboard</p>}
          {error && <p className="form-error">{error}</p>}

          {/* ⏳ Slow Network Status Box */}
          {submitting && slowNetwork && (
            <div
              style={{
                background: '#eff6ff',
                border: '1.5px solid #93c5fd',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
                color: '#1e40af',
                fontSize: '0.85rem',
                lineHeight: 1.4,
                marginBottom: '0.75rem',
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '1.4rem' }}>⏳</span>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.15rem' }}>
                  {lang === 'bn' ? 'নেটওয়ার্ক ধীরগতির — প্রসেসিং চলছে...' : 'Slow Connection — Processing order...'}
                </strong>
                <span>
                  {lang === 'bn'
                    ? 'আপনার অর্ডারটি নিরাপদে রেকর্ড হচ্ছে। অনুগ্রহ করে পেজ রিফ্রেশ বা ব্যাক করবেন না।'
                    : 'Your order is being securely saved. Please do not refresh or close this tab.'}
                </span>
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={submitting || !isOnline}>
            {submitting ? (lang === 'bn' ? '⏳ অর্ডার হচ্ছে...' : '⏳ Placing order...') : t(lang, 'placeOrder')}
          </button>
        </form>
      </div>
    </div>
  )
}
