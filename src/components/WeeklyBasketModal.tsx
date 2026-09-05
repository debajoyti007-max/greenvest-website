import { useStore } from '../context/StoreContext'
import { showToast } from '../lib/toast'

interface WeeklyBasketModalProps {
  onClose: () => void
}

interface BasketItemConfig {
  searchKey: string
  nameEn: string
  nameBn: string
  emoji: string
  grade: 'A' | 'B' | 'C'
  qty: number
  unit: string
}

const WEEKLY_BASKET_ITEMS: BasketItemConfig[] = [
  { searchKey: 'potato', nameEn: 'Potato', nameBn: 'আলু', emoji: '🥔', grade: 'B', qty: 2, unit: 'kg' },
  { searchKey: 'onion', nameEn: 'Onion', nameBn: 'পেঁয়াজ', emoji: '🧅', grade: 'B', qty: 1, unit: 'kg' },
  { searchKey: 'tomato', nameEn: 'Tomato', nameBn: 'টমেটো', emoji: '🍅', grade: 'A', qty: 1, unit: 'kg' },
  { searchKey: 'chili', nameEn: 'Green Chili', nameBn: 'কাঁচা মরিচ', emoji: '🌶️', grade: 'A', qty: 1, unit: 'pack' },
]

export default function WeeklyBasketModal({ onClose }: WeeklyBasketModalProps) {
  const { products, addToCart, lang, priceFor } = useStore()

  // Match items with real catalog products
  const matchedItems = WEEKLY_BASKET_ITEMS.map((config) => {
    const product = products.find(
      (p) =>
        !p.archived &&
        (p.name.toLowerCase().includes(config.searchKey) ||
          p.bnName.includes(config.nameBn) ||
          p.id.toLowerCase().includes(config.searchKey))
    )
    const unitPrice = product ? priceFor(product, config.grade) : 0
    const totalPrice = unitPrice * config.qty
    const isAvailable = product ? product.inStock : false
    return {
      config,
      product,
      unitPrice,
      totalPrice,
      isAvailable,
    }
  })

  const totalBasketAmount = matchedItems.reduce((acc, it) => acc + (it.product ? it.totalPrice : 0), 0)

  const handleAddAll = () => {
    let addedCount = 0
    for (const item of matchedItems) {
      if (item.product && item.isAvailable) {
        addToCart(item.product.id, item.config.grade, item.config.qty)
        addedCount++
      }
    }

    if (addedCount > 0) {
      showToast(
        lang === 'bn'
          ? `🎉 সাপ্তাহিক বাস্কেটের ${addedCount}টি তাজা সবজি কার্টে যোগ করা হয়েছে (₹${totalBasketAmount})!`
          : `🎉 Weekly Family Basket (${addedCount} items) added to cart (₹${totalBasketAmount})!`,
        '🧺'
      )
    } else {
      showToast(
        lang === 'bn' ? '⚠️ দুঃখিত, বাস্কেটের সবজিগুলো বর্তমানে স্টকে নেই।' : '⚠️ Items in basket currently out of stock.',
        '⚠️',
        'error'
      )
    }
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal weekly-basket-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 94vw)',
          borderRadius: '16px',
          background: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
          border: '1.5px solid #86efac',
          padding: '1.5rem',
          boxShadow: '0 20px 40px rgba(22, 101, 52, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.75rem' }}>🧺</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#14532d', fontWeight: 800 }}>
                {lang === 'bn' ? 'সাপ্তাহিক পারিবারিক বাস্কেট' : 'Weekly Family Basket'}
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>
                {lang === 'bn' ? '★ ৪টি নিত্যপ্রয়োজনীয় তাজা সবজি' : '★ 4 Everyday Fresh Essentials'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.4rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '0.88rem', color: '#4b5563', margin: '0.5rem 0 1rem', lineHeight: 1.45 }}>
          {lang === 'bn'
            ? 'রান্নার জন্য প্রতিদিনের দরকারি টাটকা সবজির ১-ক্লিক ফ্যামিলি প্যাক। কোনো খোঁজাখুঁজি ছাড়াই এক ট্যাপে সম্পূর্ণ বাস্কেট কিনুন।'
            : 'Essential fresh vegetables pre-bundled for your weekly home kitchen with fresh grade guarantee.'}
        </p>

        {/* Item Cards List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
          {matchedItems.map(({ config, totalPrice, isAvailable }) => (
            <div
              key={config.searchKey}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0.9rem',
                background: '#ffffff',
                border: '1px solid #dcfce7',
                borderRadius: '10px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{config.emoji}</span>
                <div>
                  <strong style={{ display: 'block', fontSize: '0.92rem', color: '#1f2937' }}>
                    {lang === 'bn' ? `${config.nameBn} (${config.nameEn})` : `${config.nameEn} (${config.nameBn})`}
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    Grade {config.grade} · {config.qty} {config.unit}
                  </span>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <strong style={{ display: 'block', color: '#166534', fontSize: '0.95rem' }}>
                  {totalPrice > 0 ? `₹${totalPrice}` : '—'}
                </strong>
                <span style={{ fontSize: '0.75rem', color: isAvailable ? '#15803d' : '#dc2626', fontWeight: 600 }}>
                  {isAvailable ? (lang === 'bn' ? 'স্টকে আছে ✓' : 'In Stock ✓') : (lang === 'bn' ? 'স্টক নেই' : 'Out of Stock')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            background: '#dcfce7',
            borderRadius: '10px',
            marginBottom: '1rem',
          }}
        >
          <div>
            <span style={{ fontSize: '0.8rem', color: '#14532d', display: 'block' }}>
              {lang === 'bn' ? 'বাস্কেট মোট মূল্য:' : 'Total Basket Price:'}
            </span>
            <strong style={{ fontSize: '1.2rem', color: '#14532d', fontWeight: 800 }}>
              ₹{totalBasketAmount}
            </strong>
          </div>
          <span style={{ fontSize: '0.82rem', color: '#15803d', fontWeight: 700, background: '#ffffff', padding: '4px 10px', borderRadius: '20px' }}>
            {lang === 'bn' ? '⚡ ১২–২৪ ঘণ্টার ডেলিভারি' : '⚡ 12–24h Delivery'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAddAll}
            style={{
              flex: 1,
              padding: '0.75rem',
              fontWeight: 800,
              fontSize: '0.95rem',
              background: '#166534',
              color: '#ffffff',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(22, 101, 52, 0.25)',
            }}
          >
            🚀 {lang === 'bn' ? '১-ক্লিকে সব কার্টে যোগ করুন' : '1-Tap Add All to Cart'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {lang === 'bn' ? 'বন্ধ' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
