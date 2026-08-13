import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT } from '../lib/business'
import { calcDeliveryFee } from '../lib/delivery'
import { t } from '../lib/i18n'
import { UPI_BANK, UPI_ID, UPI_QR_SRC } from '../lib/payment'
import { getSavedDelivery } from '../lib/storage'
import type { Address, DeliveryZone } from '../types'

export default function Checkout() {
  const { user } = useAuth()
  const { cart, cartTotal, lang, placeOrder, orders, checkDuplicateUtr, fetchAddresses, fetchDeliveryZones, saveAddress, validateCoupon } = useStore()
  const navigate = useNavigate()

  const userEditedAddress = useRef(false)
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

  const [couponCode, setCouponCode] = useState('')
  const [couponApplied, setCouponApplied] = useState<{ discount: number; message: string } | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [zonesLoading, setZonesLoading] = useState(true)
  const [saveAddressToDb, setSaveAddressToDb] = useState(false)

  const delivery = useMemo(() => calcDeliveryFee(pin || '721632', zones), [zones, pin])
  const grandTotal = cartTotal + delivery.fee - (couponApplied?.discount || 0)
  const advance = Math.ceil(grandTotal * 0.5)

  useEffect(() => {
    if (!user) return
    let active = true
    fetchAddresses(user.id).then(addrs => { if (active) setSavedAddresses(addrs) })
    fetchDeliveryZones().then(z => { if (active) { setZones(z); setZonesLoading(false) } }).catch(() => { setZonesLoading(false) })
    return () => { active = false }
  }, [user, fetchAddresses, fetchDeliveryZones])

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
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
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
      }
    )
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)

    const fullAddress = `${house.trim()} ${landmark.trim() ? `(Near: ${landmark.trim()})` : ''} ${area.trim()} ${geoCoords ? `[Maps: ${geoCoords}]` : ''}`.trim()

    if (!house.trim() || !area.trim()) {
      setError(lang === 'bn' ? 'বাড়ি ও এলাকার নাম দিন' : 'Please enter your House name and Area/Village')
      setSubmitting(false)
      return
    }
    if (!phone.trim()) {
      setError(lang === 'bn' ? 'ফোন নম্বর দিন' : 'Please enter your phone number')
      setSubmitting(false)
      return
    }
    if (!pin.trim() || !/^\d{6}$/.test(pin.trim())) {
      setError(lang === 'bn' ? '৬ সংখ্যার পিন কোড দিন (যেমন: ৭২১৬৩২)' : 'Enter your 6-digit PIN code (e.g. 721632)')
      setSubmitting(false)
      return
    }
    if (!utr.trim()) {
      setError(lang === 'bn' ? 'UTR নম্বর দিন' : 'Please enter your UTR number')
      setSubmitting(false)
      return
    }
    if (utr.trim().length < 8) {
      setError(lang === 'bn' ? 'সঠিক UTR দিন' : 'Enter a valid UTR (min 8 characters)')
      setSubmitting(false)
      return
    }
    if (cartTotal < MIN_ORDER_AMOUNT) {
      setError(
        lang === 'bn'
          ? `সর্বনিম্ন অর্ডার ₹${MIN_ORDER_AMOUNT}`
          : `Minimum order is ₹${MIN_ORDER_AMOUNT}`,
      )
      setSubmitting(false)
      return
    }
    const isDup = await checkDuplicateUtr(utr.trim())
    if (isDup) {
      setError(
        lang === 'bn'
          ? 'এই UTR নম্বরটি আগেই ব্যবহৃত হয়েছে। নতুন UTR নম্বর দিন।'
          : 'This UTR number has already been used for another order.',
      )
      setSubmitting(false)
      return
    }
    try {
      if (saveAddressToDb) {
        try {
          await saveAddress({ user_id: user.id, label: 'Saved', address: fullAddress, phone, pin: pin.trim(), is_default: savedAddresses.length === 0 })
        } catch (addrErr) {
          console.warn('Address save failed:', addrErr)
        }
      }
      const order = await placeOrder({ address: fullAddress, phone, pin: pin.trim(), utr, deliverySlot: 'morning', discountAmount: couponApplied?.discount || 0, zones, geoLat, geoLng })
      if (order) navigate(`/orders/success/${order.id}`, { state: { order } })
      else setError(lang === 'bn' ? 'অর্ডার প্রসেস করা যাচ্ছে না। আবার চেষ্টা করুন।' : 'Could not place order. Please try again.')
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Order failed'
      if (/row-level security|policy/i.test(raw)) {
        setError(lang === 'bn' ? 'অর্ডার করার অনুমতি নেই। আবার লগইন করুন।' : 'Permission denied. Please log out and log in again.')
      } else if (/network|fetch|timeout/i.test(raw)) {
        setError(lang === 'bn' ? 'ইন্টারনেট সমস্যা। আবার চেষ্টা করুন।' : 'Network error. Check your internet and try again.')
      } else {
        setError(raw)
      }
    } finally {
      setSubmitting(false)
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
          <h2>{lang === 'bn' ? 'অগ্রিম পেমেন্ট (ম্যানুয়াল UTR)' : 'Advance payment (manual UTR)'}</h2>
          <p>
            {lang === 'bn'
              ? `নিচের QR স্ক্যান করে বা UPI ID-তে অগ্রিম পাঠান, তারপর UTR দিন। ডেলিভারি ${DELIVERY_WINDOW_BN}।`
              : `Scan the QR or pay to the UPI ID below, then enter your UTR. Delivery in ${DELIVERY_WINDOW}.`}
          </p>
          <p className="hint pay-eta">
            {lang === 'bn'
              ? `মিনিমাম অর্ডার ₹${MIN_ORDER_AMOUNT} · সময় ${DELIVERY_WINDOW_BN}`
              : `Min order ₹${MIN_ORDER_AMOUNT} · ETA ${DELIVERY_WINDOW}`}
          </p>

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
              <a
                href={zonesLoading ? '#' : `upi://pay?pa=${UPI_ID}&pn=GreenVest&am=${advance}&cu=INR&tn=Order+Advance`}
                className="btn btn-primary"
                style={{ marginTop: '0.5rem', display: 'block', textAlign: 'center', opacity: zonesLoading ? 0.6 : 1 }}
                onClick={zonesLoading ? (e) => e.preventDefault() : undefined}
              >
                {zonesLoading ? '⏳ Calculating...' : `Pay ₹${advance} via UPI App`}
              </a>
            </div>
          </div>

          <dl className="totals">
            <div>
              <dt>{t(lang, 'subtotal')}</dt>
              <dd>₹{cartTotal}</dd>
            </div>
            <div>
              <dt>{t(lang, 'delivery')}</dt>
              <dd>₹{delivery.fee}</dd>
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
              <dt>{lang === 'bn' ? 'অগ্রিম পাঠান (৫০%)' : 'Pay this advance (50%)'}</dt>
              <dd className="accent">₹{advance}</dd>
            </div>
          </dl>

          {/* 🎟️ Coupon Code */}
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
            {couponApplied && <p style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.85rem', margin: '0.4rem 0 0' }}>{couponApplied.message}</p>}
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

          <label>
            {t(lang, 'phone')}
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder={lang === 'bn' ? '১০ সংখ্যার মোবাইল' : '10-digit mobile'}
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
            {t(lang, 'utrLabel')}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                placeholder={lang === 'bn' ? 'যেমন 123456789012' : 'e.g. 123456789012'}
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText()
                    if (text && /^\d{12,}$/.test(text.trim())) {
                      setUtr(text.trim())
                      setUtrPasted(true)
                    }
                  } catch (err) {}
                }}
              >
                📋 {lang === 'bn' ? 'পেস্ট' : 'Paste'}
              </button>
            </div>
          </label>
          {utrPasted && <p className="hint" style={{ color: '#16a34a', marginTop: '-0.5rem' }}>UTR auto-filled from clipboard</p>}
          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? (lang === 'bn' ? '⏳ অর্ডার হচ্ছে...' : '⏳ Placing order...') : t(lang, 'placeOrder')}
          </button>
        </form>
      </div>
    </div>
  )
}
