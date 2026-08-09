import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { DELIVERY_SLOTS, DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT } from '../lib/business'
import { calcDeliveryFee, getSlotCutoffStatus } from '../lib/delivery'
import { t, zoneLabel } from '../lib/i18n'
import { UPI_BANK, UPI_ID, UPI_QR_SRC } from '../lib/payment'
import { getSavedDelivery } from '../lib/storage'
import type { DeliverySlot, Address, Coupon, DeliveryZone } from '../types'

export default function Checkout() {
  const { user } = useAuth()
  const { cart, cartTotal, lang, placeOrder, orders, checkDuplicateUtr, fetchAddresses, fetchDeliveryZones, saveAddress, validateCoupon } = useStore()
  const navigate = useNavigate()
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('721632')
  const [utr, setUtr] = useState('')
  const [utrPasted, setUtrPasted] = useState(false)
  const [slot, setSlot] = useState<DeliverySlot>('morning')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [prefilled, setPrefilled] = useState(false)

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [saveAddressToDb, setSaveAddressToDb] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null)
  const [couponSuccess, setCouponSuccess] = useState('')

  const delivery = useMemo(() => calcDeliveryFee(pin, zones), [pin, zones])
  const discountAmount = appliedCoupon?.discount ?? 0
  const grandTotal = Math.max(0, cartTotal + delivery.fee - discountAmount)
  const advance = Math.ceil(grandTotal * 0.5)

  useEffect(() => {
    if (!user) return
    let active = true
    fetchAddresses(user.id).then(addrs => { if (active) setSavedAddresses(addrs) })
    fetchDeliveryZones().then(z => { if (active) setZones(z) })
    return () => { active = false }
  }, [user, fetchAddresses, fetchDeliveryZones])

  useEffect(() => {
    if (!user) return
    const saved = getSavedDelivery(user.id)
    if (saved?.address) {
      setAddress(saved.address)
      setPhone(saved.phone || '')
      if (saved.pin) setPin(saved.pin)
      if (saved.deliverySlot) setSlot(saved.deliverySlot)
      setPrefilled(true)
      return
    }
    const last = orders
      .filter((o) => o.userId === user.id && o.status !== 'cancelled')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (last) {
      setAddress(last.address)
      setPhone(last.phone)
      if (last.pin) setPin(last.pin)
      if (last.deliverySlot) setSlot(last.deliverySlot)
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!address.trim() || !phone.trim() || !utr.trim() || !pin.trim()) {
      setError(lang === 'bn' ? 'সব ঘর পূরণ করুন' : 'Please fill all fields')
      return
    }
    if (pin.replace(/\D/g, '').length < 6) {
      setError(lang === 'bn' ? 'সঠিক PIN দিন (৬ সংখ্যা)' : 'Enter a valid 6-digit PIN')
      return
    }
    if (utr.trim().length < 8) {
      setError(lang === 'bn' ? 'সঠিক UTR দিন' : 'Enter a valid UTR (min 8 characters)')
      return
    }
    if (cartTotal < MIN_ORDER_AMOUNT) {
      setError(
        lang === 'bn'
          ? `সর্বনিম্ন অর্ডার ₹${MIN_ORDER_AMOUNT}`
          : `Minimum order is ₹${MIN_ORDER_AMOUNT}`,
      )
      return
    }
    const isDup = await checkDuplicateUtr(utr.trim())
    if (isDup) {
      setError(
        lang === 'bn'
          ? 'এই UTR নম্বরটি আগেই ব্যবহৃত হয়েছে। নতুন UTR নম্বর দিন।'
          : 'This UTR number has already been used for another order.',
      )
      return
    }
    try {
      if (saveAddressToDb) {
        await saveAddress({ user_id: user.id, label: 'Saved', address, phone, pin, is_default: savedAddresses.length === 0 })
      }
      const order = await placeOrder({ address, phone, pin, utr, deliverySlot: slot, discountAmount, zones })
      if (order) navigate(`/orders/success/${order.id}`)
      else setError(lang === 'bn' ? 'অর্ডার হয়নি' : 'Could not place order')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order failed')
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
                href={`upi://pay?pa=${UPI_ID}&pn=GreenVest&am=${advance}&cu=INR&tn=Order+Advance`}
                className="btn btn-primary"
                style={{ marginTop: '0.5rem', display: 'block', textAlign: 'center' }}
              >
                Pay ₹{advance} via UPI App
              </a>
            </div>
          </div>

          <dl className="totals">
            <div>
              <dt>{t(lang, 'subtotal')}</dt>
              <dd>₹{cartTotal}</dd>
            </div>
            <div>
              <dt>
                {t(lang, 'delivery')} ({zoneLabel(lang, delivery.zone)})
              </dt>
              <dd>₹{delivery.fee}</dd>
            </div>
            <div>
              <dt>{t(lang, 'total')}</dt>
              <dd>₹{grandTotal}</dd>
            </div>
            {discountAmount > 0 && (
              <div>
                <dt>{lang === 'bn' ? 'কুপন ছাড়' : 'Coupon Discount'}</dt>
                <dd style={{ color: '#16a34a' }}>-₹{discountAmount}</dd>
              </div>
            )}
            <div>
              <dt>{lang === 'bn' ? 'অগ্রিম পাঠান (৫০%)' : 'Pay this advance (50%)'}</dt>
              <dd className="accent">₹{advance}</dd>
            </div>
          </dl>
        </div>

        <form className="form" onSubmit={onSubmit}>
          {savedAddresses.length > 0 && (
            <label>
              {lang === 'bn' ? 'সংরক্ষিত ঠিকানা নির্বাচন করুন' : 'Select a saved address'}
              <select onChange={e => {
                if (!e.target.value) return
                const addr = savedAddresses.find(a => a.id === Number(e.target.value))
                if (addr) {
                  setAddress(addr.address)
                  setPhone(addr.phone)
                  setPin(addr.pin)
                  setPrefilled(true)
                }
              }}>
                <option value="">{lang === 'bn' ? 'নতুন ঠিকানা লিখুন...' : 'Enter new address...'}</option>
                {savedAddresses.map(a => (
                  <option key={a.id} value={a.id}>{a.label || a.address.slice(0, 30)} - {a.pin}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t(lang, 'deliveryAddress')}
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              required
              placeholder={lang === 'bn' ? 'বাড়ি / রোড / এলাকা' : 'House / road / area'}
            />
          </label>
          <label>
            {t(lang, 'pinCode')}
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              inputMode="numeric"
              placeholder="721632"
              required
            />
          </label>
          <p className="hint">
            {t(lang, 'zone')}: {zoneLabel(lang, delivery.zone)} · {t(lang, 'fee')} ₹{delivery.fee} · {lang === 'bn' ? 'ডেলিভারি সময়' : 'ETA'}: {delivery.zone === 'local' ? '6-8 hours' : delivery.zone === 'nearby' ? '12-18 hours' : delivery.zone === 'far' ? '18-24 hours' : '12-24 hours'}
          </p>
          <fieldset className="slot-fieldset">
            <legend>{lang === 'bn' ? 'ডেলিভারি স্লট' : 'Delivery slot'}</legend>
            {(() => {
              const cutoff = getSlotCutoffStatus()
              return (
                <>
                  <label className="slot-option">
                    <input
                      type="radio"
                      name="slot"
                      checked={slot === 'morning'}
                      onChange={() => setSlot('morning')}
                    />
                    <span>{DELIVERY_SLOTS.morning[lang]}</span>
                    {cutoff.morningCountdown && !cutoff.morningNotice && (
                      <span style={{ fontSize: '0.85rem', color: '#16a34a', marginLeft: '0.4rem' }}>
                        — {cutoff.morningCountdown}
                      </span>
                    )}
                    {cutoff.morningNotice && (
                      <span className="slot-badge-warn" style={{ fontSize: '0.74rem', color: '#b45309', background: '#fef3c7', padding: '0.1rem 0.4rem', borderRadius: '4px', marginLeft: '0.4rem' }}>
                        {cutoff.morningNotice}
                      </span>
                    )}
                  </label>
                  <label className="slot-option">
                    <input
                      type="radio"
                      name="slot"
                      checked={slot === 'evening'}
                      onChange={() => setSlot('evening')}
                    />
                    <span>{DELIVERY_SLOTS.evening[lang]}</span>
                    {cutoff.eveningCountdown && !cutoff.eveningNotice && (
                      <span style={{ fontSize: '0.85rem', color: '#16a34a', marginLeft: '0.4rem' }}>
                        — {cutoff.eveningCountdown}
                      </span>
                    )}
                    {cutoff.eveningNotice && (
                      <span className="slot-badge-warn" style={{ fontSize: '0.74rem', color: '#b45309', background: '#fef3c7', padding: '0.1rem 0.4rem', borderRadius: '4px', marginLeft: '0.4rem' }}>
                        {cutoff.eveningNotice}
                      </span>
                    )}
                  </label>
                </>
              )
            })()}
          </fieldset>
          <label>
            {t(lang, 'phone')}
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder={lang === 'bn' ? '১০ সংখ্যার মোবাইল' : '10-digit mobile'}
            />
          </label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '-0.5rem' }}>
            <input type="checkbox" checked={saveAddressToDb} onChange={e => setSaveAddressToDb(e.target.checked)} />
            {lang === 'bn' ? 'ভবিষ্যতের জন্য এই ঠিকানা সংরক্ষণ করুন' : 'Save this address for future'}
          </label>
          <label>
            {t(lang, 'utrLabel')}
            <input
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              onFocus={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  if (text && /^\\d{12,}$/.test(text.trim())) {
                    setUtr(text.trim())
                    setUtrPasted(true)
                  }
                } catch (err) {}
              }}
              placeholder={lang === 'bn' ? 'যেমন 123456789012' : 'e.g. 123456789012'}
              required
            />
          </label>
          {utrPasted && <p className="hint" style={{ color: '#16a34a', marginTop: '-0.5rem' }}>UTR auto-filled from clipboard</p>}
          {error && <p className="form-error">{error}</p>}
          
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexDirection: 'column' }}>
            <label>{lang === 'bn' ? 'কুপন কোড' : 'Coupon Code'}</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="e.g. SAVE10" />
              <button type="button" className="btn btn-secondary" onClick={async () => {
                setError('')
                setCouponSuccess('')
                if (!couponCode) return
                const c = await validateCoupon(couponCode, cartTotal)
                if (c && c.valid) {
                  setAppliedCoupon(c)
                  setCouponSuccess(c.message || (lang === 'bn' ? 'কুপন প্রয়োগ করা হয়েছে!' : 'Coupon applied!'))
                } else {
                  setAppliedCoupon(null)
                  setError(lang === 'bn' ? 'অবৈধ বা মেয়াদোত্তীর্ণ কুপন' : 'Invalid or expired coupon')
                }
              }}>{lang === 'bn' ? 'প্রয়োগ' : 'Apply'}</button>
            </div>
            {couponSuccess && <p style={{ color: '#16a34a', margin: 0 }}>{couponSuccess}</p>}
          </div>

          <button type="submit" className="btn btn-primary">
            {t(lang, 'placeOrder')}
          </button>
        </form>
      </div>
    </div>
  )
}
