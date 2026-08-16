import { useState, useEffect, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import OrderTimeline from '../components/OrderTimeline'
import { useStore } from '../context/StoreContext'
import { formatOrderId } from '../lib/business'
import { fetchOrderByPublicQuery } from '../lib/api'
import { t } from '../lib/i18n'
import type { Order } from '../types'

export default function TrackOrder() {
  const { orders, lang } = useStore()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [matched, setMatched] = useState<Order | null>(null)
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Auto-track if URL contains ?id=849201 or ?order=849201
  useEffect(() => {
    const paramId = searchParams.get('id') || searchParams.get('order') || searchParams.get('num')
    if (paramId) {
      setQuery(paramId)
      const rawInput = paramId.trim().toLowerCase().replace(/^#/, '')
      const digitsOnly = rawInput.replace(/\D/g, '')

      let found = orders.find((o) => {
        const oIdRaw = o.id.toLowerCase()
        const oIdFormatted = formatOrderId(o.id).toLowerCase()
        const oPhoneDigits = o.phone.replace(/\D/g, '').slice(-10)
        const oUtr = (o.utr || '').trim().toLowerCase()

        if (oIdRaw === rawInput || oIdFormatted === rawInput || oIdFormatted === `ord-${rawInput}`) return true
        if (rawInput.length >= 4 && (oIdRaw.endsWith(rawInput) || oIdFormatted.endsWith(rawInput))) return true
        if (digitsOnly.length >= 4 && oIdRaw.replace(/\D/g, '').endsWith(digitsOnly)) return true
        if (digitsOnly.length >= 10 && (oPhoneDigits === digitsOnly || (o.userEmail && o.userEmail.includes(digitsOnly)))) return true
        if (oUtr && (oUtr === rawInput || oUtr.includes(rawInput))) return true
        return false
      })

      if (found) {
        setMatched(found)
        setSearched(true)
      } else {
        // Query Supabase directly if not found in local memory
        setLoading(true)
        void fetchOrderByPublicQuery(rawInput).then((res) => {
          setLoading(false)
          if (res) {
            setMatched(res)
            setSearched(true)
          }
        })
      }
    }
  }, [searchParams, orders])

  const onTrack = async (e: FormEvent) => {
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

    // 1. Check in-memory store orders first
    let found = orders.find((o) => {
      const oIdRaw = o.id.toLowerCase()
      const oIdFormatted = formatOrderId(o.id).toLowerCase()
      const oPhoneDigits = o.phone.replace(/\D/g, '').slice(-10)
      const oUtr = (o.utr || '').trim().toLowerCase()

      if (oIdRaw === rawInput || oIdFormatted === rawInput || oIdFormatted === `ord-${rawInput}`) {
        return true
      }
      if (rawInput.length >= 4 && (oIdRaw.endsWith(rawInput) || oIdFormatted.endsWith(rawInput))) {
        return true
      }
      if (digitsOnly.length >= 4 && oIdRaw.replace(/\D/g, '').endsWith(digitsOnly)) {
        return true
      }
      if (digitsOnly.length >= 10 && (oPhoneDigits === digitsOnly || (o.userEmail && o.userEmail.includes(digitsOnly)))) {
        return true
      }
      if (oUtr && (oUtr === rawInput || oUtr.includes(rawInput))) {
        return true
      }
      return false
    })

    // 2. Query Supabase directly if not found in local memory (e.g. guest WhatsApp tracking link)
    if (!found) {
      setLoading(true)
      try {
        found = (await fetchOrderByPublicQuery(rawInput)) || undefined
      } catch {}
      setLoading(false)
    }

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

        <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={loading}>
          {loading
            ? (lang === 'bn' ? '⏳ খোঁজা হচ্ছে...' : '⏳ Searching...')
            : (`🔍 ${lang === 'bn' ? 'স্ট্যাটাস দেখুন' : 'Track Order'}`)}
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
