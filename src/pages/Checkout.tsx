import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { DELIVERY_SLOTS, DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT } from '../lib/business'
import { calcDeliveryFee } from '../lib/delivery'
import { t, zoneLabel } from '../lib/i18n'
import { UPI_BANK, UPI_ID, UPI_QR_SRC } from '../lib/payment'
import type { DeliverySlot } from '../types'

export default function Checkout() {
  const { user } = useAuth()
  const { cart, cartTotal, lang, placeOrder } = useStore()
  const navigate = useNavigate()
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('721601')
  const [utr, setUtr] = useState('')
  const [slot, setSlot] = useState<DeliverySlot>('morning')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const delivery = useMemo(() => calcDeliveryFee(pin), [pin])
  const grandTotal = cartTotal + delivery.fee
  const advance = Math.ceil(grandTotal * 0.5)

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
          ? `সর্বনিম্ন অর্ডার ৳${MIN_ORDER_AMOUNT}`
          : `Minimum order is ₹${MIN_ORDER_AMOUNT}`,
      )
      return
    }
    try {
      const order = await placeOrder({ address, phone, pin, utr, deliverySlot: slot })
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
              ? `মিনিমাম অর্ডার ৳${MIN_ORDER_AMOUNT} · সময় ${DELIVERY_WINDOW_BN}`
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
            </div>
          </div>

          <dl className="totals">
            <div>
              <dt>{t(lang, 'subtotal')}</dt>
              <dd>৳{cartTotal}</dd>
            </div>
            <div>
              <dt>
                {t(lang, 'delivery')} ({zoneLabel(lang, delivery.zone)})
              </dt>
              <dd>৳{delivery.fee}</dd>
            </div>
            <div>
              <dt>{t(lang, 'total')}</dt>
              <dd>৳{grandTotal}</dd>
            </div>
            <div>
              <dt>{lang === 'bn' ? 'অগ্রিম পাঠান (৫০%)' : 'Pay this advance (50%)'}</dt>
              <dd className="accent">৳{advance}</dd>
            </div>
          </dl>
        </div>

        <form className="form" onSubmit={onSubmit}>
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
              placeholder="721601"
              required
            />
          </label>
          <p className="hint">
            {t(lang, 'zone')}: {zoneLabel(lang, delivery.zone)} · {t(lang, 'fee')} ৳{delivery.fee}
          </p>
          <fieldset className="slot-fieldset">
            <legend>{lang === 'bn' ? 'ডেলিভারি স্লট' : 'Delivery slot'}</legend>
            <label className="slot-option">
              <input
                type="radio"
                name="slot"
                checked={slot === 'morning'}
                onChange={() => setSlot('morning')}
              />
              {DELIVERY_SLOTS.morning[lang]}
            </label>
            <label className="slot-option">
              <input
                type="radio"
                name="slot"
                checked={slot === 'evening'}
                onChange={() => setSlot('evening')}
              />
              {DELIVERY_SLOTS.evening[lang]}
            </label>
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
          <label>
            {t(lang, 'utrLabel')}
            <input
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder={lang === 'bn' ? 'যেমন 123456789012' : 'e.g. 123456789012'}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">
            {t(lang, 'placeOrder')}
          </button>
        </form>
      </div>
    </div>
  )
}
