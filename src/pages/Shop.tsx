import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import { DELIVERY_WINDOW, DELIVERY_WINDOW_BN, MIN_ORDER_AMOUNT } from '../lib/business'
import { catLabel, t } from '../lib/i18n'
import { HERO_IMAGE, resolveProductImage } from '../lib/productImages'
import type { Grade, Lang, Product } from '../types'

function ProductCard({
  p,
  lang,
  added,
  onPick,
}: {
  p: Product
  lang: Lang
  added: string | null
  onPick: (p: Product) => void
}) {
  const img = resolveProductImage(p.id, p.imageUrl)
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
            const fallback = resolveProductImage(p.id)
            if (!el.src.endsWith(fallback)) el.src = fallback
          }}
        />
        {!p.inStock && <span className="stock-badge">{t(lang, 'outOfStock')}</span>}
      </div>
      <div className="product-body">
        <h2>{lang === 'bn' ? p.bnName : p.name}</h2>
        <p className="muted">
          {lang === 'bn' ? p.name : p.bnName} · {p.unit}
        </p>
        <div className="price-row">
          <span className="price">৳{p.pB}</span>
          <span className="grade-prices">
            <span>A ৳{p.pA}</span>
            <span>B ৳{p.pB}</span>
            <span>C ৳{p.pC}</span>
          </span>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!p.inStock}
          onClick={() => onPick(p)}
        >
          {added === p.id ? t(lang, 'added') : t(lang, 'chooseGrade')}
        </button>
      </div>
    </article>
  )
}

export default function Shop() {
  const { products, lang, addToCart, priceFor, loading } = useStore()
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Product | null>(null)
  const [grade, setGrade] = useState<Grade>('B')
  const [added, setAdded] = useState<string | null>(null)

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

  const openPick = (p: Product) => {
    if (!p.inStock) return
    setPicked(p)
    setGrade('B')
  }

  const confirmAdd = () => {
    if (!picked) return
    addToCart(picked.id, grade, 1)
    setAdded(picked.id)
    setPicked(null)
    setTimeout(() => setAdded(null), 900)
  }

  const scrollToGrid = () => {
    document.getElementById('veg-grid')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="page shop-page">
      <section className="hero-full" style={{ backgroundImage: `url(${HERO_IMAGE})` }}>
        <div className="hero-full-shade" />
        <div className="hero-full-copy">
          <p className="hero-kicker">{t(lang, 'farmToDoor')}</p>
          <h1 className="brand-hero light">GreenVest</h1>
          <p className="hero-sub">
            {lang === 'bn'
              ? `গ্রেড A/B/C · মিনিমাম ৳${MIN_ORDER_AMOUNT} · ডেলিভারি ${DELIVERY_WINDOW_BN}`
              : `Grade A/B/C · Min ₹${MIN_ORDER_AMOUNT} · Delivery ${DELIVERY_WINDOW}`}
          </p>
          <button type="button" className="btn btn-primary hero-cta" onClick={scrollToGrid}>
            {t(lang, 'shopVeggies')}
          </button>
        </div>
      </section>

      <div className="shop-body" id="veg-grid">
        <p className="friendly-tip">{t(lang, 'tipMin')}</p>

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
          <p className="empty">{t(lang, 'loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="empty">
            {lang === 'bn' ? 'কোনো সবজি পাওয়া যায়নি।' : 'No vegetables match your search.'}
          </p>
        ) : (
          <>
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
                    <ProductCard key={p.id} p={p} lang={lang} added={added} onPick={openPick} />
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
                    <ProductCard key={p.id} p={p} lang={lang} added={added} onPick={openPick} />
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
              <img src={resolveProductImage(picked.id, picked.imageUrl)} alt={picked.name} />
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
                  {t(lang, 'grade')} {g} · ৳{priceFor(picked, g)}
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
