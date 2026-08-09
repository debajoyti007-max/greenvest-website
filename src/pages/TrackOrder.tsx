import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import OrderTimeline from '../components/OrderTimeline'
import { useStore } from '../context/StoreContext'
import { t } from '../lib/i18n'
import type { Order } from '../types'

export default function TrackOrder() {
  const { orders, lang } = useStore()
  const [orderId, setOrderId] = useState('')
  const [phone, setPhone] = useState('')
  const [utr, setUtr] = useState('')
  const [searchByPhone, setSearchByPhone] = useState(false)
  const [matched, setMatched] = useState<Order | null>(null)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')

  const onTrack = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setMatched(null)
    setSearched(true)

    if (orderId.trim()) {
      const found = orders.find((o) => o.id === orderId.trim())
      if (found) {
        setMatched(found)
      } else {
        setError(
          lang === 'bn'
            ? 'কোনো ম্যাচিং অর্ডার পাওয়া যায়নি।'
            : 'No matching order found.',
        )
      }
      return
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10)
    const cleanUtr = utr.trim().toLowerCase()

    if (!cleanPhone || !cleanUtr) {
      setError(
        lang === 'bn'
          ? '১০ ডিজিটের ফোন নম্বর এবং UTR কোড দিন'
          : 'Please enter a valid 10-digit Phone Number and UTR',
      )
      return
    }

    const found = orders.find((o) => {
      const oPhone = o.phone.replace(/\D/g, '').slice(-10)
      const oUtr = o.utr.trim().toLowerCase()
      return (oPhone === cleanPhone || o.userEmail.includes(cleanPhone)) && oUtr === cleanUtr
    })

    if (found) {
      setMatched(found)
    } else {
      setError(
        lang === 'bn'
          ? 'কোনো ম্যাচিং অর্ডার পাওয়া যায়নি। ফোন নম্বর ও UTR চেক করুন।'
          : 'No matching order found. Please check your phone number and UTR code.',
      )
    }
  }

  return (
    <div className="page narrow track-page">
      <h1>{lang === 'bn' ? 'অর্ডার ট্র্যাক করুন' : 'Track Your Order'}</h1>
      <p className="lede center">
        {lang === 'bn'
          ? 'লগইন ছাড়াই আপনার ফোন নম্বর এবং UTR দিয়ে ডেলিভারি স্ট্যাটাস দেখুন।'
          : 'Check your delivery status instantly using your Phone Number and UTR.'}
      </p>

      <form className="form" onSubmit={onTrack}>
        {searchByPhone ? (
          <>
            <label>
              {lang === 'bn' ? 'মোবাইল নম্বর' : 'Mobile Number'}
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 8170859653"
                required
              />
            </label>
            <label>
              {lang === 'bn' ? 'UTR কোড / পেমেন্ট রেফারেন্স' : 'UTR Code / Payment Ref'}
              <input
                type="text"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                placeholder="e.g. 4210984512"
                required
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearchByPhone(false)
                setPhone('')
                setUtr('')
              }}
              style={{ marginBottom: '1rem' }}
            >
              {lang === 'bn' ? 'অর্ডার আইডি দিয়ে খুঁজুন' : 'Search by Order ID'}
            </button>
          </>
        ) : (
          <>
            <label>
              {lang === 'bn' ? 'অর্ডার আইডি' : 'Order ID'}
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="e.g. ORD-abc123"
                required
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearchByPhone(true)
                setOrderId('')
              }}
              style={{ marginBottom: '1rem' }}
            >
              {lang === 'bn' ? 'অর্ডার আইডি নেই? ফোন + UTR দিয়ে খুঁজুন' : "Don't have Order ID? Search by Phone + UTR"}
            </button>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary">
          {lang === 'bn' ? 'স্ট্যাটাস দেখুন' : 'Track Order'}
        </button>
      </form>

      {searched && matched && (
        <article className="order-card" style={{ marginTop: '1.5rem' }}>
          <header>
            <div>
              <strong>{matched.id}</strong>
              <span className="muted"> · {new Date(matched.createdAt).toLocaleDateString()}</span>
            </div>
            <span className={`status status-${matched.status}`}>{matched.status.replace('_', ' ')}</span>
          </header>

          <OrderTimeline 
            order={matched} 
            lang={lang} 
            createdAt={matched.createdAt} 
            updatedAt={(matched as any).updatedAt} 
            deliverySlot={(matched as any).deliverySlot} 
          />

          <ul>
            {matched.items.map((it) => (
              <li key={`${it.productId}-${it.grade}`}>
                {it.emoji} {it.name} · {t(lang, 'grade')} {it.grade} × {it.qty}
              </li>
            ))}
          </ul>

          <p className="muted">
            {lang === 'bn' ? 'ডেলিভারি ডোরস্ট্যাপ:' : 'Delivery Address:'} {matched.address.slice(0, 15)}*** · PIN {matched.pin}
          </p>

          <footer>
            <span>
              {t(lang, 'total')}: <strong>₹{matched.total}</strong>
            </span>
            <span>
              UTR: {matched.utr}{' '}
              {matched.utrVerified ? (
                <em className="ok">{t(lang, 'verified')}</em>
              ) : (
                <em className="wait">{t(lang, 'pending')}</em>
              )}
            </span>
          </footer>
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
