import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useStore } from '../context/useStore'
import {
  DELIVERY_WINDOW,
  DELIVERY_WINDOW_BN,
  MIN_ORDER_AMOUNT,
  computeMarketMrp,
  MAX_VEGETABLE_QTY_KG,
  calculateCartTotalWeightKg,
  formatItemWeightDetail,
  createBulkOrderWhatsAppUrl,
} from '../lib/business'
import { t } from '../lib/i18n'

export default function Cart() {
  const { user } = useAuth()
  const { cart, products, lang, priceFor, updateCartQty, removeFromCart, cartTotal, sendSupportMessage } = useStore()
  const navigate = useNavigate()
  const [showGrades, setShowGrades] = useState(false)

  const shortfall = Math.max(0, MIN_ORDER_AMOUNT - cartTotal)

  // Auto-clean orphaned cart items (products that no longer exist in catalog).
  // 🛡️ Guard: ONLY run when products catalog has loaded (length > 0) to avoid wiping cart on refresh / initial load
  useEffect(() => {
    if (!products || products.length === 0) return
    const orphaned = cart.filter((item) => !products.some((x) => x.id === item.productId))
    if (orphaned.length > 0) {
      orphaned.forEach((item) => removeFromCart(item.productId, item.grade, item.weightMultiplier))
    }
  }, [products, cart, removeFromCart])

  const totalMrp = cart.reduce((sum, item) => {
    const p = products.find((x) => x.id === item.productId)
    if (!p) return sum
    const weight = item.weightMultiplier || 1
    const base = priceFor(p, item.grade)
    const mrp = p.mrp || computeMarketMrp(base, undefined, p.id || p.name)
    return sum + Math.round(mrp * weight) * item.qty
  }, 0)
  const totalSavings = Math.max(0, totalMrp - cartTotal)
  const totalCartWeightKg = calculateCartTotalWeightKg(cart)

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
    <div className="page narrow cart-page-with-sticky">
      <h1>{t(lang, 'yourCart')}</h1>
      <p className="hint">
        {lang === 'bn'
          ? `মিনিমাম অর্ডার ₹${MIN_ORDER_AMOUNT} · দ্রুত ডেলিভারি ${DELIVERY_WINDOW_BN} · হোম ডেলিভারি ও পিকআপ উপলব্ধ`
          : `Min order ₹${MIN_ORDER_AMOUNT} · Fast Delivery ${DELIVERY_WINDOW} · Home Delivery & Store Pickup`}
      </p>
      <ul className="cart-list">
        {cart.map((item) => {
          const p = products.find((x) => x.id === item.productId)
          if (!p) return null
          const mult = item.weightMultiplier || 1
          const unitPrice = Math.round(priceFor(p, item.grade) * mult)
          const baseMrp = p.mrp || computeMarketMrp(priceFor(p, item.grade), undefined, p.id || p.name)
          const mrpPrice = Math.round(baseMrp * mult)
          const itemDiscount = mrpPrice > unitPrice ? Math.round(((mrpPrice - unitPrice) / mrpPrice) * 100) : 0
          const line = unitPrice * item.qty
          const isAtMaxKg = item.qty * mult >= MAX_VEGETABLE_QTY_KG
          const weightDisplay = item.weightLabel || (mult === 1 ? p.unit : mult === 0.25 ? '250g' : mult === 0.5 ? '500g' : `${mult}kg`)
          const weightDetail = formatItemWeightDetail(item.qty, mult, item.weightLabel, p.unit, lang)
          return (
            <li key={`${item.productId}-${item.grade}-${mult}`} className="cart-row">
              <span className="cart-emoji">{p.emoji}</span>
              <div className="cart-info">
                <div className="cart-dual-title">
                  <strong className="cart-bn">{p.bnName}</strong>
                  <span className="cart-en">{p.name}</span>
                </div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#166534',
                    padding: '2px 7px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    margin: '3px 0 2px',
                    width: 'fit-content',
                  }}
                >
                  {weightDetail.fullBadgeText}
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
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '32px' }}>
                  <span style={{ fontWeight: 800 }}>{item.qty}</span>
                  {item.qty > 1 && (
                    <span style={{ fontSize: '0.66rem', color: '#166534', fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' }}>
                      {weightDetail.totalWeightText}
                    </span>
                  )}
                </div>
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
          <button type="button" onClick={() => setShowGrades(!showGrades)} style={{ background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: '0.85rem' }}>
            {lang === 'bn' ? 'ℹ️ গ্রেড A/B/C কী?' : 'ℹ️ What is Grade A/B/C?'}
          </button>
          {showGrades && (
            <div style={{ fontSize: '0.84rem', marginTop: '0.5rem', color: '#4b5563', lineHeight: 1.5, background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div><strong>A</strong> = {lang === 'bn' ? 'প্রিমিয়াম সেরা মান' : 'Premium quality'}</div>
              <div><strong>B</strong> = {lang === 'bn' ? 'দৈনন্দিন ভালো মান (স্ট্যান্ডার্ড)' : 'Good daily use (Standard)'}</div>
              <div><strong>C</strong> = {lang === 'bn' ? 'সাশ্রয়ী বাজেট মান' : 'Budget friendly'}</div>
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
          <strong>₹{cartTotal > 0 ? Math.max(1, Math.ceil(cartTotal * 0.1)) : 0}</strong>
        </div>
        <p className="hint" style={{ fontSize: '0.82rem', color: '#166534', fontWeight: 600, margin: '0.25rem 0' }}>
          {lang === 'bn'
            ? '🚚 হোম ডেলিভারি (দূরত্ব অনুযায়ী ₹৩০-₹৫০) বা 🏪 ফ্রি স্টোর পিকআপ (₹০)'
            : '🚚 Home Delivery (₹30–₹50 by distance) or 🏪 Free Store Pickup (₹0)'}
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
        {/* 🏢 VIP Bulk & Wholesale Desk for Orders >= ₹10,000 */}
        {cartTotal >= 10000 && (
          <div
            style={{
              margin: '1.25rem 0',
              padding: '1rem 1.1rem',
              background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
              borderRadius: '14px',
              color: '#ffffff',
              boxShadow: '0 4px 16px rgba(6, 78, 59, 0.28)',
              border: '1.5px solid #34d399',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.45rem' }}>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  background: 'rgba(255,255,255,0.2)',
                  padding: '3px 8px',
                  borderRadius: '16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                🏢 {lang === 'bn' ? 'হোলসেল ও বাল্ক অর্ডার' : 'Bulk & Wholesale Order'}
              </span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a7f3d0' }}>
                ₹10,000+
              </span>
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.3rem', color: '#ffffff' }}>
              {lang === 'bn' ? 'সরাসরি পাইকারি রেট ও বিশেষ গাড়ি ডেলিভারি' : 'Direct Wholesale Pricing & Dedicated Logistics'}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#d1fae5', margin: '0 0 0.85rem 0', lineHeight: 1.45 }}>
              {lang === 'bn'
                ? 'আপনার কার্ট মূল্য ₹১০,০০০ ছাড়িয়েছে। সরাসরি আমাদের হোলসেল ডেস্কে যোগাযোগ করে বিশেষ পাইকারি দর ও নিজস্ব গাড়ি ডেলিভারি পেতে পারেন।'
                : 'Your order qualifies for bulk wholesale pricing! Contact our dedicated Mandi desk directly via WhatsApp for discounted rates and vehicle delivery.'}
            </p>
            <a
              href={createBulkOrderWhatsAppUrl({
                customerName: user?.name,
                customerPhone: user?.phone,
                cartTotal,
                items: cart.map((c) => {
                  const p = products.find((x) => x.id === c.productId)
                  const name = p ? (lang === 'bn' ? p.bnName : p.name) : 'Item'
                  const mult = c.weightMultiplier || 1
                  const unitPrice = p ? Math.round(priceFor(p, c.grade) * mult) : 0
                  return {
                    name,
                    grade: c.grade,
                    qty: c.qty,
                    unitPrice,
                    weightLabel: c.weightLabel,
                  }
                }),
                lang,
              })}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.7rem 1rem',
                background: '#25d366',
                color: '#064e3b',
                borderRadius: '10px',
                fontWeight: 800,
                fontSize: '0.9rem',
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              }}
            >
              <span>💬</span>
              <span>{lang === 'bn' ? 'হোয়াটসঅ্যাপে পাইকারি রেট জানুন ও বুক করুন' : 'Chat & Buy via Wholesale WhatsApp'}</span>
            </a>
          </div>
        )}

        {/* ⚖️ Cart Weight Badge */}
        <div
          style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
            border: '1.5px solid #86efac',
            borderRadius: '12px',
            padding: '0.65rem 0.95rem',
            marginBottom: '0.9rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.82rem',
            boxShadow: '0 2px 6px rgba(22, 101, 52, 0.04)',
          }}
        >
          <span style={{ fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚖️</span>
            <span>{lang === 'bn' ? 'অর্ডারের মোট ওজন:' : 'Total Order Weight:'}</span>
            <strong style={{ color: '#0f172a' }}>{totalCartWeightKg} {lang === 'bn' ? 'কেজি' : 'kg'}</strong>
          </span>
          <span style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span>🛵</span>
            <span>{lang === 'bn' ? 'রাইডার হোম ডেলিভারি' : 'Rider Doorstep Delivery'}</span>
          </span>
        </div>

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

        {/* 💬 In-App Support Inquiry */}
        <button
          type="button"
          onClick={async () => {
            const lines = cart.map(c => {
              const p = products.find(x => x.id === c.productId)
              const name = p ? (lang === 'bn' ? p.bnName : p.name) : 'Item'
              const mult = c.weightMultiplier || 1
              const unitPrice = p ? Math.round(priceFor(p, c.grade) * mult) : 0
              const price = unitPrice * c.qty
              const wLbl = c.weightLabel ? ` [${c.weightLabel}]` : ''
              return `• ${name}${wLbl} (Grade ${c.grade}) × ${c.qty} = ₹${price}`
            })
            const text = `নমস্কার, আমি কার্টের সামগ্রীগুলো নিয়ে সহায়তা চাই:\n\n${lines.join('\n')}\n\nমোট মূল্য: ₹${cartTotal}`
            if (user) {
              try {
                await sendSupportMessage({
                  userId: user.id,
                  userName: user.name,
                  userPhone: user.phone,
                  senderRole: 'customer',
                  message: text,
                  status: 'open',
                })
              } catch {}
            }
            navigate('/support')
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
          <span>{lang === 'bn' ? 'কার্ট নিয়ে ইন-অ্যাপ সাপোর্টে কথা বলুন' : 'Ask In-App Support About Cart'}</span>
        </button>
      </div>

      {/* 📱 Mobile Floating Sticky Checkout Bar */}
      <div className="mobile-cart-sticky-bar">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#166534' }}>
              ₹{cartTotal}
            </span>
            <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>
              ({lang === 'bn' ? '১০% অগ্রিম' : '10% Adv'}: ₹{cartTotal > 0 ? Math.max(1, Math.ceil(cartTotal * 0.1)) : 0})
            </span>
          </div>
          {!canCheckout ? (
            <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 700 }}>
              {lang === 'bn' ? `আরও ₹${shortfall} যোগ করুন (মিনিমাম ₹${MIN_ORDER_AMOUNT})` : `Add ₹${shortfall} more for min order`}
            </span>
          ) : (
            <span style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 700 }}>
              {totalSavings > 0
                ? (lang === 'bn' ? `🎉 সাশ্রয় ₹${totalSavings}` : `🎉 Saved ₹${totalSavings}`)
                : (lang === 'bn' ? '✓ চেকআউটের জন্য প্রস্তুত' : '✓ Ready for checkout')}
            </span>
          )}
        </div>

        {canCheckout ? (
          user ? (
            <Link
              to="/checkout"
              className="btn btn-primary"
              style={{
                padding: '0.65rem 1.25rem',
                fontSize: '0.9rem',
                fontWeight: 800,
                borderRadius: '10px',
                boxShadow: '0 3px 10px rgba(22, 101, 52, 0.35)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {lang === 'bn' ? 'চেকআউট ➔' : 'Checkout ➔'}
            </Link>
          ) : (
            <Link
              to="/auth"
              className="btn btn-primary"
              style={{
                padding: '0.65rem 1.2rem',
                fontSize: '0.86rem',
                fontWeight: 800,
                borderRadius: '10px',
                boxShadow: '0 3px 10px rgba(22, 101, 52, 0.35)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {lang === 'bn' ? 'লগইন ➔' : 'Login ➔'}
            </Link>
          )
        ) : (
          <Link
            to="/"
            className="btn btn-secondary"
            style={{
              padding: '0.65rem 1rem',
              fontSize: '0.84rem',
              fontWeight: 700,
              borderRadius: '10px',
              textDecoration: 'none',
            }}
          >
            {t(lang, 'addMore')}
          </Link>
        )}
      </div>
    </div>
  )
}
