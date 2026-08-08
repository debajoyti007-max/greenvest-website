import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'

export default function Checkout() {
  const { user } = useAuth()
  const { cart, cartTotal, lang, placeOrder } = useStore()
  const navigate = useNavigate()
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [utr, setUtr] = useState('')
  const [error, setError] = useState('')

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

  const advance = Math.ceil(cartTotal * 0.5)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!address.trim() || !phone.trim() || !utr.trim()) {
      setError(lang === 'bn' ? 'সব ঘর পূরণ করুন' : 'Please fill all fields')
      return
    }
    if (utr.trim().length < 8) {
      setError(lang === 'bn' ? 'সঠিক UTR দিন' : 'Enter a valid UTR (min 8 characters)')
      return
    }
    const order = placeOrder({ address, phone, utr })
    if (order) navigate('/orders')
  }

  return (
    <div className="page narrow">
      <h1>{lang === 'bn' ? 'চেকআউট' : 'Checkout'}</h1>
      <div className="checkout-panel">
        <div className="pay-box">
          <h2>{lang === 'bn' ? 'অগ্রিম পেমেন্ট' : 'Advance payment'}</h2>
          <p>
            {lang === 'bn'
              ? 'অর্ডার নিশ্চিত করতে মোটের ৫০% অগ্রিম দিন।'
              : 'Pay 50% advance to confirm your order.'}
          </p>
          <dl className="totals">
            <div>
              <dt>{lang === 'bn' ? 'মোট' : 'Order total'}</dt>
              <dd>৳{cartTotal}</dd>
            </div>
            <div>
              <dt>{lang === 'bn' ? 'অগ্রিম (৫০%)' : 'Advance due'}</dt>
              <dd className="accent">৳{advance}</dd>
            </div>
          </dl>
          <p className="bank-hint">
            {lang === 'bn' ? 'বিকাশ/নগদ/ব্যাংক ট্রান্সফার করে UTR দিন।' : 'Transfer via bKash / Nagad / bank, then enter UTR.'}
          </p>
        </div>

        <form className="form" onSubmit={onSubmit}>
          <label>
            {lang === 'bn' ? 'ডেলিভারি ঠিকানা' : 'Delivery address'}
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} required />
          </label>
          <label>
            {lang === 'bn' ? 'ফোন' : 'Phone'}
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </label>
          <label>
            UTR / Transaction ID
            <input
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="e.g. BKASH12345678"
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">
            {lang === 'bn' ? 'অর্ডার কনফার্ম' : 'Place order'}
          </button>
        </form>
      </div>
    </div>
  )
}
