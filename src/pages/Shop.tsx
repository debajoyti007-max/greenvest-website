import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import SkeletonCard from '../components/SkeletonCard'
import { showToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT } from '../lib/business'
import { LOW_STOCK_QTY, SEASON_LABELS } from '../lib/business'
import { catLabel, t } from '../lib/i18n'
import { HERO_IMAGE, resolveProductImage } from '../lib/productImages'
import type { Grade, Lang, Product, CartItem } from '../types'

const GRADES: Grade[] = ['A', 'B', 'C']

function ProductCard({
  p,
  lang,
  cart,
  onAdd,
  onUpdateQty,
}: {
  p: Product
  lang: Lang
  cart: CartItem[]
  onAdd: (p: Product, grade: Grade) => void
  onUpdateQty: (productId: string, grade: Grade, qty: number) => void
}) {
  const [cardGrade, setCardGrade] = useState<Grade>('B')
  const [showGradeInfo, setShowGradeInfo] = useState(false)
  const img = resolveProductImage(p.id, p.imageUrl, `${p.name} ${p.bnName}`)
  const low =
    p.inStock && p.stockQty != null && p.stockQty > 0 && p.stockQty <= LOW_STOCK_QTY

  const priceMap: Record<Grade, number> = { A: p.pA, B: p.pB, C: p.pC }

  const cartItem = cart.find((c) => c.productId === p.id && c.grade === cardGrade)
  const cartQty = cartItem ? cartItem.qty : 0

  const gradeLabels: Record<Grade, { en: string; bn: string }> = {
    A: { en: 'A (Premium)', bn: 'A (প্রিমিয়াম)' },
    B: { en: 'B (Standard)', bn: 'B (দৈনন্দিন)' },
    C: { en: 'C (Budget)', bn: 'C (সাশ্রয়ী)' },
  }

  return (
    <article className={`product-tile premium-tile ${p.inStock ? '' : 'out'}`}>
      <div className="product-media photo">
        <img
          src={img}
          alt={lang === 'bn' ? p.bnName : p.name}
          className="product-photo"
          loading="lazy"
          onError={(e) => {
            const el = e.currentTarget
            const fallback = resolveProductImage(p.id, undefined, `${p.name} ${p.bnName}`)
            if (!el.src.endsWith(fallback)) el.src = fallback
          }}
        />
        {!p.inStock && <span className="stock-badge">{t(lang, 'outOfStock')}</span>}
        {low && (
          <span className="stock-badge low-badge">
            {lang === 'bn' ? 'কম স্টক' : 'Low stock'}
          </span>
        )}
        {p.season && p.season !== 'all' && (
          <span className="season-badge">{SEASON_LABELS[p.season][lang]}</span>
        )}
      </div>
      <div className="product-body">
        <h2>{lang === 'bn' ? p.bnName : p.name}</h2>
        <p className="muted">
          {lang === 'bn' ? p.name : p.bnName} · {p.unit}
        </p>

        {/* Grade segment toggle */}
        <div className="card-grade-toggle">
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              className={`card-grade-btn ${cardGrade === g ? 'active' : ''}`}
              onClick={() => setCardGrade(g)}
              aria-pressed={cardGrade === g}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="price-row">
          <span className="price">₹{priceMap[cardGrade]}</span>
          <span className="grade-price-label">
            {gradeLabels[cardGrade][lang]}
            <span className="grade-info-tip" onClick={() => setShowGradeInfo(!showGradeInfo)} style={{ cursor: 'pointer' }}> ℹ️</span>
          </span>
        </div>

        {showGradeInfo && (
          <div style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem', background: '#f0fdf4', borderRadius: '6px', marginBottom: '0.4rem', lineHeight: 1.6 }}>
            <div><strong>A (Premium)</strong> — {lang === 'bn' ? 'তাজা ও সেরা কোয়ালিটি' : 'Fresh & premium quality'} · ₹{priceMap.A}/{p.unit}</div>
            <div><strong>B (Standard)</strong> — {lang === 'bn' ? 'দৈনন্দিন রান্নায় ব্যবহার্য' : 'Good for daily cooking'} · ₹{priceMap.B}/{p.unit}</div>
            <div><strong>C (Budget)</strong> — {lang === 'bn' ? 'সাশ্রয়ী বাজার মূল্য' : 'Economical budget price'} · ₹{priceMap.C}/{p.unit}</div>
          </div>
        )}

        {cartQty > 0 ? (
          <div className="card-stepper">
            <button
              type="button"
              className="btn btn-secondary stepper-btn"
              onClick={() => onUpdateQty(p.id, cardGrade, cartQty - 1)}
            >
              −
            </button>
            <span className="stepper-qty-badge">
              <strong>{cartQty}</strong> {p.unit}
            </span>
            <button
              type="button"
              className="btn btn-secondary stepper-btn"
              onClick={() => onUpdateQty(p.id, cardGrade, cartQty + 1)}
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!p.inStock}
            onClick={() => onAdd(p, cardGrade)}
          >
            + {t(lang, 'addToCart')}
          </button>
        )}
      </div>
    </article>
  )
}

export default function Shop() {
  const { user } = useAuth()
  const { products, orders, cart, lang, addToCart, updateCartQty, priceFor, cartTotal, reorderFromOrder, loading } = useStore()
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Product | null>(null)
  const [grade, setGrade] = useState<Grade>('B')

  const lastOrder = useMemo(() => {
    if (!user) return null
    return orders
      .filter((o) => o.userId === user.id && o.status !== 'cancelled')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null
  }, [user, orders])

  const handleRepeatOrder = () => {
    if (!lastOrder) return
    const { added: count } = reorderFromOrder(lastOrder)
    showToast(
      lang === 'bn'
        ? `আগের অর্ডারের ${count} টি সবজি কার্টে যোগ হয়েছে!`
        : `${count} items from last order added to cart!`,
      '🔁'
    )
  }

  const shopProducts = useMemo(() => products.filter((p) => !p.archived), [products])

  const categories = useMemo(() => {
    const set = new Set(shopProducts.map((p) => p.category))
    return ['All', ...Array.from(set)]
  }, [shopProducts])

  const filtered = shopProducts.filter((p) => {
    const catOk = category === 'All' || p.category === category
    const q = search.trim().toLowerCase()
    const searchOk =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.bnName.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    return catOk && searchOk
  })

  const available = filtered.filter((p) => p.inStock)
  const unavailable = filtered.filter((p) => !p.inStock)

  // Progress bar
  const progressPct = Math.min(100, Math.round((cartTotal / MIN_ORDER_AMOUNT) * 100))
  const shortfall = Math.max(0, MIN_ORDER_AMOUNT - cartTotal)

  const currentMonth = new Date().getMonth()
  const currentSeason = (currentMonth >= 2 && currentMonth <= 4) ? 'summer' : (currentMonth >= 5 && currentMonth <= 8) ? 'rainy' : 'winter'
  const seasonalInStock = available.filter(p => p.season === currentSeason)
  
  const suggestions = useMemo(() => {
    if (cartTotal >= 300 && cartTotal < MIN_ORDER_AMOUNT) {
      return available
        .filter(p => priceFor(p, 'B') >= shortfall)
        .sort((a, b) => priceFor(a, 'B') - priceFor(b, 'B'))
        .slice(0, 2)
    }
    return []
  }, [cartTotal, MIN_ORDER_AMOUNT, available, shortfall, priceFor])

  const handleAddDirect = (p: Product, g: Grade) => {
    if (!p.inStock) return
    addToCart(p.id, g, 1)
    showToast(
      lang === 'bn'
        ? `${p.bnName} (গ্রেড ${g}) কার্টে যোগ হয়েছে!`
        : `${p.name} (Grade ${g}) added to cart!`,
      p.emoji || '✅'
    )
  }

  const confirmAdd = () => {
    if (!picked) return
    addToCart(picked.id, grade, 1)
    setPicked(null)
    showToast(
      lang === 'bn'
        ? `${picked.bnName} কার্টে যোগ হয়েছে!`
        : `${picked.name} added to cart!`,
      picked.emoji || '✅'
    )
  }

  const scrollToGrid = () => {
    document.getElementById('veg-grid')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="page shop-page">
      <section className="hero-full" style={{ backgroundImage: `url(${HERO_IMAGE})` }}>
        <div className="hero-full-shade hero-shade-strong" />
        <div className="hero-full-copy hero-animated">
          <p className="hero-kicker hero-anim-1">{t(lang, 'farmToDoor')}</p>
          <h1 className="brand-hero light hero-anim-2">GreenVest</h1>
          <p className="hero-sub hero-anim-3">
            {lang === 'bn'
              ? `গ্রেড A/B/C · মিনিমাম ₹${MIN_ORDER_AMOUNT} · ডেলিভারি ${DELIVERY_WINDOW_BN}`
              : `Grade A/B/C · Min ₹${MIN_ORDER_AMOUNT} · Delivery ${DELIVERY_WINDOW}`}
          </p>
          <button type="button" className="btn btn-primary hero-cta hero-anim-4" onClick={scrollToGrid}>
            {t(lang, 'shopVeggies')}
          </button>
        </div>
      </section>

      {/* Trust strips */}
      <div className="trust-strips">
        <div className="trust-item">
          <span className="trust-icon">🚜</span>
          <div>
            <strong>{lang === 'bn' ? 'সরাসরি ফার্ম থেকে' : 'Farm Fresh'}</strong>
            <span>{lang === 'bn' ? 'প্রতিদিন তাজা সবজি' : 'Sourced daily'}</span>
          </div>
        </div>
        <div className="trust-item">
          <span className="trust-icon">⚡</span>
          <div>
            <strong>{lang === 'bn' ? `${DELIVERY_WINDOW_BN} ডেলিভারি` : `${DELIVERY_WINDOW} Delivery`}</strong>
            <span>{lang === 'bn' ? 'দ্রুত ডোরস্টেপ' : 'Fast doorstep'}</span>
          </div>
        </div>
        <div className="trust-item">
          <span className="trust-icon">💯</span>
          <div>
            <strong>{lang === 'bn' ? 'গ্রেড গ্যারান্টি' : 'Grade Guarantee'}</strong>
            <span>{lang === 'bn' ? 'A/B/C মান নিশ্চিত' : 'A/B/C quality assured'}</span>
          </div>
        </div>
        <div className="trust-item">
          <span className="trust-icon">🔒</span>
          <div>
            <strong>{lang === 'bn' ? 'নিরাপদ UPI পেমেন্ট' : 'Safe UPI Payment'}</strong>
            <span>{lang === 'bn' ? 'GPay · PhonePe · BHIM' : 'GPay · PhonePe · BHIM'}</span>
          </div>
        </div>
      </div>

      <div className="shop-body" id="veg-grid">
        {/* Repeat Last Order banner for returning customers */}
        {lastOrder && (
          <div className="repeat-order-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #86efac', borderRadius: '14px', padding: '0.85rem 1.1rem', marginBottom: '1.25rem' }}>
            <div>
              <strong style={{ color: '#166534', fontSize: '0.95rem', display: 'block', marginBottom: '0.15rem' }}>
                {lang === 'bn' ? '🔁 আগের অর্ডার পুনরাবৃত্তি করুন' : '🔁 Repeat Your Last Order'}
              </strong>
              <span style={{ fontSize: '0.82rem', color: '#15803d' }}>
                {lang === 'bn'
                  ? `${lastOrder.items.length}টি আইটেম (${lastOrder.items.map((i) => i.name).join(', ')})`
                  : `${lastOrder.items.length} items (${lastOrder.items.map((i) => i.name).join(', ')})`}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRepeatOrder}
              style={{ whiteSpace: 'nowrap', padding: '0.45rem 0.9rem', fontSize: '0.88rem' }}
            >
              {lang === 'bn' ? '১-ট্যাপ যোগ করুন' : '1-Tap Re-order'}
            </button>
          </div>
        )}
        {/* Cart minimum progress bar */}
        <div className="cart-progress-wrap">
          <div className="cart-progress-header">
            <span className="cart-progress-label">
              {cartTotal === 0
                ? (lang === 'bn' ? '🛒 কার্টে কিছু নেই' : '🛒 Cart is empty')
                : progressPct >= 100
                  ? (lang === 'bn' ? '🎉 মিনিমাম পূরণ হয়েছে!' : '🎉 Minimum reached!')
                  : (lang === 'bn'
                      ? `আর মাত্র ₹${shortfall} যোগ করুন — বিনামূল্যে ডেলিভারি পান!`
                      : `Add ₹${shortfall} more for free delivery!`)}
            </span>
            <span className="cart-progress-amount">₹{cartTotal} / ₹{MIN_ORDER_AMOUNT}</span>
          </div>
          <div className="cart-progress-track" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="cart-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          {suggestions.length > 0 && (
            <div className="cart-suggestions">
              {suggestions.map(p => (
                <button key={p.id} type="button" onClick={() => addToCart(p.id, 'B', 1)}>
                  + {lang === 'bn' ? 'যোগ করুন' : 'Add'} {lang === 'bn' ? p.bnName : p.name} {p.unit} (₹{priceFor(p, 'B')}) {lang === 'bn' ? `₹${MIN_ORDER_AMOUNT} পৌঁছাতে` : `to reach ₹${MIN_ORDER_AMOUNT}`}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="toolbar">
          <label className="search-field">
            <span className="sr-only">{t(lang, 'search')}</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(lang, 'search')}
            />
          </label>
          <div className="cat-filters">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip ${category === c ? 'active' : ''}`}
                onClick={() => setCategory(c)}
              >
                {catLabel(lang, c)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="product-grid premium-grid">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="empty">
            {lang === 'bn' ? 'কোনো সবজি পাওয়া যায়নি।' : 'No vegetables match your search.'}
          </p>
        ) : (
          <>
            {seasonalInStock.length > 0 && category === 'All' && search === '' && (
              <div className="season-banner">
                {currentSeason === 'summer' ? '☀️' : currentSeason === 'rainy' ? '🌧️' : '❄️'} 
                {lang === 'bn' ? 
                  (currentSeason === 'summer' ? ' গ্রীষ্মকালীন' : currentSeason === 'rainy' ? ' বর্ষাকালীন' : ' শীতকালীন') + ` স্পেশাল (${seasonalInStock.length})` 
                  : ` ${currentSeason.charAt(0).toUpperCase() + currentSeason.slice(1)} Season Specials (${seasonalInStock.length})`}
              </div>
            )}
            <section className="shop-section">
              <h2 className="section-title">
                {lang === 'bn' ? 'আজকের স্টক' : 'Available today'}
                <span className="muted"> ({available.length})</span>
              </h2>
              {available.length === 0 ? (
                <p className="empty">
                  {lang === 'bn' ? 'এখন স্টকে কিছু নেই।' : 'Nothing in stock right now.'}
                </p>
              ) : (
                <div className="product-grid premium-grid">
                  {available.map((p) => (
                    <ProductCard
                      key={p.id}
                      p={p}
                      lang={lang}
                      cart={cart}
                      onAdd={handleAddDirect}
                      onUpdateQty={updateCartQty}
                    />
                  ))}
                </div>
              )}
            </section>

            {unavailable.length > 0 && (
              <section className="shop-section shop-section-old">
                <h2 className="section-title">
                  {lang === 'bn' ? 'এখন নেই (পরে আসতে পারে)' : 'Currently unavailable'}
                  <span className="muted"> ({unavailable.length})</span>
                </h2>
                <p className="hint">
                  {lang === 'bn'
                    ? 'স্টক আউট আইটেম নিচে সরে যায় — কার্টে যোগ করা যায় না।'
                    : 'Out-of-stock items move here automatically — cannot add to cart.'}
                </p>
                <div className="product-grid premium-grid">
                  {unavailable.map((p) => (
                    <ProductCard
                      key={p.id}
                      p={p}
                      lang={lang}
                      cart={cart}
                      onAdd={handleAddDirect}
                      onUpdateQty={updateCartQty}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <p className="shop-footnote">
          <Link to="/cart">{t(lang, 'viewCart')}</Link>
          {' · '}
          {lang === 'bn'
            ? 'পেমেন্ট: UPI QR + ম্যানুয়াল UTR'
            : 'Pay via UPI QR + manual UTR'}
        </p>
      </div>

      {picked && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPicked(null)}>
          <div
            className="modal premium-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="grade-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-photo">
              <img src={resolveProductImage(picked.id, picked.imageUrl, `${picked.name} ${picked.bnName}`)} alt={picked.name} />
            </div>
            <h2 id="grade-title">{lang === 'bn' ? picked.bnName : picked.name}</h2>
            <p className="muted">{t(lang, 'selectGrade')}</p>
            <div className="grade-picker">
              {(['A', 'B', 'C'] as Grade[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`grade-btn ${grade === g ? 'active' : ''}`}
                  onClick={() => setGrade(g)}
                >
                  {t(lang, 'grade')} {g} · ₹{priceFor(picked, g)}
                </button>
              ))}
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-primary" onClick={confirmAdd}>
                {t(lang, 'addToCart')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPicked(null)}>
                {t(lang, 'cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
