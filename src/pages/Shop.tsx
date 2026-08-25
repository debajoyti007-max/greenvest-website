import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import SkeletonCard from '../components/SkeletonCard'
import WeeklyBasketModal from '../components/WeeklyBasketModal'
import MyUsualBasketModal from '../components/MyUsualBasketModal'
import CategoryBar from '../components/CategoryBar'
import { showToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT } from '../lib/business'
import { LOW_STOCK_QTY, SEASON_LABELS } from '../lib/business'
import { catLabel, t } from '../lib/i18n'
import { HERO_IMAGE, HERO_VEGGIES_IMAGE, HERO_FISH_IMAGE, resolveProductImage } from '../lib/productImages'
import { matchesProductQuery } from '../lib/searchUtils'
import { STORE_LOCATION } from '../lib/delivery'
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
  onAdd: (p: Product, grade: Grade, qty?: number, weightMultiplier?: number, weightLabel?: string) => void
  onUpdateQty: (productId: string, grade: Grade, qty: number, weightMultiplier?: number) => void
}) {
  const [cardGrade, setCardGrade] = useState<Grade>('B')
  const [showGradeInfo, setShowGradeInfo] = useState(false)
  const [weightMultiplier, setWeightMultiplier] = useState<number>(1)

  const img = resolveProductImage(p.id, p.imageUrl, `${p.name} ${p.bnName}`)
  const low =
    p.inStock && p.stockQty != null && p.stockQty > 0 && p.stockQty <= LOW_STOCK_QTY

  const basePrice = (cardGrade === 'A' ? p.pA : cardGrade === 'C' ? p.pC : p.pB) || p.pB || p.pA
  const calculatedPrice = Math.round(basePrice * weightMultiplier)

  const cartItem = cart.find(
    (c) => c.productId === p.id && c.grade === cardGrade && (c.weightMultiplier || 1) === weightMultiplier,
  )
  const cartQty = cartItem ? cartItem.qty : 0

  const gradeLabels: Record<Grade, { en: string; bn: string }> = {
    A: { en: 'A (Premium)', bn: 'A (প্রিমিয়াম)' },
    B: { en: 'B (Standard)', bn: 'B (দৈনন্দিন)' },
    C: { en: 'C (Economy)', bn: 'C (সাশ্রয়ী)' },
  }

  const isKg = p.unit.toLowerCase() === 'kg'

  return (
    <article className={`product-tile premium-tile glass-product-tile ${p.inStock ? '' : 'out'}`}>
      <div className="product-media photo">
        <img
          src={img}
          alt={`${p.bnName} ${p.name}`}
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
          <span className="stock-badge season-badge">
            {SEASON_LABELS[p.season]?.[lang] || p.season}
          </span>
        )}
      </div>

      <div className="product-info">
        {/* Dual Bengali + English Name & Prominent Price Badge */}
        <div className="product-title-dual-row">
          <div className="product-title-dual">
            <h3 className="product-bn-name">{p.bnName}</h3>
            <span className="product-en-name">{p.name}</span>
          </div>
          <div className="product-price-badge-top" aria-label={`Price: ₹${calculatedPrice}`}>
            <span className="price-bold-val">₹{calculatedPrice}</span>
            <span className="price-sub-unit">
              /{weightMultiplier === 1 ? p.unit : weightMultiplier === 0.25 ? '250g' : weightMultiplier === 0.5 ? '500g' : `${weightMultiplier}kg`}
            </span>
          </div>
        </div>

        <p className="subtle">{catLabel(lang, p.category)}</p>

        {/* Grade selector chips with accessible group label */}
        <div className="grade-selector-glass" role="radiogroup" aria-labelledby={`grade-lbl-${p.id}`}>
          <span className="chip-group-label" id={`grade-lbl-${p.id}`}>
            {lang === 'bn' ? 'গ্রেড:' : 'Grade:'}
          </span>
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              className={`grade-chip-glass ${cardGrade === g ? 'active' : ''}`}
              onClick={() => setCardGrade(g)}
              aria-label={`Grade ${g}`}
              aria-pressed={cardGrade === g}
            >
              Grade {g}
            </button>
          ))}
          <button
            type="button"
            className="info-btn-glass"
            onClick={() => setShowGradeInfo(!showGradeInfo)}
            title="Quality grade info"
            aria-label="Quality grade information"
          >
            ℹ️
          </button>
        </div>

        {showGradeInfo && (
          <p className="grade-desc-glass">
            {gradeLabels[cardGrade][lang]}
          </p>
        )}

        {/* Quick Weight Chips (for kg items) with accessible group label */}
        {isKg && (
          <div className="weight-chips-row" role="radiogroup" aria-labelledby={`weight-lbl-${p.id}`}>
            <span className="chip-group-label" id={`weight-lbl-${p.id}`}>
              {lang === 'bn' ? 'ওজন:' : 'Size:'}
            </span>
            {[
              { val: 0.25, label: '250g' },
              { val: 0.5, label: '500g' },
              { val: 1, label: '1 kg' },
              { val: 2, label: '2 kg' },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                className={`weight-chip ${weightMultiplier === chip.val ? 'active' : ''}`}
                onClick={() => setWeightMultiplier(chip.val)}
                aria-pressed={weightMultiplier === chip.val}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Price Row with Glass-Mono tag */}
        <div className="price-row-glass">
          <div className="price-mono-group">
            <span className="price-mono-val">₹{calculatedPrice}</span>
            <span className="price-mono-unit">
              / {weightMultiplier === 1 ? p.unit : weightMultiplier === 0.25 ? '250g' : weightMultiplier === 0.5 ? '500g' : `${weightMultiplier}kg`}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        {cartQty > 0 ? (
          <div className="qty-controls-glass">
            <button
              type="button"
              className="qty-btn"
              onClick={() => onUpdateQty(p.id, cardGrade, cartQty - 1, weightMultiplier)}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="qty-val-mono">{cartQty}</span>
            <button
              type="button"
              className="qty-btn"
              onClick={() => onUpdateQty(p.id, cardGrade, cartQty + 1, weightMultiplier)}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-add-glass"
            disabled={!p.inStock}
            onClick={() => {
              const label = weightMultiplier === 1 ? p.unit : weightMultiplier === 0.25 ? '250g' : weightMultiplier === 0.5 ? '500g' : `${weightMultiplier}kg`
              onAdd(p, cardGrade, 1, weightMultiplier, label)
            }}
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
  const {
    products,
    orders,
    cart,
    lang,
    addToCart,
    updateCartQty,
    priceFor,
    cartTotal,
    reorderFromOrder,
    loading,
  } = useStore()

  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [heroSlide, setHeroSlide] = useState(0)
  const [showBasketModal, setShowBasketModal] = useState(false)
  const [showUsualBasketModal, setShowUsualBasketModal] = useState(false)

  // Auto-slide hero banner every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setHeroSlide((prev) => (prev + 1) % 3)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  // Auto-redirect rider away from Shop to Rider Live Delivery View
  if (user?.role === 'rider') {
    return <Navigate to="/rider" replace />
  }

  const lastOrder = useMemo(() => {
    if (!user) return null
    return (
      orders
        .filter((o) => o.userId === user.id && o.status !== 'cancelled')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null
    )
  }, [user, orders])

  const handleRepeatOrder = () => {
    if (!lastOrder) return
    const { added: count } = reorderFromOrder(lastOrder)
    showToast(
      lang === 'bn'
        ? `আগের অর্ডারের ${count} টি সামগ্রী কার্টে যোগ হয়েছে!`
        : `${count} items from last order added to cart!`,
      '🔁'
    )
  }

  const shopProducts = useMemo(() => products.filter((p) => !p.archived), [products])

  const categories = useMemo(() => {
    const set = new Set(shopProducts.map((p) => p.category))
    return ['All', ...Array.from(set)]
  }, [shopProducts])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: shopProducts.length }
    shopProducts.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1
    })
    return counts
  }, [shopProducts])

  // Banglish & phonetic smart search filter
  const filtered = useMemo(() => {
    return shopProducts.filter((p) => {
      const catOk = category === 'All' || p.category === category
      const searchOk = !search.trim() || matchesProductQuery(p, search)
      return catOk && searchOk
    })
  }, [shopProducts, category, search])

  const available = filtered.filter((p) => p.inStock)
  const unavailable = filtered.filter((p) => !p.inStock)

  // Progress bar
  const progressPct = Math.min(100, Math.round((cartTotal / MIN_ORDER_AMOUNT) * 100))
  const shortfall = Math.max(0, MIN_ORDER_AMOUNT - cartTotal)

  const currentMonth = new Date().getMonth()
  const currentSeason =
    currentMonth >= 2 && currentMonth <= 4
      ? 'summer'
      : currentMonth >= 5 && currentMonth <= 9
        ? 'rainy'
        : 'winter'
  const seasonalInStock = available.filter((p) => p.season === currentSeason)

  const suggestions = useMemo(() => {
    if (cartTotal >= 250 && cartTotal < MIN_ORDER_AMOUNT) {
      const inCartIds = new Set(cart.map((c) => c.productId))
      return available
        .filter((p) => !inCartIds.has(p.id) && priceFor(p, 'B') > 0)
        .sort((a, b) => {
          const diffA = Math.abs(priceFor(a, 'B') - shortfall)
          const diffB = Math.abs(priceFor(b, 'B') - shortfall)
          return diffA - diffB
        })
        .slice(0, 3)
    }
    return []
  }, [cartTotal, available, shortfall, priceFor, cart])

  const handleAddDirect = (p: Product, g: Grade, qty = 1, weightMultiplier = 1, weightLabel?: string) => {
    if (!p.inStock) return
    addToCart(p.id, g, qty, weightMultiplier, weightLabel)
    const lbl = weightLabel && weightLabel !== p.unit ? ` (${weightLabel})` : ''
    showToast(
      lang === 'bn'
        ? `${p.bnName}${lbl} (${g}) কার্টে যোগ হয়েছে!`
        : `${p.name}${lbl} (${g}) added to cart!`,
      p.emoji || '✅',
    )
  }

  const handleAddBulkStaples = (items: { product: Product; grade: Grade; qty: number }[]) => {
    items.forEach((item) => {
      addToCart(item.product.id, item.grade, item.qty)
    })
  }

  const scrollToGrid = () => {
    document.getElementById('veg-grid')?.scrollIntoView({ behavior: 'smooth' })
  }

  const slides = useMemo(
    () => [
      {
        image: HERO_VEGGIES_IMAGE,
        kicker: lang === 'bn' ? '🚜 সরাসরি খামার থেকে প্রতিদিন তাজা' : '🚜 Farm-Fresh Daily Harvest',
        title: lang === 'bn' ? 'তাজা সবজি ও আলু-টমেটো' : 'Fresh Vegetables & Organic Produce',
        sub:
          lang === 'bn'
            ? `গ্রেড A/B/C · মিনিমাম ₹${MIN_ORDER_AMOUNT} · ডেলিভারি ${DELIVERY_WINDOW_BN}`
            : `Grade A/B/C · Min ₹${MIN_ORDER_AMOUNT} · Delivery ${DELIVERY_WINDOW}`,
        buttonText: lang === 'bn' ? 'সবজি কিনুন 🛒' : 'Shop Veggies 🛒',
        onClick: () => {
          setCategory('Vegetables')
          scrollToGrid()
        },
      },
      {
        image: HERO_FISH_IMAGE,
        kicker: lang === 'bn' ? '🐟 নদী ও সমুদ্রের টাটকা মাছ' : '🐟 Fresh River & Sea Catch',
        title: lang === 'bn' ? 'তাজা রুই, ইলিশ, চিংড়ি ও ভেটকি' : 'Fresh Rui, Hilsa, Prawns & Fish',
        sub:
          lang === 'bn'
            ? '১০০% টাটকা মাছ · প্রতিদিনের বাজার দর · দ্রুত হোম ডেলিভারি'
            : '100% Fresh Daily Catch · Live Market Prices · Fast Home Delivery',
        buttonText: lang === 'bn' ? 'মাছ দেখুন 🐟' : 'Explore Fish 🐟',
        onClick: () => {
          setCategory('Fish')
          scrollToGrid()
        },
      },
      {
        image: HERO_IMAGE,
        kicker: lang === 'bn' ? '⭐ সেরা মানের নিশ্চয়তা' : '⭐ Guaranteed Quality & Best Prices',
        title: lang === 'bn' ? 'আপনার বাজেটে এ, বি, সি গ্রেড' : 'Grade A, B, C For Every Budget',
        sub:
          lang === 'bn'
            ? 'প্রতিদিনের তাজা দর · নিয়মিত ক্রেতাদের বিশেষ কুপন ছাড়'
            : 'Daily Price Updates · Special Coupon Offers For Frequent Buyers',
        buttonText: lang === 'bn' ? 'এখনই অর্ডার করুন 🚀' : 'Order Now 🚀',
        onClick: scrollToGrid,
      },
    ],
    [lang]
  )

  return (
    <div className="page shop-page">
      {/* 🚀 Hero Banner */}
      <section
        className="hero-full hero-slider-wrapper"
        style={{
          backgroundImage: `url(${slides[heroSlide].image})`,
          transition: 'background-image 0.8s ease-in-out',
        }}
      >
        <div className="hero-full-shade hero-shade-strong" />

        <button
          type="button"
          aria-label="Previous Slide"
          className="hero-arrow hero-arrow-left"
          onClick={() => setHeroSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1))}
        >
          ‹
        </button>

        <button
          type="button"
          aria-label="Next Slide"
          className="hero-arrow hero-arrow-right"
          onClick={() => setHeroSlide((prev) => (prev + 1) % slides.length)}
        >
          ›
        </button>

        <div className="hero-full-copy hero-animated" key={heroSlide}>
          <p className="hero-kicker hero-anim-1">{slides[heroSlide].kicker}</p>
          <h1 className="brand-hero light hero-anim-2">{slides[heroSlide].title}</h1>
          <p className="hero-sub hero-anim-3">{slides[heroSlide].sub}</p>
          <button
            type="button"
            className="btn btn-primary hero-cta hero-anim-4"
            onClick={slides[heroSlide].onClick}
          >
            {slides[heroSlide].buttonText}
          </button>
        </div>

        <div className="hero-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`hero-dot ${i === heroSlide ? 'active' : ''}`}
              onClick={() => setHeroSlide(i)}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
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
        {/* 🔍 Search Field with Banglish & Phonetic Support (Top Positioned for Quick Access) */}
        <div className="shop-search-toolbar">
          <div className="glass-search-field">
            <span className="search-glass-icon">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === 'bn' ? 'সবজি, মাছ বা Banglish খুঁজুন (যেমন: alu, potol, chingri, ada)…' : 'Search veggies, fish or Banglish (alu, potol, chingri)…'}
              className="glass-search-input"
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Repeat Last Order banner for returning customers */}
        {lastOrder && (
          <div className="repeat-order-banner glass-mono-banner">
            <div>
              <strong className="repeat-banner-title">
                {lang === 'bn' ? '🔁 আগের অর্ডার পুনরাবৃত্তি করুন' : '🔁 Repeat Your Last Order'}
              </strong>
              <span className="repeat-banner-sub">
                {lastOrder.items.length} {lang === 'bn' ? 'টি সামগ্রী' : 'items'} ({lastOrder.items.map((i) => i.name).join(', ')})
              </span>
            </div>
            <button
              type="button"
              className="glass-action-pill-btn"
              onClick={handleRepeatOrder}
            >
              {lang === 'bn' ? '১-ট্যাপে যোগ করুন' : '1-Tap Re-order'}
            </button>
          </div>
        )}

        {/* 🌟 Ultra-Compact Glass Quick-Actions Bar (Low Space, Clean & Premium) */}
        <div className="glass-quick-bar">
          <button
            type="button"
            className="glass-quick-pill"
            onClick={() => setShowUsualBasketModal(true)}
          >
            <span className="glass-pill-icon">🧺</span>
            <div className="glass-pill-text">
              <strong className="glass-pill-bn">{lang === 'bn' ? 'আমার পছন্দের ফর্দ' : 'My Usual Basket'}</strong>
              <span className="glass-pill-hint">1-Tap Essentials</span>
            </div>
            <span className="glass-pill-arrow">➔</span>
          </button>

          <button
            type="button"
            className="glass-quick-pill secondary"
            onClick={() => setShowBasketModal(true)}
          >
            <span className="glass-pill-icon">📦</span>
            <div className="glass-pill-text">
              <strong className="glass-pill-bn">{lang === 'bn' ? 'পারিবারিক বাস্কেট' : 'Family Basket'}</strong>
              <span className="glass-pill-hint">Curated Combo</span>
            </div>
            <span className="glass-pill-arrow">➔</span>
          </button>
        </div>

        {/* Cart minimum progress bar with interactive affordance */}
        <div className="cart-progress-wrap glass-progress-wrap">
          <div className="cart-progress-header">
            <Link to="/cart" className="cart-progress-label-link" title={t(lang, 'viewCart')}>
              <span className="cart-progress-label">
                {cartTotal === 0
                  ? lang === 'bn'
                    ? '🛒 কার্টে কিছু নেই'
                    : '🛒 Cart is empty'
                  : progressPct >= 100
                    ? lang === 'bn'
                      ? '🎉 মিনিমাম পূরণ হয়েছে!'
                      : '🎉 Minimum reached!'
                    : lang === 'bn'
                      ? `আর মাত্র ₹${shortfall} যোগ করুন — বিনামূল্যে ডেলিভারি পান!`
                      : `Add ₹${shortfall} more for free delivery!`}
              </span>
              <span className="cart-progress-view-hint">{lang === 'bn' ? 'কার্ট দেখুন ➔' : 'View Cart ➔'}</span>
            </Link>
            <span className="cart-progress-amount-mono">₹{cartTotal} / ₹{MIN_ORDER_AMOUNT}</span>
          </div>
          <div
            className="cart-progress-track"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="cart-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          {suggestions.length > 0 && (
            <div className="cart-suggestions">
              {suggestions.map((p) => (
                <button key={p.id} type="button" onClick={() => addToCart(p.id, 'B', 1)}>
                  + {lang === 'bn' ? 'যোগ করুন' : 'Add'} {p.bnName} / {p.name} (₹{priceFor(p, 'B')})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 🏷️ Horizontal Visual Category Chips Bar */}
        <CategoryBar
          categories={categories}
          selectedCategory={category}
          onSelectCategory={setCategory}
          lang={lang}
          categoryCounts={categoryCounts}
        />

        {loading ? (
          <div className="product-grid premium-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-empty-box">
            <span className="glass-empty-icon">🔍</span>
            <p className="glass-empty-text">
              {lang === 'bn'
                ? `"${search}" এর সাথে কোনো সবজি বা মাছ পাওয়া যায়নি।`
                : `No items found matching "${search}".`}
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearch('')
                setCategory('All')
              }}
            >
              {lang === 'bn' ? 'সব দেখুন' : 'Show All Items'}
            </button>
          </div>
        ) : (
          <>
            {seasonalInStock.length > 0 && category === 'All' && search === '' && (
              <div className="season-banner glass-season-banner">
                {currentSeason === 'summer' ? '☀️' : currentSeason === 'rainy' ? '🌧️' : '❄️'}
                {lang === 'bn'
                  ? (currentSeason === 'summer'
                      ? ' গ্রীষ্মকালীন'
                      : currentSeason === 'rainy'
                        ? ' বর্ষাকালীন'
                        : ' শীতকালীন') + ` স্পেশাল (${seasonalInStock.length})`
                  : ` ${currentSeason.charAt(0).toUpperCase() + currentSeason.slice(1)} Season Specials (${seasonalInStock.length})`}
              </div>
            )}

            <section className="shop-section">
              <div className="section-title-row">
                <h2 className="section-title">
                  {lang === 'bn' ? 'আজকের তাজা স্টক' : 'Available Today'}
                </h2>
                <span className="section-count-mono">{available.length} ITEMS</span>
              </div>

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
                <div className="section-title-row">
                  <h2 className="section-title">
                    {lang === 'bn' ? 'এখন নেই (পরে আসতে পারে)' : 'Currently Out of Stock'}
                  </h2>
                  <span className="section-count-mono">{unavailable.length} ITEMS</span>
                </div>
                <p className="hint">
                  {lang === 'bn'
                    ? 'স্টক শেষ আইটেম নিচে দেখানো হচ্ছে — শীঘ্রই নতুন স্টক আসবে।'
                    : 'Out-of-stock items shown here for reference.'}
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

        {/* 🏪 Physical Store & Google Maps Showcase Card (Lower side) */}
        <div className="store-outlet-card">
          <div className="store-outlet-header">
            <div className="store-outlet-title-group">
              <span className="store-outlet-icon">🏪</span>
              <div>
                <div className="store-outlet-name-row">
                  <h3 className="store-outlet-title">
                    {lang === 'bn' ? `${STORE_LOCATION.nameBn} - আমাদের ফিজিক্যাল স্টোর ও আউটলেট` : `${STORE_LOCATION.name} - Physical Store & Outlet`}
                  </h3>
                  <span className="store-outlet-badge">
                    {lang === 'bn' ? 'সরাসরি দোকানে এসে কিনুন' : 'Walk-in & Buy Offline'}
                  </span>
                </div>
                <span className="store-outlet-status">
                  🟢 {lang === 'bn' ? `খোলা থাকে · ${STORE_LOCATION.hoursBn}` : `Open Daily · ${STORE_LOCATION.hours}`}
                </span>
              </div>
            </div>
          </div>

          <p className="store-outlet-address">
            📍 <strong>{lang === 'bn' ? 'ঠিকানা:' : 'Address:'}</strong> {lang === 'bn' ? STORE_LOCATION.addressBn : STORE_LOCATION.address}
          </p>

          <div className="store-outlet-actions">
            <a
              href={STORE_LOCATION.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              🗺️ {lang === 'bn' ? 'Google Maps-এ দেখুন ও নেভিগেট করুন' : 'Open in Google Maps'}
            </a>
            <a
              href={`tel:${STORE_LOCATION.phone}`}
              className="btn btn-secondary"
            >
              📞 {lang === 'bn' ? 'দোকানে ফোন করুন' : 'Call Store'}
            </a>
          </div>
        </div>
      </div>

      {/* 🧺 My Usual Basket Modal (Glass-Mono Popup) */}
      <MyUsualBasketModal
        isOpen={showUsualBasketModal}
        onClose={() => setShowUsualBasketModal(false)}
        products={products}
        lang={lang}
        onAddBulk={handleAddBulkStaples}
      />

      {/* 📦 Weekly Family Basket Modal */}
      {showBasketModal && <WeeklyBasketModal onClose={() => setShowBasketModal(false)} />}
    </div>
  )
}
