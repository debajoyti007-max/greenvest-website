import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import OrderTimeline from '../components/OrderTimeline'
import { useStore } from '../context/StoreContext'
import { formatOrderId } from '../lib/business'
import { t } from '../lib/i18n'
import type { Order } from '../types'

export default function TrackOrder() {
  const { orders, lang } = useStore()
  const [query, setQuery] = useState('')
  const [matched, setMatched] = useState<Order | null>(null)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')

  const onTrack = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setMatched(null)
    setSearched(true)

    const rawInput = query.trim().toLowerCase().replace(/^#/, '')
    const digitsOnly = rawInput.replace(/\D/g, '')

    if (!rawInput) {
      setError(
        lang === 'bn'
          ? '৪-৬ সংখ্যার অর্ডার আইডি বা মোবাইল নম্বর লিখুন'
          : 'Enter 4-6 digit Order ID or Mobile Number',
      )
      return
    }

    // Flexible multi-format search
    const found = orders.find((o) => {
      const oIdRaw = o.id.toLowerCase()
      const oIdFormatted = formatOrderId(o.id).toLowerCase()
      const oPhoneDigits = o.phone.replace(/\D/g, '').slice(-10)
      const oUtr = (o.utr || '').trim().toLowerCase()

      // 1. Direct or formatted Order ID match (e.g. ORD-849201, 849201)
      if (oIdRaw === rawInput || oIdFormatted === rawInput || oIdFormatted === `ord-${rawInput}`) {
        return true
      }

      // 2. Simple 4-6 Digit suffix match (e.g. user typed last 4 or 6 numbers like "849201" or "9201")
      if (rawInput.length >= 4 && (oIdRaw.endsWith(rawInput) || oIdFormatted.endsWith(rawInput))) {
        return true
      }
      if (digitsOnly.length >= 4 && oIdRaw.replace(/\D/g, '').endsWith(digitsOnly)) {
        return true
      }

      // 3. Mobile Number match (10 digits)
      if (digitsOnly.length >= 10 && (oPhoneDigits === digitsOnly || (o.userEmail && o.userEmail.includes(digitsOnly)))) {
        return true
      }

      // 4. Payment UTR match
      if (oUtr && (oUtr === rawInput || oUtr.includes(rawInput))) {
        return true
      }

      return false
    })

    if (found) {
      setMatched(found)
    } else {
      setError(
        lang === 'bn'
          ? '❌ কোনো ম্যাচিং অর্ডার পাওয়া যায়নি। অর্ডারের শেষ ৪-৬ সংখ্যা বা ১০-সংখ্যার মোবাইল নম্বর দিন।'
          : '❌ No matching order found. Please enter your 4-6 digit Order ID or 10-digit Mobile number.',
      )
    }
  }

  return (
    <div className="page narrow track-page">
      <h1>{lang === 'bn' ? 'অর্ডার ট্র্যাক করুন' : 'Track Your Order'}</h1>
      <p className="lede center">
        {lang === 'bn'
          ? 'সহজেই ৪-৬ সংখ্যার অর্ডার আইডি বা আপনার মোবাইল নম্বর দিয়ে ট্র্যাক করুন।'
          : 'Track your order status instantly with simple 4-6 digit Order ID or Mobile number.'}
      </p>

      <form className="form" onSubmit={onTrack}>
        <label>
          {lang === 'bn' ? '৪-৬ সংখ্যার অর্ডার আইডি বা ফোন নম্বর' : '4-6 Digit Order ID or Phone Number'}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === 'bn' ? '৪-৬ ডিজিটের নম্বর বা মোবাইল নম্বর দিন' : 'Enter 4-6 digit number or mobile number'}
            required
            style={{ fontSize: '1.05rem', fontWeight: 600 }}
          />
          <span style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem', display: 'block' }}>
            💡 {lang === 'bn' ? 'অর্ডারের ৪ থেকে ৬ টি নম্বর বা ১০-সংখ্যার ফোন নম্বর দিন' : 'Type your 4 to 6 digit order number or mobile number'}
          </span>
        </label>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
          🔍 {lang === 'bn' ? 'স্ট্যাটাস দেখুন' : 'Track Order'}
        </button>
      </form>

      {searched && matched && (
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
            deliverySlot={(matched as any).deliverySlot}
          />

          <ul style={{ margin: '0.75rem 0', paddingLeft: '1.25rem' }}>
            {matched.items.map((it) => (
              <li key={`${it.productId}-${it.grade}`}>
                {it.emoji} {it.name} · {t(lang, 'grade')} {it.grade} × {it.qty}
              </li>
            ))}
          </ul>

          <p className="muted" style={{ fontSize: '0.85rem' }}>
            📍 {lang === 'bn' ? 'ডেলিভারি ঠিকানা:' : 'Delivery Address:'} {matched.address} (PIN {matched.pin})
          </p>

          <footer style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              {t(lang, 'total')}: <strong style={{ fontSize: '1.1rem', color: '#166534' }}>₹{matched.total}</strong>
            </span>
            <span style={{ fontSize: '0.85rem' }}>
              UTR: {matched.utr}{' '}
              {matched.utrVerified ? (
                <em className="ok"> ({t(lang, 'verified')})</em>
              ) : (
                <em className="wait"> ({t(lang, 'pending')})</em>
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
