import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT, SERVICEABLE_PINCODES, computeMarketMrp, MAX_VEGETABLE_QTY_KG, SUPPORT_WHATSAPP } from '../lib/business'
import { t } from '../lib/i18n'

export default function Cart() {
  const { user } = useAuth()
  const { cart, products, lang, priceFor, updateCartQty, removeFromCart, cartTotal } = useStore()
  const [showGrades, setShowGrades] = useState(false)

  const shortfall = Math.max(0, MIN_ORDER_AMOUNT - cartTotal)

  // Auto-clean orphaned cart items (products that no longer exist)
  const orphanedItems = cart.filter(item => !products.find(x => x.id === item.productId))
  if (orphanedItems.length > 0) {
    orphanedItems.forEach(item => removeFromCart(item.productId, item.grade))
  }

  const totalMrp = cart.reduce((sum, item) => {
    const p = products.find((x) => x.id === item.productId)
    if (!p) return sum
    const weight = item.weightMultiplier || 1
    const base = priceFor(p, item.grade)
    const mrp = p.mrp || computeMarketMrp(base)
    return sum + Math.round(mrp * weight) * item.qty
  }, 0)
  const totalSavings = Math.max(0, totalMrp - cartTotal)

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
          ? `সর্বনিম্ন অর্ডার ₹${MIN_ORDER_AMOUNT} · ডেলিভারি ${DELIVERY_WINDOW_BN} · সার্ভিস পিন: ${SERVICEABLE_PINCODES.join(', ')}`
          : `Minimum order ₹${MIN_ORDER_AMOUNT} · Delivery ${DELIVERY_WINDOW} · PINs: ${SERVICEABLE_PINCODES.join(', ')}`}
      </p>
      <ul className="cart-list">
        {cart.map((item) => {
          const p = products.find((x) => x.id === item.productId)
          if (!p) return null
          const mult = item.weightMultiplier || 1
          const unitPrice = Math.round(priceFor(p, item.grade) * mult)
          const baseMrp = p.mrp || computeMarketMrp(priceFor(p, item.grade))
          const mrpPrice = Math.round(baseMrp * mult)
          const itemDiscount = mrpPrice > unitPrice ? Math.round(((mrpPrice - unitPrice) / mrpPrice) * 100) : 0
          const line = unitPrice * item.qty
          const isAtMaxKg = item.qty * mult >= MAX_VEGETABLE_QTY_KG
          const weightDisplay = item.weightLabel || (mult === 1 ? p.unit : mult === 0.25 ? '250g' : mult === 0.5 ? '500g' : `${mult}kg`)
          return (
            <li key={`${item.productId}-${item.grade}-${mult}`} className="cart-row">
              <span className="cart-emoji">{p.emoji}</span>
              <div className="cart-info">
                <div className="cart-dual-title">
                  <strong className="cart-bn">{p.bnName}</strong>
                  <span className="cart-en">{p.name}</span>
                </div>
                <span className="cart-meta-mono">
                  {t(lang, 'grade')} {item.grade} {weightDisplay ? `· ${weightDisplay}` : ''} ·{' '}
                  {mrpPrice > unitPrice && (
                    <span style={{ textDecoration: 'line-through', color: '#9ca3af', marginRight: '4px' }}>
                      ₹{mrpPrice}
                    </span>
                  )}
                  <strong>₹{unitPrice}</strong>
                  {mult !== 1 ? ` (₹${priceFor(p, item.grade)}/${p.unit})` : `/${p.unit}`}
                  {itemDiscount > 0 && (
                    <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.7rem', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', marginLeft: '6px', border: '1px solid #86efac' }}>
                      {itemDiscount}% OFF
                    </span>
                  )}
                </span>
                {isAtMaxKg && (
                  <span style={{ display: 'block', fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
                    ⚠️ {lang === 'bn' ? '১০ কেজি সর্বোচ্চ সীমা' : 'Max 10 kg limit reached'}
                  </span>
                )}
              </div>
              <div className="qty-controls">
                <button
                  type="button"
                  onClick={() => updateCartQty(item.productId, item.grade, item.qty - 1, mult)}
                >
                  −
                </button>
                <span>{item.qty}</span>
                <button
                  type="button"
                  disabled={isAtMaxKg}
                  onClick={() => updateCartQty(item.productId, item.grade, item.qty + 1, mult)}
                >
                  +
                </button>
              </div>
              <div className="cart-line">₹{line}</div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => removeFromCart(item.productId, item.grade, mult)}
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
        {totalSavings > 0 && (
          <div style={{ color: '#15803d', fontWeight: 700, padding: '6px 0', borderBottom: '1px dashed #bbf7d0', marginBottom: '8px' }}>
            <span>🎉 {lang === 'bn' ? 'মোট সাশ্রয়:' : 'Total Savings:'}</span>
            <strong style={{ float: 'right' }}>₹{totalSavings}</strong>
          </div>
        )}
        <div>
          <span>{t(lang, 'total')}</span>
          <strong>₹{cartTotal}</strong>
        </div>
        <div>
          <span>{t(lang, 'advance')}</span>
          <strong>₹{Math.ceil(cartTotal * 0.5)}</strong>
        </div>
        <p className="hint" style={{ fontSize: '0.82rem', color: '#166534', fontWeight: 600, margin: '0.25rem 0' }}>
          {lang === 'bn'
            ? `🚚 হোম ডেলিভারি (পিন: ${SERVICEABLE_PINCODES.join(', ')} · চার্জ: ₹৩০) বা 🏪 ফ্রি দোকান থেকে পিকআপ (₹০)`
            : `🚚 Home Delivery (PINs: ${SERVICEABLE_PINCODES.join(', ')} · ₹30) or 🏪 Free Store Pickup (₹0)`}
        </p>
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

        {/* 💬 Clean WhatsApp Order Fallback */}
        <button
          type="button"
          onClick={() => {
            const lines = cart.map(c => {
              const p = products.find(x => x.id === c.productId)
              const name = p ? (lang === 'bn' ? p.bnName : p.name) : 'Item'
              const mult = c.weightMultiplier || 1
              const unitPrice = p ? Math.round(priceFor(p, c.grade) * mult) : 0
              const price = unitPrice * c.qty
              const wLbl = c.weightLabel ? ` [${c.weightLabel}]` : ''
              return `• ${name}${wLbl} (Grade ${c.grade}) × ${c.qty} = ₹${price}`
            })
            const text = encodeURIComponent(
              `নমস্কার GreenVest, আমি নিচের সবজিগুলো অর্ডার করতে চাই:\n\n${lines.join('\n')}\n\nমোট মূল্য: ₹${cartTotal}\n\nঅনুগ্রহ করে ডেলিভারি ও পেমেন্ট কনফার্ম করুন।`
            )
            window.open(`https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`, '_blank', 'noopener,noreferrer')
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            width: '100%',
            marginTop: '0.65rem',
            padding: '0.6rem',
            background: '#f0fdf4',
            border: '1.5px solid #86efac',
            borderRadius: '10px',
            color: '#166534',
            fontWeight: 700,
            fontSize: '0.86rem',
            cursor: 'pointer',
          }}
        >
          <span>💬</span>
          <span>{lang === 'bn' ? 'হোয়াটসঅ্যাপে অর্ডার পাঠান' : 'Order via WhatsApp'}</span>
        </button>
      </div>
    </div>
  )
}
