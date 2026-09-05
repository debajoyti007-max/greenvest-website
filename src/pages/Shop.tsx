import { useEffect, useMemo, useState, useRef, lazy, Suspense } from 'react'
import { Link, Navigate } from 'react-router-dom'
import SkeletonCard from '../components/SkeletonCard'
import CategoryBar from '../components/CategoryBar'
import DealsBanner from '../components/DealsBanner'
import ShiftBadge from '../components/ShiftBadge'
import { showToast } from '../lib/toast'

// ⚡ Performance Optimization: Lazy-load heavy dialog modals so initial Shop bundle is lightweight
const WeeklyBasketModal = lazy(() => import('../components/WeeklyBasketModal'))
const MyUsualBasketModal = lazy(() => import('../components/MyUsualBasketModal'))
const ProductReviewsModal = lazy(() => import('../components/ProductReviewsModal'))
const PincodeCheckerModal = lazy(() => import('../components/PincodeCheckerModal'))
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT, MAX_VEGETABLE_QTY_KG, computeMarketMrp, SERVICEABLE_PINCODES } from '../lib/business'
import { LOW_STOCK_QTY, SEASON_LABELS } from '../lib/business'
import { catLabel, t } from '../lib/i18n'
import {
  HERO_IMAGE,
  HERO_VEGGIES_IMAGE,
  HERO_FISH_IMAGE,
  HERO_MOBILE_IMAGE,
  HERO_VEGGIES_MOBILE_IMAGE,
  HERO_FISH_MOBILE_IMAGE,
  resolveProductImage,
} from '../lib/productImages'
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
  onOpenReviews,
}: {
  p: Product
  lang: Lang
  cart: CartItem[]
  onAdd: (p: Product, grade: Grade, qty?: number, weightMultiplier?: number, weightLabel?: string) => void
  onUpdateQty: (productId: string, grade: Grade, qty: number, weightMultiplier?: number) => void
  onOpenReviews: (p: Product) => void
}) {
  const { getProductRating, priceFor } = useStore()
  const ratingData = getProductRating(p.id)

  const activeGrades: Grade[] = useMemo(() => {
    if (p.availableGrades && p.availableGrades.length > 0) {
      return p.availableGrades
    }
    return GRADES
  }, [p.availableGrades])

  const [cardGrade, setCardGrade] = useState<Grade>(() => {
    if (activeGrades.includes('B')) return 'B'
    return activeGrades[0] || 'B'
  })

  // Ensure cardGrade stays valid if activeGrades changes
  useEffect(() => {
    if (!activeGrades.includes(cardGrade) && activeGrades.length > 0) {
      setCardGrade(activeGrades[0])
    }
  }, [activeGrades, cardGrade])

  const [showGradeInfo, setShowGradeInfo] = useState(false)
  const [weightMultiplier, setWeightMultiplier] = useState<number>(1)

  const img = resolveProductImage(p.id, p.imageUrl, `${p.name} ${p.bnName}`)
  const low =
    p.inStock && p.stockQty != null && p.stockQty > 0 && p.stockQty <= LOW_STOCK_QTY

  const basePrice = priceFor(p, cardGrade)
  const calculatedPrice = Math.round(basePrice * weightMultiplier)

  // Strikethrough Market MRP calculation (varied dynamic markup per product)
  const mrpPerUnit = p.mrp || computeMarketMrp(basePrice, undefined, p.id || p.name)
  const calculatedMrp = Math.round(mrpPerUnit * weightMultiplier)
  const discountPercent =
    calculatedMrp > calculatedPrice
      ? Math.round(((calculatedMrp - calculatedPrice) / calculatedMrp) * 100)
      : 0

  const cartItem = cart.find(
    (c) => c.productId === p.id && c.grade === cardGrade && (c.weightMultiplier || 1) === weightMultiplier,
  )
  const cartQty = cartItem ? cartItem.qty : 0
  const currentTotalKg = cartQty * weightMultiplier
  const isBulkCapReached = currentTotalKg >= MAX_VEGETABLE_QTY_KG

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
          decoding="async"
          width="320"
          height="320"
          onError={(e) => {
            const el = e.currentTarget
            const fallback = resolveProductImage(p.id, undefined, `${p.name} ${p.bnName}`)
            if (!el.src.endsWith(fallback)) el.src = fallback
          }}
        />
        {discountPercent > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '0.6rem',
              left: '0.6rem',
              background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
              color: '#ffffff',
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: '6px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              letterSpacing: '0.3px',
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            ⚡ {discountPercent}% OFF
          </span>
        )}

        {/* Rating chip on photo corner */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenReviews(p)
          }}
          aria-label={`${ratingData.count} reviews, average rating ${ratingData.avg}`}
          title={lang === 'bn' ? 'কাস্টমার রিভিউ ও রেটিং দেখুন' : 'View Customer Reviews & Ratings'}
          style={{
            position: 'absolute',
            top: '0.6rem',
            right: '0.6rem',
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(0,0,0,0.08)',
            padding: '2px 7px',
            borderRadius: '12px',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: '#1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            cursor: 'pointer',
            zIndex: 2,
            boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          }}
        >
          <span style={{ color: '#eab308' }}>★</span>
          <span>{ratingData.avg.toFixed(1)}</span>
          <span style={{ color: '#64748b', fontSize: '0.68rem' }}>({ratingData.count})</span>
        </button>

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

      <div className="product-info" style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0.85rem' }}>
        {/* Product Title & Category */}
        <div style={{ marginBottom: '0.4rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#14532d', lineHeight: 1.25 }}>
            {p.bnName}
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
            {p.name} · {catLabel(lang, p.category)}
          </span>
        </div>

        {/* Grade selector chips (Option A, B, C toggled on demand by Seller) */}
        {activeGrades.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: '2px 0 6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>
              {lang === 'bn' ? 'গ্রেড:' : 'Grade:'}
            </span>
            {activeGrades.map((g) => (
              <button
                key={g}
                type="button"
                className={`grade-chip-glass ${cardGrade === g ? 'active' : ''}`}
                onClick={() => setCardGrade(g)}
                style={{ padding: '2px 8px', fontSize: '0.72rem', borderRadius: '6px' }}
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
              style={{ fontSize: '0.75rem', padding: '1px 4px' }}
            >
              ℹ️
            </button>
          </div>
        )}

        {showGradeInfo && (
          <p className="grade-desc-glass" style={{ margin: '0 0 6px', fontSize: '0.75rem' }}>
            {gradeLabels[cardGrade][lang]}
          </p>
        )}

        {/* Quick Weight Chips (for kg items) */}
        {isKg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: '2px 0 8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>
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
                style={{ padding: '2px 8px', fontSize: '0.75rem', borderRadius: '6px' }}
                aria-pressed={weightMultiplier === chip.val}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* 10 kg Limit Warning & Bulk Order CTA */}
        {isBulkCapReached && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '4px 8px', margin: '4px 0 8px', fontSize: '0.72rem', color: '#92400e' }}>
            <span>⚠️ {lang === 'bn' ? 'সর্বোচ্চ ১০ কেজি সীমা পৌঁছেছে।' : 'Max 10 kg limit reached.'}</span>
            <Link
              to="/support"
              style={{ display: 'block', color: '#15803d', fontWeight: 700, marginTop: '2px', textDecoration: 'underline' }}
            >
              💬 {lang === 'bn' ? '১০ কেজির বেশি অর্ডারে ইন-অ্যাপ সাপোর্টে জানান' : 'For >10 kg, message in-app support'}
            </Link>
          </div>
        )}

        {/* Unified Bottom Price & Action Footer (NO DUPLICATE PRICES!) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#14532d' }}>
                ₹{calculatedPrice}
              </span>
              {calculatedMrp > calculatedPrice && (
                <span style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '0.82rem', fontWeight: 500 }}>
                  ₹{calculatedMrp}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
              /{weightMultiplier === 1 ? p.unit : weightMultiplier === 0.25 ? '250g' : weightMultiplier === 0.5 ? '500g' : `${weightMultiplier}kg`}
              {calculatedMrp > calculatedPrice && (
                <span style={{ color: '#16a34a', marginLeft: '4px', fontWeight: 700 }}>
                  · {lang === 'bn' ? `সাশ্রয় ₹${calculatedMrp - calculatedPrice}` : `Save ₹${calculatedMrp - calculatedPrice}`}
                </span>
              )}
            </div>
          </div>

          <div>
            {cartQty > 0 ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', background: '#166534', color: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 6px rgba(22, 101, 52, 0.3)' }}>
                <button
                  type="button"
                  onClick={() => onUpdateQty(p.id, cardGrade, cartQty - 1, weightMultiplier)}
                  style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 800, fontSize: '1.05rem', cursor: 'pointer', padding: '4px 10px' }}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', minWidth: '20px', textAlign: 'center' }}>
                  {cartQty}
                </span>
                <button
                  type="button"
                  disabled={isBulkCapReached}
                  onClick={() => onUpdateQty(p.id, cardGrade, cartQty + 1, weightMultiplier)}
                  style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 800, fontSize: '1.05rem', cursor: 'pointer', padding: '4px 10px' }}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!p.inStock}
                onClick={() => {
                  const label = weightMultiplier === 1 ? p.unit : weightMultiplier === 0.25 ? '250g' : weightMultiplier === 0.5 ? '500g' : `${weightMultiplier}kg`
                  onAdd(p, cardGrade, 1, weightMultiplier, label)
                }}
                style={{
                  background: p.inStock ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : '#cbd5e1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 16px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: p.inStock ? 'pointer' : 'not-allowed',
                  boxShadow: p.inStock ? '0 2px 8px rgba(22, 163, 74, 0.3)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                }}
              >
                {p.inStock ? (lang === 'bn' ? '+ যোগ করুন' : '+ ADD') : t(lang, 'outOfStock')}
              </button>
            )}
          </div>
        </div>
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
  const [showPinModal, setShowPinModal] = useState(false)
  const [reviewProduct, setReviewProduct] = useState<Product | null>(null)

  // Auto-slide hero banner every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setHeroSlide((prev) => (prev + 1) % 3)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  // Touch swipe support for mobile
  const touchStartX = useRef<number>(0)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (diff > 45) {
      setHeroSlide((prev) => (prev + 1) % 3)
    } else if (diff < -45) {
      setHeroSlide((prev) => (prev === 0 ? 2 : prev - 1))
    }
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
        mobileImage: HERO_VEGGIES_MOBILE_IMAGE,
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
        mobileImage: HERO_FISH_MOBILE_IMAGE,
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
        mobileImage: HERO_MOBILE_IMAGE,
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

  // Auto-redirect rider away from Shop to Rider Live Delivery View
  if (user?.role === 'rider') {
    return <Navigate to="/rider" replace />
  }

  return (
    <div className="page shop-page">
      {/* 🚀 Hero Banner */}
      <section
        className="hero-full hero-slider-wrapper"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <picture>
          <source
            media="(max-width: 640px)"
            srcSet={slides[heroSlide].mobileImage}
            type="image/webp"
          />
          <img
            src={slides[heroSlide].image}
            alt={slides[heroSlide].title}
            className="hero-slider-bg"
            fetchPriority="high"
            loading="eager"
            decoding="async"
            width="1200"
            height="500"
          />
        </picture>
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
            🛒 {slides[heroSlide].buttonText}
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
          <span className="trust-icon">🥬</span>
          <div>
            <strong>{lang === 'bn' ? 'মন্ডি তাজা' : 'Mandi Fresh'}</strong>
            <span>{lang === 'bn' ? 'প্রতিদিন খামার থেকে' : 'Daily Harvest'}</span>
          </div>
        </div>
        <div className="trust-item">
          <span className="trust-icon">⚡</span>
          <div>
            <strong>{lang === 'bn' ? '১২–২৪h ডেলিভারি' : '12–24h Delivery'}</strong>
            <span>{lang === 'bn' ? 'দ্রুত ডোরস্টেপ' : 'Fast Doorstep'}</span>
          </div>
        </div>
        <div className="trust-item">
          <span className="trust-icon">💯</span>
          <div>
            <strong>{lang === 'bn' ? 'গ্রেড গ্যারান্টি' : 'Grade Guarantee'}</strong>
            <span>{lang === 'bn' ? 'A/B/C মান নিশ্চিত' : 'Quality Assured'}</span>
          </div>
        </div>
        <div className="trust-item">
          <span className="trust-icon">🔒</span>
          <div>
            <strong>{lang === 'bn' ? 'নিরাপদ UPI' : 'Secure UPI'}</strong>
            <span>{lang === 'bn' ? '১০০% বিশ্বস্ত' : 'Safe & Encrypted'}</span>
          </div>
        </div>
      </div>

      <div className="shop-body" id="veg-grid">
        {/* ⏰ Live Shift Hours Badge */}
        <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <ShiftBadge lang={lang} />
          <button
            type="button"
            className="pincode-check-chip"
            onClick={() => setShowPinModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#166534',
              borderRadius: '20px',
              padding: '5px 12px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span>📍 {lang === 'bn' ? 'পিন কোড চেক' : 'Check PIN'}: <strong>{SERVICEABLE_PINCODES.join(', ')}</strong></span>
            <span style={{ fontSize: '0.75rem', textDecoration: 'underline' }}>{lang === 'bn' ? 'পরিবর্তন' : 'Verify'}</span>
          </button>
        </div>

        {/* 🎟️ Promotional Deals & Offers Hero Banner */}
        <DealsBanner lang={lang} />

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
            aria-label={lang === 'bn' ? 'ন্যূনতম অর্ডারের অগ্রগতি' : 'Minimum order progress'}
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
                      onOpenReviews={setReviewProduct}
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
                      onOpenReviews={setReviewProduct}
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
      {showUsualBasketModal && (
        <Suspense fallback={null}>
          <MyUsualBasketModal
            isOpen={showUsualBasketModal}
            onClose={() => setShowUsualBasketModal(false)}
            products={products}
            lang={lang}
            onAddBulk={handleAddBulkStaples}
          />
        </Suspense>
      )}

      {/* 📦 Weekly Family Basket Modal */}
      {showBasketModal && (
        <Suspense fallback={null}>
          <WeeklyBasketModal onClose={() => setShowBasketModal(false)} />
        </Suspense>
      )}

      {/* ⭐ Customer Reviews & Star Ratings Modal */}
      {reviewProduct && (
        <Suspense fallback={null}>
          <ProductReviewsModal
            product={reviewProduct}
            onClose={() => setReviewProduct(null)}
          />
        </Suspense>
      )}

      {/* 📍 Pincode Checker Modal */}
      {showPinModal && (
        <Suspense fallback={null}>
          <PincodeCheckerModal
            isOpen={showPinModal}
            onClose={() => setShowPinModal(false)}
            lang={lang}
          />
        </Suspense>
      )}
    </div>
  )
}
