import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useStore } from '../context/useStore'
import { DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT, SERVICEABLE_PINCODES } from '../lib/business'
import { calcDeliveryFee, isServiceablePin, STORE_LOCATION, checkLocationServiceability } from '../lib/delivery'
import { t } from '../lib/i18n'
import { UPI_BANK, UPI_ID, UPI_QR_SRC, generateDynamicUpiQr, buildUpiPayUri } from '../lib/payment'
import { getSavedDelivery, saveDelivery } from '../lib/storage'
import {
  validatePhoneStrict,
  getOrCreateCartIdempotencyKey,
  clearCartIdempotencyKey,
} from '../lib/validation'
import { isDealExpired } from '../lib/deals'
import { queueOfflineOrder } from '../lib/offlineQueue'
import type { Address } from '../types'

export default function Checkout() {
  const { user, updateUserProfile, refresh } = useAuth()
  const {
    cart,
    cartTotal,
    lang,
    placeOrder,
    orders,
    promotionalDeals,
    findRecentOrderByUtr,
    fetchAddresses,
    saveAddress,
    validateCoupon,
  } = useStore()
  const navigate = useNavigate()

  const userEditedAddress = useRef(false)
  const submitLockRef = useRef(false)
  const autoGpsAttempted = useRef(false)
  const [house, setHouse] = useState('')
  const [landmark, setLandmark] = useState('')
  const [area, setArea] = useState('')
  const [pin, setPin] = useState('721632')
  const [geoCoords, setGeoCoords] = useState('')
  const [geoLat, setGeoLat] = useState<number | undefined>(undefined)
  const [geoLng, setGeoLng] = useState<number | undefined>(undefined)
  const [detectingGps, setDetectingGps] = useState(false)
  const [locationStatus, setLocationStatus] = useState<{
    status: 'idle' | 'detecting' | 'verified' | 'out_of_range' | 'denied'
    distanceKm?: number
    fee?: number
    message?: string
  }>({ status: 'idle' })

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
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)

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

  const availableCoupons = useMemo(() => {
    return (promotionalDeals || [])
      .filter((d) => d.isActive !== false && d.couponCode && !isDealExpired(d))
      .map((d) => ({
        code: d.couponCode!.trim().toUpperCase(),
        title: lang === 'bn' ? d.titleBn : (d.titleEn || d.titleBn),
      }))
      .filter((v, idx, arr) => arr.findIndex((x) => x.code === v.code) === idx)
  }, [promotionalDeals, lang])

  const handleApplyCoupon = async (codeToApply: string) => {
    const clean = codeToApply.trim().toUpperCase()
    if (!clean) return

    // 🛡️ Promo Coupon Throttling: Max 4 checks per minute
    try {
      const raw = sessionStorage.getItem('gv_coupon_checks')
      const now = Date.now()
      let timestamps: number[] = raw ? JSON.parse(raw) : []
      timestamps = timestamps.filter((t) => now - t < 60000)
      if (timestamps.length >= 4) {
        setCouponError(
          lang === 'bn'
            ? '⚠️ খুব বেশি কুপন চেষ্টা করা হয়েছে। ১ মিনিট পরে চেষ্টা করুন।'
            : '⚠️ Too many coupon attempts. Please wait 1 minute.'
        )
        return
      }
      timestamps.push(now)
      sessionStorage.setItem('gv_coupon_checks', JSON.stringify(timestamps))
    } catch {}

    setCouponLoading(true)
    setCouponError('')
    try {
      const result = await validateCoupon(clean, cartTotal + delivery.fee)
      if (result && result.valid && result.discount) {
        setCouponApplied({
          discount: result.discount,
          message: result.message || `✅ ${lang === 'bn' ? 'কুপন প্রযোজ্য হয়েছে!' : 'Coupon applied!'}`,
        })
      } else {
        setCouponError(lang === 'bn' ? '❌ এই কুপন কোডটি বৈধ নয় বা মেয়াদ শেষ।' : '❌ Invalid or expired coupon code.')
      }
    } catch {
      setCouponError(lang === 'bn' ? 'কুপন যাচাই করা যায়নি। পরে চেষ্টা করুন।' : 'Could not verify coupon. Try again.')
    } finally {
      setCouponLoading(false)
    }
  }

  const coords = useMemo(() => (geoLat && geoLng ? { lat: geoLat, lng: geoLng } : null), [geoLat, geoLng])
  const delivery = useMemo(() => calcDeliveryFee(pin, coords, fulfillmentMode), [pin, coords, fulfillmentMode])
  const grandTotal = Math.max(0, cartTotal + delivery.fee - (couponApplied?.discount || 0))
  const [paymentMode, setPaymentMode] = useState<'advance' | 'full'>('advance')
  const advance = grandTotal > 0 ? Math.max(1, Math.ceil(grandTotal * 0.1)) : 0
  const payableAmount = paymentMode === 'full' ? grandTotal : advance
  const balanceDue = grandTotal - payableAmount
  const [dynamicQr, setDynamicQr] = useState<string>('')

  // Generate in-memory Dynamic UPI QR Code whenever payable amount changes
  useEffect(() => {
    let active = true
    if (payableAmount > 0) {
      generateDynamicUpiQr(payableAmount, `MS Vegetable Center Order ₹${payableAmount}`).then((dataUri) => {
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
      setPin(saved.pin || '721632')
      if (saved.landmark) setLandmark(saved.landmark)
      if (saved.geoLat && saved.geoLng) {
        setGeoLat(saved.geoLat)
        setGeoLng(saved.geoLng)
        setGeoCoords(`https://www.google.com/maps/search/?api=1&query=${saved.geoLat},${saved.geoLng}`)
      }
      setPrefilled(true)
      return
    }
    const last = orders
      .filter((o) => o.userId === user.id && o.status !== 'cancelled')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (last) {
      // Clean legacy recursive compounding in last.address
      const cleaned = last.address
        .replace(/Store Pickup.*?\)/gi, '')
        .replace(/Pickup - .*?\)/gi, '')
        .replace(/\(Near:.*?\)/gi, '')
        .replace(/\[Maps:.*?\]/gi, '')
        .replace(/GPS অবস্থান.*/gi, '')
        .trim()
      setHouse(cleaned || last.address)
      setPhone(last.phone)
      setPin(last.pin || '721632')
      if (last.deliveryNotes) setLandmark(last.deliveryNotes)
      if (last.geoLat && last.geoLng) {
        setGeoLat(last.geoLat)
        setGeoLng(last.geoLng)
        setGeoCoords(`https://www.google.com/maps/search/?api=1&query=${last.geoLat},${last.geoLng}`)
      }
      setPrefilled(true)
      return
    }
    try {
      const devLat = localStorage.getItem('gv_user_lat')
      const devLng = localStorage.getItem('gv_user_lng')
      if (devLat && devLng) {
        const pLat = parseFloat(devLat)
        const pLng = parseFloat(devLng)
        if (!isNaN(pLat) && !isNaN(pLng)) {
          setGeoLat(pLat)
          setGeoLng(pLng)
          setGeoCoords(`https://www.google.com/maps/search/?api=1&query=${pLat},${pLng}`)
        }
      }
    } catch {}
    if (user.email.endsWith('@greenvest.shop')) {
      const raw = user.email.replace('@greenvest.shop', '')
      if (/^\d{10}$/.test(raw)) setPhone(raw)
    }
  }, [user, orders])

  const handleDetectGps = useCallback((isAuto = false) => {
    if (!navigator.geolocation) {
      if (!isAuto) setError(lang === 'bn' ? 'ব্রাউজারে GPS সাপোর্ট নেই' : 'Geolocation is not supported by your browser')
      return
    }
    setDetectingGps(true)
    setLocationStatus({ status: 'detecting' })

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        setGeoCoords(mapUrl)
        setGeoLat(lat)
        setGeoLng(lng)

        try {
          localStorage.setItem('gv_user_lat', String(lat))
          localStorage.setItem('gv_user_lng', String(lng))
        } catch {}

        const check = await checkLocationServiceability(lat, lng)
        if (check.isServiceable) {
          if (check.detectedPin) {
            setPin(check.detectedPin)
            userEditedAddress.current = true
          }
          if (!area && check.detectedArea) {
            setArea(check.detectedArea)
            userEditedAddress.current = true
          }
          setLocationStatus({
            status: 'verified',
            distanceKm: check.distanceKm,
            fee: check.fee,
            message: lang === 'bn' ? check.noticeBn : check.noticeEn,
          })
        } else {
          setLocationStatus({
            status: 'out_of_range',
            distanceKm: check.distanceKm,
            fee: 0,
            message: lang === 'bn' ? check.noticeBn : check.noticeEn,
          })
        }
        setDetectingGps(false)
      },
      (err) => {
        setDetectingGps(false)
        console.warn('Geolocation error:', err)
        setLocationStatus({
          status: 'denied',
          message: lang === 'bn' ? 'লোকেশন অনুমতি পাওয়া যায়নি' : 'Location permission not granted',
        })
        if (!isAuto) {
          setError(lang === 'bn' ? 'GPS পাওয়া যায়নি — ডিভাইসের লোকেশন অন করুন' : 'Location not found — please turn on device location')
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    )
  }, [area, lang])

  // 📍 Auto-check location on checkout mount with user permission
  useEffect(() => {
    if (autoGpsAttempted.current) return
    if (fulfillmentMode !== 'delivery') return
    if (geoLat && geoLng) return
    autoGpsAttempted.current = true
    handleDetectGps(true)
  }, [fulfillmentMode, geoLat, geoLng, handleDetectGps])

  if (!user) return <Navigate to="/auth" replace />
  if (cart.length === 0) {
    return (
      <div className="page narrow">
        <h1>{lang === 'bn' ? 'চেকআউট' : 'Checkout'}</h1>
        <p className="empty text-center">{t(lang, 'emptyCart')}</p>
        <div className="text-center" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/')}
          >
            {lang === 'bn' ? 'দোকানে ফিরে যান' : 'Back to Shop'}
          </button>
        </div>
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
      : [house.trim(), landmark.trim() ? `(Near: ${landmark.trim()})` : '', area.trim()].filter(Boolean).join(', ')

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
          ? `বর্তমানে হোম ডেলিভারি শুধুমাত্র ${SERVICEABLE_PINCODES.join(', ')} পিন কোডে চালু রয়েছে।`
          : `Home delivery is currently available only in PIN codes: ${SERVICEABLE_PINCODES.join(', ')}.`,
      )
      submitLockRef.current = false
      return
    }

    if (!isPickup && delivery.isOutOfRange) {
      setError(
        lang === 'bn'
          ? `আপনার পিন কোড আমাদের ডেলিভারি সীমার বাইরে (অনুমোদিত পিন: ${SERVICEABLE_PINCODES.join(', ')})।`
          : `Your location is outside our delivery service area (Serviceable PINs: ${SERVICEABLE_PINCODES.join(', ')}).`,
      )
      submitLockRef.current = false
      return
    }

    // 2. UPI Payer Name Handling
    const finalPayerName = payerUpiName.trim() || user?.name || ''
    const cleanedUtr = 'ONLINE-PAY'

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
            geoLat,
            geoLng,
            landmark: landmark.trim() || undefined,
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
        deliveryNotes: landmark.trim() || undefined,
        discountAmount: couponApplied?.discount || 0,
        geoLat,
        geoLng,
        paymentType: paymentMode,
        advanceAmount: payableAmount,
      })

      clearTimeout(slowTimer)
      clearCartIdempotencyKey(user.id)

      if (order) {
        if (!isPickup) {
          saveDelivery(user.id, {
            address: house.trim(),
            phone: phoneVal.cleanedValue,
            pin: pin.trim(),
            geoLat,
            geoLng,
            landmark: landmark.trim() || undefined,
          })
          if (geoLat && geoLng) {
            try {
              localStorage.setItem('gv_user_lat', String(geoLat))
              localStorage.setItem('gv_user_lng', String(geoLng))
            } catch {}
          }
        }
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

          {/* 🚚 Delivery Schedule Trigger (Ultra-Clean 1-Row Pill) */}
          <div
            onClick={() => setShowDeliveryModal(true)}
            style={{
              margin: '0 0 0.85rem 0',
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              borderRadius: '12px',
              padding: '0.65rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '1.3rem' }}>
                {deliveryDateChoice === 'custom' ? '🗓️' : '⚡'}
              </span>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  {lang === 'bn' ? 'ডেলিভারির সময়' : 'Delivery Schedule'}
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>
                  {deliveryDateChoice === 'custom' && customDate
                    ? `📅 ${formatSelectedDate(customDate)}`
                    : (lang === 'bn' ? '⚡ স্ট্যান্ডার্ড ফাস্ট (১২–২৪ ঘণ্টা)' : '⚡ Standard Fast (12–24h)')}
                </div>
              </div>
            </div>

            <div style={{
              fontSize: '0.76rem',
              fontWeight: 700,
              color: '#166534',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              padding: '0.25rem 0.6rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}>
              {lang === 'bn' ? 'পরিবর্তন' : 'Change'} ❯
            </div>
          </div>

          {/* 💳 Payment Mode Switch (Advance, Full) */}
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
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: paymentMode === 'advance' ? '#166534' : '#1e293b' }}>
                  ⚡ {lang === 'bn' ? '১০% অগ্রিম' : '10% Advance'}
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
            </div>
          </div>

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
                    href={buildUpiPayUri(payableAmount, 'MS Vegetable Center Order')}
                    className="upi-app-btn"
                    style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1e293b' }}
                  >
                    <span style={{ color: '#0f9d58' }}>●</span> GPay
                  </a>
                  <a
                    href={buildUpiPayUri(payableAmount, 'MS Vegetable Center Order')}
                    className="upi-app-btn"
                    style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1e293b' }}
                  >
                    <span style={{ color: '#5f259f' }}>●</span> PhonePe
                  </a>
                  <a
                    href={buildUpiPayUri(payableAmount, 'MS Vegetable Center Order')}
                    className="upi-app-btn"
                    style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1e293b' }}
                  >
                    <span style={{ color: '#00baf2' }}>●</span> Paytm
                  </a>
                  <a
                    href={buildUpiPayUri(payableAmount, 'MS Vegetable Center Order')}
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
                  : (lang === 'bn' ? '⚡ অগ্রিম পাঠান (১০%)' : '⚡ Pay Advance (10%)')}
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
                onClick={() => void handleApplyCoupon(couponCode)}
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: '#eab308', color: '#1c1917', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
              >
                {couponLoading ? '⏳' : (lang === 'bn' ? 'প্রয়োগ করুন' : 'Apply')}
              </button>
            </div>

            {/* 🏷️ 1-Tap Available Coupon Offers */}
            {availableCoupons.length > 0 && (
              <div style={{ marginTop: '0.65rem', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#854d0e' }}>
                  {lang === 'bn' ? 'অফার:' : 'Offers:'}
                </span>
                {availableCoupons.map((c) => {
                  const isThisApplied = Boolean(couponApplied && couponCode.trim().toUpperCase() === c.code)
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        setCouponCode(c.code)
                        void handleApplyCoupon(c.code)
                      }}
                      style={{
                        background: isThisApplied ? '#dcfce7' : '#ffffff',
                        border: isThisApplied ? '1.5px solid #22c55e' : '1px dashed #ca8a04',
                        color: isThisApplied ? '#166534' : '#854d0e',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {isThisApplied ? '✅' : '🎟️'} <strong>{c.code}</strong>
                      {c.title && <span style={{ opacity: 0.85, fontWeight: 500 }}>({c.title})</span>}
                    </button>
                  )
                })}
              </div>
            )}

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
                <div style={{ fontSize: '0.74rem', color: '#166534', fontWeight: 600, marginTop: '0.15rem' }}>
                  {lang === 'bn' ? 'চার্জ: ₹৩০' : 'Delivery Fee: ₹30'}
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
                      if (addr.pin) setPin(addr.pin)
                      if (addr.landmark) setLandmark(addr.landmark)
                      if (addr.geoLat && addr.geoLng) {
                        setGeoLat(addr.geoLat)
                        setGeoLng(addr.geoLng)
                        setGeoCoords(`https://www.google.com/maps/search/?api=1&query=${addr.geoLat},${addr.geoLng}`)
                      }
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

              {/* 📍 Minimal Doorstep Auto-Location Card */}
              <div
                style={{
                  background: locationStatus.status === 'out_of_range' ? '#fef2f2' : '#f0fdf4',
                  border: locationStatus.status === 'out_of_range' ? '1.5px solid #fca5a5' : '1.5px solid #86efac',
                  borderRadius: '12px',
                  padding: '0.65rem 0.85rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{ fontSize: '1.15rem' }}>
                      {detectingGps ? '⏳' : locationStatus.status === 'out_of_range' ? '🔴' : geoCoords ? '🟢' : '📍'}
                    </span>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: locationStatus.status === 'out_of_range' ? '#991b1b' : '#166534' }}>
                        {detectingGps
                          ? (lang === 'bn' ? 'লোকেশন ও ডেলিভারি চার্জ যাচাই হচ্ছে...' : 'Checking doorstep delivery...')
                          : locationStatus.status === 'out_of_range'
                            ? (lang === 'bn' ? `ডেলিভারি এলাকার বাইরে (~${locationStatus.distanceKm} কিমি)` : `Outside Delivery Zone (~${locationStatus.distanceKm} km)`)
                            : geoCoords
                              ? (lang === 'bn'
                                ? `ডেলিভারি উপলব্ধ (${(locationStatus.fee ?? delivery.fee) === 50 ? '₹৫০' : '₹৩০'} · ~${locationStatus.distanceKm ?? delivery.distanceKm} কিমি)`
                                : `Delivery Verified: ₹${locationStatus.fee ?? delivery.fee} (~${locationStatus.distanceKm ?? delivery.distanceKm} km)`)
                              : (lang === 'bn' ? 'দরজায় ডেলিভারির জন্য লোকেশন চেক করুন' : 'Auto-check location for doorstep delivery')}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: locationStatus.status === 'out_of_range' ? '#b91c1c' : '#15803d', fontWeight: 500 }}>
                        {locationStatus.status === 'out_of_range'
                          ? (lang === 'bn' ? 'সর্বোচ্চ সীমা ১৫ কিমি। দোকান থেকে ফ্রি সংগ্রহ করুন।' : 'Max limit is 15 km. Free Store Pickup available.')
                          : geoCoords
                            ? (lang === 'bn' ? '✓ রাইডারের জন্য সঠিক GPS লিঙ্ক করা হয়েছে' : '✓ Exact GPS linked for rider')
                            : (lang === 'bn' ? '১-ট্যাপে লোকেশন ও পিন যাচাই করুন' : 'Tap to detect location & verify PIN')}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {locationStatus.status === 'out_of_range' ? (
                      <button
                        type="button"
                        onClick={() => setFulfillmentMode('pickup')}
                        style={{
                          background: '#166534',
                          color: '#ffffff',
                          border: 'none',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        🏪 {lang === 'bn' ? 'ফ্রি পিকআপ (₹০)' : 'Free Pickup (₹0)'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDetectGps(false)}
                        disabled={detectingGps}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #86efac',
                          color: '#166534',
                          padding: '4px 9px',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {detectingGps ? '⏳...' : geoCoords ? '🔄 GPS' : '📍 ' + (lang === 'bn' ? 'লোকেশন' : 'GPS')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 📍 Town / Village */}
              <label>
                📍 {lang === 'bn' ? 'গ্রাম / শহর' : 'Town / Village'}
                <input
                  value={area}
                  onChange={(e) => { setArea(e.target.value); userEditedAddress.current = true }}
                  required={fulfillmentMode === 'delivery'}
                  placeholder={lang === 'bn' ? 'যেমন: ভবানীপুর / নন্দকুমার' : 'e.g. Bhabanipur / Nandakumar'}
                />
              </label>

              {/* 🏡 House / Street / Para */}
              <label>
                🏡 {lang === 'bn' ? 'বাড়ি / পাড়া / রোড' : 'House / Street / Para'}
                <input
                  value={house}
                  onChange={(e) => { setHouse(e.target.value); userEditedAddress.current = true }}
                  required={fulfillmentMode === 'delivery'}
                  placeholder={lang === 'bn' ? 'যেমন: বিশ্বাস বাড়ি / মণ্ডল পাড়া' : 'e.g. Biswas House / Ward #4'}
                />
              </label>

              {/* 🏛️ Landmark (Optional) */}
              <label>
                🏛️ {lang === 'bn' ? 'ল্যান্ডমার্ক (ঐচ্ছিক)' : 'Landmark (Optional)'}
                <input
                  value={landmark}
                  onChange={(e) => { setLandmark(e.target.value); userEditedAddress.current = true }}
                  placeholder={lang === 'bn' ? 'যেমন: শিব মন্দিরের পাশে / স্কুলের বিপরীতে' : 'e.g. Near Shiv Temple / Opp. Primary School'}
                />
              </label>

              {/* 📮 1-Tap Serviceable PIN Code Selection */}
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label style={{ margin: 0, fontWeight: 700, fontSize: '0.84rem' }}>
                    📮 {lang === 'bn' ? 'ডেলিভারি পিন কোড (PIN)' : 'Delivery PIN Code'}
                  </label>
                  <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600 }}>
                    {delivery.fee > 0 ? (lang === 'bn' ? `চার্জ: ₹${delivery.fee}` : `Delivery: ₹${delivery.fee}`) : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {SERVICEABLE_PINCODES.map((p) => {
                    const isSelected = pin === p
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setPin(p)
                          userEditedAddress.current = true
                        }}
                        style={{
                          flex: 1,
                          padding: '0.55rem 0.35rem',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #166534' : '1px solid #cbd5e1',
                          background: isSelected ? '#dcfce7' : '#ffffff',
                          color: isSelected ? '#166534' : '#334155',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 1px 3px rgba(22,101,52,0.2)' : 'none',
                        }}
                      >
                        {p} {isSelected ? '✓' : ''}
                      </button>
                    )
                  })}
                </div>
              </div>

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
          <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '0.75rem', marginTop: '0.5rem' }}>
            <label style={{ margin: 0 }}>
              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                👤 {lang === 'bn' ? 'PhonePe / GPay প্রেরকের নাম (ঐচ্ছিক)' : 'UPI Payer Name (Optional)'}
              </span>
              <input
                value={payerUpiName}
                onChange={(e) => setPayerUpiName(e.target.value)}
                placeholder={lang === 'bn' ? 'যেমন: রাহুল সেন (UPI নাম)' : 'e.g. Rahul Sen (Name in UPI App)'}
                style={{ marginTop: '0.35rem', background: '#ffffff' }}
              />
            </label>
          </div>
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
              : (lang === 'bn' ? '✅ পেমেন্ট সম্পন্ন করেছি · অর্ডার জমা দিন' : '✅ I Have Paid · Place Order')}
          </button>
        </form>
      </div>

      {/* 🚚 Pop-Up Delivery Schedule Modal */}
      {showDeliveryModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowDeliveryModal(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(420px, 94vw)',
              borderRadius: '18px',
              padding: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ fontSize: '1.05rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🚚 {lang === 'bn' ? 'ডেলিভারির সময় নির্বাচন' : 'Choose Delivery Schedule'}
              </strong>
              <button
                type="button"
                onClick={() => setShowDeliveryModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
              {/* Option 1: Standard Fast */}
              <div
                onClick={() => {
                  setDeliveryDateChoice('standard')
                  setCustomDate('')
                }}
                style={{
                  padding: '0.85rem',
                  borderRadius: '12px',
                  border: deliveryDateChoice === 'standard' ? '2px solid #166534' : '1.5px solid #e2e8f0',
                  background: deliveryDateChoice === 'standard' ? '#f0fdf4' : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>⚡</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: deliveryDateChoice === 'standard' ? '#166534' : '#1e293b' }}>
                      {lang === 'bn' ? 'স্ট্যান্ডার্ড ফাস্ট ডেলিভারি' : 'Standard Fast Delivery'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                      {lang === 'bn' ? '১২–২৪ ঘণ্টার মধ্যে তাজা ডেলিভারি' : 'Fresh delivery within 12–24 hours'}
                    </div>
                  </div>
                </div>
                <span style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: deliveryDateChoice === 'standard' ? '6px solid #166534' : '2px solid #cbd5e1',
                  background: '#ffffff',
                  display: 'inline-block',
                }} />
              </div>

              {/* Option 2: Scheduled Date */}
              <div
                onClick={() => {
                  setDeliveryDateChoice('custom')
                  setCustomDate((curr) => curr || quickDates.defaultDate)
                }}
                style={{
                  padding: '0.85rem',
                  borderRadius: '12px',
                  border: deliveryDateChoice === 'custom' ? '2px solid #166534' : '1.5px solid #e2e8f0',
                  background: deliveryDateChoice === 'custom' ? '#f0fdf4' : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>🗓️</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: deliveryDateChoice === 'custom' ? '#166534' : '#1e293b' }}>
                        {lang === 'bn' ? 'পছন্দের নির্দিষ্ট তারিখ' : 'Scheduled Date'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        {customDate
                          ? (lang === 'bn' ? `নির্ধারিত: ${formatSelectedDate(customDate)}` : `Selected: ${formatSelectedDate(customDate)}`)
                          : (lang === 'bn' ? 'ভবিষ্যতের সুবিধাজনক দিন বেছে নিন' : 'Choose a future delivery date')}
                      </div>
                    </div>
                  </div>
                  <span style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: deliveryDateChoice === 'custom' ? '6px solid #166534' : '2px solid #cbd5e1',
                    background: '#ffffff',
                    display: 'inline-block',
                  }} />
                </div>

                {deliveryDateChoice === 'custom' && (
                  <div style={{ marginTop: '0.25rem', paddingTop: '0.65rem', borderTop: '1px dashed #bbf7d0' }} onClick={(e) => e.stopPropagation()}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#166534', marginBottom: '0.35rem' }}>
                      {lang === 'bn' ? 'তারিখ বেছে নিন:' : 'Select preferred date:'}
                    </label>
                    <input
                      type="date"
                      min={quickDates.minDate}
                      max={quickDates.maxDate}
                      value={customDate || quickDates.defaultDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1.5px solid #86efac',
                        fontSize: '0.92rem',
                        background: '#ffffff',
                        fontWeight: 600,
                        color: '#1e293b',
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.7rem', fontSize: '0.95rem', fontWeight: 700 }}
              onClick={() => setShowDeliveryModal(false)}
            >
              ✓ {lang === 'bn' ? 'নিশ্চিত করুন' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
