import { useMemo, useState } from 'react'
import { useStore } from '../context/StoreContext'
import type { Grade } from '../types'

export default function Shop() {
  const { products, lang, addToCart, priceFor } = useStore()
  const [grade, setGrade] = useState<Grade>('A')
  const [category, setCategory] = useState('All')
  const [added, setAdded] = useState<string | null>(null)

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category))
    return ['All', ...Array.from(set)]
  }, [products])

  const filtered = products.filter((p) => category === 'All' || p.category === category)

  const handleAdd = (productId: string) => {
    addToCart(productId, grade, 1)
    setAdded(productId)
    setTimeout(() => setAdded(null), 900)
  }

  return (
    <div className="page shop-page">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">{lang === 'bn' ? 'তাজা বাজার' : 'Farm-fresh market'}</p>
          <h1 className="brand-hero">GreenVest</h1>
          <p className="lede">
            {lang === 'bn'
              ? 'গ্রেড অনুযায়ী তাজা সবজি কিনুন — সরাসরি সেলার থেকে।'
              : 'Shop live vegetables by grade — straight from the seller.'}
          </p>
          <div className="grade-picker" role="group" aria-label="Grade">
            {(['A', 'B', 'C'] as Grade[]).map((g) => (
              <button
                key={g}
                type="button"
                className={`grade-btn ${grade === g ? 'active' : ''}`}
                onClick={() => setGrade(g)}
              >
                Grade {g}
              </button>
            ))}
          </div>
        </div>
        <div className="hero-visual" aria-hidden>
          <div className="veg-orbit">🍅🥔🧅🥬🥕🥒</div>
        </div>
      </section>

      <div className="toolbar">
        <div className="cat-filters">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${category === c ? 'active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="hint">
          {lang === 'bn' ? 'নির্বাচিত গ্রেড:' : 'Selected grade:'} <strong>{grade}</strong>
        </p>
      </div>

      <div className="product-grid">
        {filtered.map((p) => (
          <article key={p.id} className={`product-tile ${p.inStock ? '' : 'out'}`}>
            <div className="product-emoji">{p.emoji}</div>
            <h2>{lang === 'bn' ? p.bnName : p.name}</h2>
            <p className="muted">
              {lang === 'bn' ? p.name : p.bnName} · {p.unit}
            </p>
            <div className="price-row">
              <span className="price">৳{priceFor(p, grade)}</span>
              <span className={`stock ${p.inStock ? 'in' : 'off'}`}>
                {p.inStock ? (lang === 'bn' ? 'স্টকে আছে' : 'In stock') : lang === 'bn' ? 'স্টক নেই' : 'Out of stock'}
              </span>
            </div>
            <div className="grade-prices">
              <span>A ৳{p.pA}</span>
              <span>B ৳{p.pB}</span>
              <span>C ৳{p.pC}</span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!p.inStock}
              onClick={() => handleAdd(p.id)}
            >
              {added === p.id
                ? lang === 'bn'
                  ? 'যোগ হয়েছে ✓'
                  : 'Added ✓'
                : lang === 'bn'
                  ? 'কার্টে যোগ'
                  : 'Add to cart'}
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}
