import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT } from '../lib/business'
import { t } from '../lib/i18n'

export default function Cart() {
  const { user } = useAuth()
  const { cart, products, lang, priceFor, updateCartQty, removeFromCart, cartTotal } = useStore()
  const [showGrades, setShowGrades] = useState(false)

  const shortfall = Math.max(0, MIN_ORDER_AMOUNT - cartTotal)
  const canCheckout = cartTotal >= MIN_ORDER_AMOUNT

  if (cart.length === 0) {
    return (
      <div className="page narrow">
        <h1>{t(lang, 'yourCart')}</h1>
        <p className="empty">{t(lang, 'emptyCart')}</p>
        <Link to="/" className="btn btn-primary">
          {t(lang, 'continueShop')}
        </Link>
      </div>
    )
  }

  return (
    <div className="page narrow">
      <h1>{t(lang, 'yourCart')}</h1>
      <p className="hint">
        {lang === 'bn'
          ? `সর্বনিম্ন অর্ডার ₹${MIN_ORDER_AMOUNT} · ডেলিভারি ${DELIVERY_WINDOW_BN}`
          : `Minimum order ₹${MIN_ORDER_AMOUNT} · Delivery ${DELIVERY_WINDOW}`}
      </p>
      <ul className="cart-list">
        {cart.map((item) => {
          const p = products.find((x) => x.id === item.productId)
          if (!p) return null
          const line = priceFor(p, item.grade) * item.qty
          return (
            <li key={`${item.productId}-${item.grade}`} className="cart-row">
              <span className="cart-emoji">{p.emoji}</span>
              <div className="cart-info">
                <strong>{lang === 'bn' ? p.bnName : p.name}</strong>
                <span>
                  {t(lang, 'grade')} {item.grade} · ₹{priceFor(p, item.grade)}/{p.unit}
                </span>
              </div>
              <div className="qty-controls">
                <button
                  type="button"
                  onClick={() => updateCartQty(item.productId, item.grade, item.qty - 1)}
                >
                  −
                </button>
                <span>{item.qty}</span>
                <button
                  type="button"
                  onClick={() => updateCartQty(item.productId, item.grade, item.qty + 1)}
                >
                  +
                </button>
              </div>
              <div className="cart-line">₹{line}</div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => removeFromCart(item.productId, item.grade)}
              >
                {t(lang, 'remove')}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="cart-summary">
        <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
          <button type="button" onClick={() => setShowGrades(!showGrades)} style={{ background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
            ℹ️ What is Grade A/B/C?
          </button>
          {showGrades && (
            <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#4b5563', lineHeight: 1.5 }}>
              <div><strong>A</strong> = Premium quality</div>
              <div><strong>B</strong> = Good daily use</div>
              <div><strong>C</strong> = Budget friendly</div>
            </div>
          )}
        </div>
        <div>
          <span>{t(lang, 'total')}</span>
          <strong>₹{cartTotal}</strong>
        </div>
        <div>
          <span>{t(lang, 'advance')}</span>
          <strong>₹{Math.ceil(cartTotal * 0.5)}</strong>
        </div>
        {!canCheckout && (
          <p className="form-error">
            {lang === 'bn'
              ? `আরও ₹${shortfall} যোগ করুন (মিনিমাম ₹${MIN_ORDER_AMOUNT})`
              : `Add ₹${shortfall} more to reach the ₹${MIN_ORDER_AMOUNT} minimum`}
          </p>
        )}
        {!user && canCheckout && (
          <div className="alert warn cart-login-cta">
            <strong>{lang === 'bn' ? 'অর্ডার করতে লগইন লাগবে' : 'Login required to order'}</strong>
            <span>
              {lang === 'bn'
                ? 'চেকআউটের আগে মোবাইল নম্বর দিয়ে লগইন বা সাইন আপ করুন। কার্ট সেভ থাকবে।'
                : 'Sign in or create an account with your mobile number before checkout. Your cart stays saved.'}
            </span>
            <Link to="/auth" className="btn btn-primary">
              {lang === 'bn' ? 'লগইন / সাইন আপ' : 'Login / Sign up'}
            </Link>
          </div>
        )}
        {canCheckout ? (
          user ? (
            <Link to="/checkout" className="btn btn-primary">
              {t(lang, 'checkout')}
            </Link>
          ) : (
            <Link to="/auth" className="btn btn-secondary">
              {lang === 'bn' ? 'লগইন করে চেকআউট' : 'Login to checkout'}
            </Link>
          )
        ) : (
          <Link to="/" className="btn btn-secondary">
            {t(lang, 'addMore')}
          </Link>
        )}
      </div>
    </div>
  )
}
