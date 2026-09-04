import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT, SERVICEABLE_PINCODES } from '../lib/business'
import { calcDeliveryFee, isServiceablePin, STORE_LOCATION } from '../lib/delivery'
import { t } from '../lib/i18n'
import { UPI_BANK, UPI_ID, UPI_QR_SRC, generateDynamicUpiQr, buildUpiPayUri } from '../lib/payment'
import { getSavedDelivery } from '../lib/storage'
import {
  validatePhoneStrict,
  getOrCreateCartIdempotencyKey,
  clearCartIdempotencyKey,
} from '../lib/validation'
import { queueOfflineOrder } from '../lib/offlineQueue'
import type { Address } from '../types'

export default function Checkout() {
  const { user, users, updateUserProfile, refresh } = useAuth()
  const {
    cart,
    cartTotal,
    lang,
    placeOrder,
    orders,
    findRecentOrderByUtr,
    fetchAddresses,
    saveAddress,
    validateCoupon,
    getUserKhataBalance,
  } = useStore()
  const navigate = useNavigate()

  const userEditedAddress = useRef(false)
  const submitLockRef = useRef(false)
  const [house, setHouse] = useState('')
  const [landmark, setLandmark] = useState('')
  const [area, setArea] = useState('')
  const [pin, setPin] = useState('')
  const [geoCoords, setGeoCoords] = useState('')
  const [geoLat, setGeoLat] = useState<number | undefined>(undefined)
  const [geoLng, setGeoLng] = useState<number | undefined>(undefined)
  const [detectingGps, setDetectingGps] = useState(false)

  const [phone, setPhone] = useState(user?.phone || '')
  const [payerUpiName, setPayerUpiName] = useState('')
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
  const [fulfillmentMode, setFulfillmentMode] = useState<'delivery' | 'pickup'>('delivery')
  const [deliveryDateChoice, setDeliveryDateChoice] = useState<'standard' | 'custom'>('standard')
  const [customDate, setCustomDate] = useState('')

  const isKhataPermitted = useMemo(() => {
    if (user?.khataApproved) return true
    if (!user) return false
    const match = users.find(
      (u) =>
        u.id === user.id ||
        (user.email && u.email?.toLowerCase() === user.email.toLowerCase()) ||
        (user.phone && u.phone === user.phone),
    )
    return Boolean(match?.khataApproved)
  }, [user, users])

  const quickDates = useMemo(() => {
    const today = new Date()
    const nextDay = new Date(today)
    nextDay.setDate(today.getDate() + 1)

    const toIso = (d: Date) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const max = new Date(today)
    max.setDate(today.getDate() + 7)

    return {
      defaultDate: toIso(nextDay),
      minDate: toIso(today),
      maxDate: toIso(max),
    }
  }, [])

  const formatSelectedDate = (isoStr: string) => {
    if (!isoStr) return ''
    const d = new Date(isoStr + 'T00:00:00')
    if (isNaN(d.getTime())) return isoStr
    const daysBn = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি']
    const monthsBn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const dayName = lang === 'bn' ? daysBn[d.getDay()] : d.toLocaleDateString('en-US', { weekday: 'short' })
    const month = monthsBn[d.getMonth()]
    return `${d.getDate()} ${month} (${dayName})`
  }

  const effectiveDeliveryDate = useMemo(() => {
    if (deliveryDateChoice === 'custom') {
      return customDate || quickDates.defaultDate
    }
    return 'standard'
  }, [deliveryDateChoice, customDate, quickDates])

  useEffect(() => {
    void refresh()
    const pending = sessionStorage.getItem('gv_pending_coupon')
    if (pending) {
      setCouponCode((curr) => curr || pending)
      sessionStorage.removeItem('gv_pending_coupon')
    }
  }, [refresh])

  const coords = useMemo(() => (geoLat && geoLng ? { lat: geoLat, lng: geoLng } : null), [geoLat, geoLng])
  const delivery = useMemo(() => calcDeliveryFee(pin, coords, fulfillmentMode), [pin, coords, fulfillmentMode])
  const grandTotal = Math.max(0, cartTotal + delivery.fee - (couponApplied?.discount || 0))
  const [paymentMode, setPaymentMode] = useState<'advance' | 'full' | 'khata'>('advance')
  const advance = Math.ceil(grandTotal * 0.5)
  const payableAmount = paymentMode === 'khata' ? 0 : paymentMode === 'full' ? grandTotal : advance
  const balanceDue = paymentMode === 'khata' ? grandTotal : grandTotal - payableAmount
  const [dynamicQr, setDynamicQr] = useState<string>('')

  // Generate in-memory Dynamic UPI QR Code whenever payable amount changes
  useEffect(() => {
    let active = true
    if (payableAmount > 0) {
      generateDynamicUpiQr(payableAmount, `GreenVest Order ₹${payableAmount}`).then((dataUri) => {
        if (active && dataUri) setDynamicQr(dataUri)
      })
    }
    return () => {
      active = false
    }
  }, [payableAmount])

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

    const isPickup = fulfillmentMode === 'pickup'
    const fullAddress = isPickup
      ? `Store Pickup - ${STORE_LOCATION.name} (${STORE_LOCATION.address})`
      : `${house.trim()} ${landmark.trim() ? `(Near: ${landmark.trim()})` : ''} ${area.trim()} ${geoCoords ? `[Maps: ${geoCoords}]` : ''}`.trim()

    if (!isPickup && (!house.trim() || !area.trim())) {
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

    if (!isPickup && (!pin.trim() || !/^\d{6}$/.test(pin.trim()))) {
      setError(lang === 'bn' ? `৬ সংখ্যার পিন কোড দিন (${SERVICEABLE_PINCODES.join(', ')})` : `Enter your 6-digit PIN code (${SERVICEABLE_PINCODES.join(', ')})`)
      submitLockRef.current = false
      return
    }

    if (!isPickup && !isServiceablePin(pin.trim())) {
      setError(
        lang === 'bn'
          ? `বর্তমানে হোম ডেলিভারি শুধুমাত্র ${SERVICEABLE_PINCODES.join(', ')} পিন কোডে চালু রয়েছে। অনুগ্রহ করে "দোকান থেকে সংগ্রহ" বেছে নিন।`
          : `Home delivery is currently available only in PIN codes: ${SERVICEABLE_PINCODES.join(', ')}. Please select Store Pickup.`,
      )
      submitLockRef.current = false
      return
    }

    if (!isPickup && delivery.isOutOfRange) {
      setError(
        lang === 'bn'
          ? `আপনার পিন কোড বা অবস্থান আমাদের ডেলিভারি সীমার বাইরে। অনুগ্রহ করে "দোকান থেকে সংগ্রহ" বেছে নিন বা ইন-অ্যাপ সাপোর্টে যোগাযোগ করুন।`
          : `Location is beyond our delivery service area. Please select "Store Pickup" or contact in-app support.`,
      )
      submitLockRef.current = false
      return
    }

    // 2. UPI Payer Name Handling
    const finalPayerName = payerUpiName.trim() || user?.name || ''
    const cleanedUtr = paymentMode === 'khata' ? 'KHATA-DEBIT' : 'ONLINE-PAY'

    if (cartTotal < MIN_ORDER_AMOUNT) {
      setError(
        lang === 'bn'
          ? `সর্বনিম্ন অর্ডার ₹${MIN_ORDER_AMOUNT}`
          : `Minimum order is ₹${MIN_ORDER_AMOUNT}`,
      )
      submitLockRef.current = false
      return
    }

    // 2.5 Khata Credit Limit Safety Check
    if (paymentMode === 'khata' && user) {
      const currentKhataBal = getUserKhataBalance(user.id)
      const creditLimit = user.khataCreditLimit || 2000
      if (currentKhataBal + grandTotal > creditLimit) {
        setError(
          lang === 'bn'
            ? `আপনার খাতার বকেয়া সীমা (₹${creditLimit}) অতিক্রম করছে। বর্তমান বকেয়া: ₹${currentKhataBal}। অনুগ্রহ করে বকেয়া পরিশোধ করুন বা ৫০% অগ্রিম পেমেন্ট বেছে নিন।`
            : `Order exceeds your approved Khata credit limit of ₹${creditLimit}. Current dues: ₹${currentKhataBal}. Please clear dues or select UPI Advance.`,
        )
        submitLockRef.current = false
        return
      }
    }

    setSubmitting(true)
    // Trigger reassuring feedback if network takes >2.5s
    const slowTimer = setTimeout(() => {
      setSlowNetwork(true)
    }, 2500)

    try {
      // 3. Save address if opted
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

      // 4. Track idempotency session
      getOrCreateCartIdempotencyKey(user.id, grandTotal)

      // 5. Execute order placement
      const order = await placeOrder({
        address: fullAddress,
        phone: phoneVal.cleanedValue,
        pin: isPickup ? STORE_LOCATION.pin : pin.trim(),
        utr: cleanedUtr,
        payerUpiName: finalPayerName,
        deliverySlot: 'morning',
        deliveryDate: effectiveDeliveryDate === 'standard' ? undefined : effectiveDeliveryDate,
        discountAmount: couponApplied?.discount || 0,
        geoLat,
        geoLng,
        paymentType: paymentMode,
        advanceAmount: payableAmount,
        isKhataOrder: paymentMode === 'khata',
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
        const recovered = await findRecentOrderByUtr(cleanedUtr)
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
        const recovered = await findRecentOrderByUtr(cleanedUtr)
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
            ? 'অর্ডারটি ইতিমধ্যে প্রক্রিয়াধীন রয়েছে।'
            : 'This order is already being processed.',
        )
      } else if (/row-level security|policy/i.test(raw)) {
        setError(
          lang === 'bn'
            ? 'অর্ডার করার অনুমতি নেই। অনুগ্রহ করে একবার লগআউট করে আবার লগইন করুন।'
            : 'Permission denied. Please log out and log in again.',
        )
      } else if (/network|fetch|timeout|offline/i.test(raw) || !navigator.onLine) {
        // 🚀 Offline Resilience Engine: Queue order payload in IndexedDB outbox
        const offlineId = `OFFLINE-${Date.now().toString().slice(-6)}`
        const orderPayload = {
          address: fullAddress,
          phone: phoneVal.cleanedValue,
          pin: isPickup ? STORE_LOCATION.pin : pin.trim(),
          utr: cleanedUtr,
          deliverySlot: 'morning',
          deliveryDate: effectiveDeliveryDate === 'standard' ? undefined : effectiveDeliveryDate,
          discountAmount: couponApplied?.discount || 0,
          geoLat,
          geoLng,
          paymentType: paymentMode,
          advanceAmount: payableAmount,
          isKhataOrder: paymentMode === 'khata',
        }
        await queueOfflineOrder(offlineId, orderPayload)
        clearCartIdempotencyKey(user.id)
        setError(
          lang === 'bn'
            ? '💾 ইন্টারনেট না থাকায় অর্ডারটি ডিভাইসে সেভ করা হয়েছে। সংযোগ পেলেই স্বয়ংক্রিয়ভাবে জমা হবে।'
            : '💾 Weak connection. Order saved offline and will automatically submit once online.',
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800 }}>{lang === 'bn' ? 'চেকআউট' : 'Checkout'}</h1>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '12px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
            ⚡ {DELIVERY_WINDOW_BN}
          </span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '12px', background: '#f1f5f9', color: '#475569' }}>
            🔒 {lang === 'bn' ? 'নিরাপদ পেমেন্ট' : 'Secure Pay'}
          </span>
        </div>
      </div>

      <div className="checkout-panel">
        <div className="pay-box">
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.5rem 0' }}>{lang === 'bn' ? 'পেমেন্ট ও ডেলিভারি' : 'Payment & Delivery'}</h2>

          {/* 📅 Optional Delivery Date Selector (Premium Minimalist) */}
          <div style={{ margin: '0 0 0.85rem 0', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📅 {lang === 'bn' ? 'ডেলিভারির দিন:' : 'Delivery Day:'}
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b', background: '#e2e8f0', padding: '1px 6px', borderRadius: '6px' }}>
                  {lang === 'bn' ? 'ঐচ্ছিক' : 'Optional'}
                </span>
              </span>
              {deliveryDateChoice !== 'standard' && (
                <button
                  type="button"
                  onClick={() => { setDeliveryDateChoice('standard'); setCustomDate('') }}
                  style={{ fontSize: '0.72rem', color: '#166534', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                >
                  ↺ {lang === 'bn' ? 'রিসেট' : 'Reset'}
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
              <button
                type="button"
                onClick={() => { setDeliveryDateChoice('standard'); setCustomDate('') }}
                style={{
                  padding: '0.65rem 0.5rem',
                  borderRadius: '10px',
                  border: deliveryDateChoice === 'standard' ? '2px solid #166534' : '1px solid #cbd5e1',
                  background: deliveryDateChoice === 'standard' ? '#f0fdf4' : '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: deliveryDateChoice === 'standard' ? '#166534' : '#1e293b' }}>
                  ⚡ {lang === 'bn' ? 'স্ট্যান্ডার্ড' : 'Standard Fast'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                  12–24h
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDeliveryDateChoice('custom')
                  setCustomDate((curr) => curr || quickDates.defaultDate)
                }}
                style={{
                  padding: '0.65rem 0.5rem',
                  borderRadius: '10px',
                  border: deliveryDateChoice === 'custom' ? '2px solid #166534' : '1px solid #cbd5e1',
                  background: deliveryDateChoice === 'custom' ? '#f0fdf4' : '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: deliveryDateChoice === 'custom' ? '#166534' : '#1e293b' }}>
                  🗓️ {lang === 'bn' ? 'পছন্দের তারিখ' : 'Scheduled Date'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                  {customDate ? formatSelectedDate(customDate) : (lang === 'bn' ? 'তারিখ বেছে নিন' : 'Pick a Date')}
                </div>
              </button>
            </div>

            {deliveryDateChoice === 'custom' && (
              <div style={{ marginTop: '0.6rem', padding: '0.6rem', background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534' }}>
                    {lang === 'bn' ? 'ক্যালেন্ডার থেকে দিন সিলেক্ট করুন:' : 'Select preferred date:'}
                  </span>
                  {customDate && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '1px 8px', borderRadius: '10px', border: '1px solid #86efac' }}>
                      ✓ {formatSelectedDate(customDate)}
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  min={quickDates.minDate}
                  max={quickDates.maxDate}
                  value={customDate || quickDates.defaultDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.6rem',
                    borderRadius: '8px',
                    border: '1.5px solid #86efac',
                    fontSize: '0.9rem',
                    background: '#ffffff',
                    fontWeight: 600,
                  }}
                />
              </div>
            )}
          </div>

          {/* 💳 Payment Mode Switch (Advance, Full, Khata) */}
          <div style={{ margin: '0.85rem 0', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', display: 'block', marginBottom: '0.45rem' }}>
              💳 {lang === 'bn' ? 'পেমেন্ট মোড বেছে নিন:' : 'Choose Payment Option:'}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: isKhataPermitted ? '1fr 1fr 1fr' : '1fr 1fr', gap: '0.5rem' }}>
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
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: paymentMode === 'advance' ? '#166534' : '#1e293b' }}>
                  ⚡ {lang === 'bn' ? '৫০% অগ্রিম' : '50% Advance'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.15rem' }}>
                  {lang === 'bn' ? `এখন ₹${advance} · বাকি ক্যাশ` : `Pay ₹${advance} now`}
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
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: paymentMode === 'full' ? '#166534' : '#1e293b' }}>
                  💎 {lang === 'bn' ? '১০০% ফুল পে' : '100% Full Pay'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600, marginTop: '0.15rem' }}>
                  {lang === 'bn' ? '✓ ক্যাশলেস' : '✓ Zero cash'}
                </div>
              </button>

              {isKhataPermitted && (
                <button
                  type="button"
                  onClick={() => setPaymentMode('khata')}
                  style={{
                    padding: '0.65rem 0.5rem',
                    borderRadius: '10px',
                    border: paymentMode === 'khata' ? '2px solid #7c3aed' : '1px solid #c4b5fd',
                    background: paymentMode === 'khata' ? '#f5f3ff' : '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: paymentMode === 'khata' ? '#7c3aed' : '#5b21b6' }}>
                    📒 {lang === 'bn' ? 'খাতা পে (বাকি)' : 'Khata Pay'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600, marginTop: '0.15rem' }}>
                    {lang === 'bn' ? '✓ পরে পেমেন্ট' : '✓ Pay Later'}
                  </div>
                </button>
              )}
            </div>
          </div>

          {paymentMode === 'khata' ? (
            <div style={{ background: '#f5f3ff', border: '1.5px solid #c4b5fd', borderRadius: '12px', padding: '1rem', color: '#5b21b6', margin: '1rem 0' }}>
              <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '4px' }}>
                📒 {lang === 'bn' ? 'খাতা বুক পে সক্রিয়' : 'Khata Book Credit Active'}
              </strong>
              <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5 }}>
                {lang === 'bn'
                  ? `আপনার এই অর্ডারের মোট ₹${grandTotal} আপনার ডিজিটাল খাতা বুকে যোগ করা হবে। এখনই কোনো অগ্রিম পেমেন্ট দিতে হবে না।`
                  : `Total ₹${grandTotal} for this order will be debited to your digital Khata ledger. No advance payment required right now.`}
              </p>
            </div>
          ) : (
            <div className="upi-pay">
              <div className="dynamic-qr-wrapper">
                <img
                  src={dynamicQr || UPI_QR_SRC}
                  alt={`Dynamic UPI QR for ₹${payableAmount}`}
                  className="upi-qr"
                  width={220}
                  height={220}
                />
                <span className="dynamic-qr-badge">
                  🔒 {lang === 'bn' ? `₹${payableAmount} অটো-লক করা QR` : `₹${payableAmount} Auto-Locked QR`}
                </span>
              </div>

              <div className="upi-details">
                <p className="upi-label">UPI ID</p>
                <code className="upi-id">{UPI_ID}</code>
                <button type="button" className="btn btn-secondary" onClick={copyUpi}>
                  {copied ? t(lang, 'copied') : t(lang, 'copyUpi')}
                </button>
                <p className="muted upi-bank">{UPI_BANK}</p>
                {/* ⚡ 1-Tap UPI Intent Apps */}
                <div style={{ marginTop: '0.6rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
                    {lang === 'bn' ? `⚡ ১-ট্যাপে ₹${payableAmount} সরাসরি পেমেন্ট করুন:` : `⚡ 1-Tap Quick Pay ₹${payableAmount}:`}
                  </span>
                  <div className="upi-app-grid">
                    <a
                      href={buildUpiPayUri(payableAmount, 'GreenVest Order')}
                      className="upi-app-btn"
                      style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1e293b' }}
                    >
                      <span style={{ color: '#0f9d58' }}>●</span> GPay
                    </a>
                    <a
                      href={buildUpiPayUri(payableAmount, 'GreenVest Order')}
                      className="upi-app-btn"
                      style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1e293b' }}
                    >
                      <span style={{ color: '#5f259f' }}>●</span> PhonePe
                    </a>
                    <a
                      href={buildUpiPayUri(payableAmount, 'GreenVest Order')}
                      className="upi-app-btn"
                      style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1e293b' }}
                    >
                      <span style={{ color: '#00baf2' }}>●</span> Paytm
                    </a>
                    <a
                      href={buildUpiPayUri(payableAmount, 'GreenVest Order')}
                      className="upi-app-btn"
                      style={{ background: '#166534', border: '1px solid #166534', color: '#ffffff' }}
                    >
                      ⚡ Pay ₹{payableAmount}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

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
          {/* 🚚 Fulfillment Option: Home Delivery vs Store Pickup */}
          <div style={{ marginBottom: '1rem', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', display: 'block', marginBottom: '0.45rem' }}>
              📦 {lang === 'bn' ? 'অর্ডার গ্রহণের মাধ্যম:' : 'Fulfillment Option:'}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setFulfillmentMode('delivery')}
                style={{
                  padding: '0.65rem 0.5rem',
                  borderRadius: '10px',
                  border: fulfillmentMode === 'delivery' ? '2px solid #166534' : '1px solid #cbd5e1',
                  background: fulfillmentMode === 'delivery' ? '#f0fdf4' : '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: fulfillmentMode === 'delivery' ? '#166534' : '#1e293b' }}>
                  🚚 {lang === 'bn' ? 'হোম ডেলিভারি' : 'Home Delivery'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.15rem' }}>
                  {lang === 'bn' ? '০-৫কিমি ₹৩০ · ৫-১৫কিমি ₹৫০' : '0-5km ₹30 · 5-15km ₹50'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFulfillmentMode('pickup')}
                style={{
                  padding: '0.65rem 0.5rem',
                  borderRadius: '10px',
                  border: fulfillmentMode === 'pickup' ? '2px solid #166534' : '1px solid #cbd5e1',
                  background: fulfillmentMode === 'pickup' ? '#f0fdf4' : '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: fulfillmentMode === 'pickup' ? '#166534' : '#1e293b' }}>
                  🏪 {lang === 'bn' ? 'দোকান থেকে পিকআপ' : 'Store Pickup'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 600, marginTop: '0.15rem' }}>
                  {lang === 'bn' ? '✓ ₹০ ডেলিভারি চার্জ' : '✓ ₹0 Delivery Charge'}
                </div>
              </button>
            </div>
          </div>

          {/* 🏪 Store Pickup Showcase Card */}
          {fulfillmentMode === 'pickup' && (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '1.3rem' }}>🏪</span>
                <strong style={{ color: '#166534', fontSize: '0.95rem' }}>
                  {lang === 'bn' ? `${STORE_LOCATION.nameBn} আউটলেট থেকে সরাসরি সংগ্রহ` : `Pickup at ${STORE_LOCATION.name} Store Outlet`}
                </strong>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#374151', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
                📍 <strong>{lang === 'bn' ? 'ঠিকানা:' : 'Address:'}</strong> {lang === 'bn' ? STORE_LOCATION.addressBn : STORE_LOCATION.address}
              </p>
              <p style={{ fontSize: '0.82rem', color: '#15803d', fontWeight: 600, margin: '0 0 0.75rem' }}>
                🟢 {lang === 'bn' ? `খোলা থাকে: ${STORE_LOCATION.hoursBn}` : `Store Hours: ${STORE_LOCATION.hours}`} · 📞 {STORE_LOCATION.phone}
              </p>
              <a
                href={STORE_LOCATION.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
              >
                🗺️ {lang === 'bn' ? 'Google Maps-এ দোকানের রাস্তা দেখুন' : 'Get Store Directions on Google Maps'}
              </a>
            </div>
          )}

          {/* 🚚 Home Delivery Distance & Address Section */}
          {fulfillmentMode === 'delivery' && (
            <>
              <div style={{
                background: delivery.isOutOfRange ? '#fef2f2' : '#f0fdf4',
                border: delivery.isOutOfRange ? '1.5px solid #fca5a5' : '1px solid #bbf7d0',
                padding: '0.65rem 0.85rem',
                borderRadius: '10px',
                fontSize: '0.84rem',
                color: delivery.isOutOfRange ? '#dc2626' : '#166534',
                marginBottom: '0.75rem',
                fontWeight: 600,
              }}>
                {lang === 'bn' ? delivery.noticeBn : delivery.noticeEn}
              </div>

              {prefilled && (
                <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600, marginBottom: '0.4rem' }}>
                  ✓ {lang === 'bn' ? 'ঠিকানা স্বয়ংক্রিয়ভাবে লোড হয়েছে' : 'Address auto-loaded from profile'}
                </div>
              )}

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
                  style={{ width: '100%', background: '#166534' }}
                >
                  📍 {detectingGps ? (lang === 'bn' ? '⏳ অবস্থান চিহ্নিত করা হচ্ছে...' : '⏳ Detecting GPS...') : (lang === 'bn' ? 'আমার বর্তমান অবস্থান চিহ্নিত করুন (GPS)' : 'Auto-Fill My Location (GPS)')}
                </button>
                {geoCoords && <p className="hint" style={{ color: '#166534', marginTop: '0.4rem', margin: '0.4rem 0 0' }}>✓ {lang === 'bn' ? 'GPS অবস্থান সফলভাবে পিন করা হয়েছে!' : 'GPS coordinates linked for delivery rider!'}</p>}
              </div>

              {/* Address Form Inputs */}
              <label>
                🏡 {lang === 'bn' ? 'বাড়ি / এলাকা' : 'House / Street / Area'}
                <input
                  value={house}
                  onChange={(e) => { setHouse(e.target.value); userEditedAddress.current = true }}
                  required={fulfillmentMode === 'delivery'}
                  placeholder={lang === 'bn' ? 'যেমন: কয়েল বাগান, বিশ্বাস বাড়ি' : 'e.g. Biswas House, Street #12'}
                />
              </label>

              <label>
                🏛️ {lang === 'bn' ? 'ল্যান্ডমার্ক (ঐচ্ছিক)' : 'Landmark (Optional)'}
                <input
                  value={landmark}
                  onChange={(e) => { setLandmark(e.target.value); userEditedAddress.current = true }}
                  placeholder={lang === 'bn' ? 'যেমন: প্রাইমারি স্কুলের পাশে / হাসপাতাল মোড়' : 'e.g. Near School / Hospital More'}
                />
              </label>

              <label>
                📍 {lang === 'bn' ? 'গ্রাম / শহর' : 'Town / Village'}
                <input
                  value={area}
                  onChange={(e) => { setArea(e.target.value); userEditedAddress.current = true }}
                  required={fulfillmentMode === 'delivery'}
                  placeholder={lang === 'bn' ? 'যেমন: সুতাহাটা / মহিষাদল' : 'e.g. Sutahata / Mahishadal'}
                />
              </label>

              <label>
                📮 {lang === 'bn' ? 'পিন কোড (PIN)' : 'PIN Code'}
                <input
                  type="text"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, ''))
                    userEditedAddress.current = true
                  }}
                  required={fulfillmentMode === 'delivery'}
                  placeholder={lang === 'bn' ? '৭২১৬৩২' : '721632'}
                />
              </label>

              <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '-0.25rem' }}>
                <input type="checkbox" checked={saveAddressToDb} onChange={e => setSaveAddressToDb(e.target.checked)} />
                {lang === 'bn' ? 'ভবিষ্যতের জন্য এই ঠিকানা সেভ রাখুন' : 'Save this address for future'}
              </label>
            </>
          )}

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

          {/* 📱 Customer Mobile Number */}
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
          {paymentMode !== 'khata' && (
            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '0.75rem', marginTop: '0.5rem' }}>
              <label style={{ margin: 0 }}>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  👤 {lang === 'bn' ? 'PhonePe / GPay প্রেরকের নাম (ঐচ্ছিক)' : 'UPI Payer Name (Optional)'}
                </span>
                <input
                  value={payerUpiName}
                  onChange={(e) => setPayerUpiName(e.target.value)}
                  placeholder={lang === 'bn' ? `যেমন: ${user?.name || 'Rahul'}` : `e.g. ${user?.name || 'Rahul'}`}
                  style={{ marginTop: '0.35rem', background: '#ffffff' }}
                />
              </label>
            </div>
          )}
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

          <button type="submit" className="btn btn-primary" disabled={submitting || !isOnline} style={{ fontSize: '1.05rem', padding: '0.9rem', fontWeight: 800 }}>
            {submitting
              ? (lang === 'bn' ? '⏳ অর্ডার হচ্ছে...' : '⏳ Placing order...')
              : paymentMode === 'khata'
                ? (lang === 'bn' ? '📒 খাতা অর্ডারে কনফার্ম করুন' : '📒 Confirm Khata Order')
                : (lang === 'bn' ? '✅ পেমেন্ট সম্পন্ন করেছি · অর্ডার জমা দিন' : '✅ I Have Paid · Place Order')}
          </button>
        </form>
      </div>
    </div>
  )
}
