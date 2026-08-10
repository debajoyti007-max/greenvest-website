import { useStore } from '../context/StoreContext'
import { showToast } from './Toast'

interface WeeklyBasketModalProps {
  onClose: () => void
}

const WEEKLY_BASKET_ITEMS = [
  { id: 'p-potato', nameEn: 'Potato (আলু)', grade: 'B' as const, qty: 2 },
  { id: 'p-onion', nameEn: 'Onion (পিঁয়াজ)', grade: 'B' as const, qty: 1 },
  { id: 'p-tomato', nameEn: 'Tomato (টমেটো)', grade: 'A' as const, qty: 1 },
  { id: 'p-chili', nameEn: 'Green Chili (কাঁচা লঙ্কা)', grade: 'A' as const, qty: 1 },
]

export default function WeeklyBasketModal({ onClose }: WeeklyBasketModalProps) {
  const { products, addToCart, lang } = useStore()

  const handleAddAll = () => {
    let addedCount = 0
    for (const item of WEEKLY_BASKET_ITEMS) {
      const p = products.find((x) => x.id.includes(item.id.replace('p-', '')) || x.name.toLowerCase().includes(item.id.replace('p-', '')))
      if (p && p.inStock) {
        addToCart(p.id, item.grade, item.qty)
        addedCount++
      }
    }

    showToast(
      lang === 'bn'
        ? '🎉 সাপ্তাহিক বাস্কেটের সবজি কার্টে যোগ করা হয়েছে!'
        : '🎉 Weekly Family Basket added to cart!',
      '🧺'
    )
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal weekly-basket-modal" onClick={(e) => e.stopPropagation()}>
        <h2>🧺 {lang === 'bn' ? 'সাপ্তাহিক পারিবারিক সবজি বাস্কেট' : 'Weekly Family Basket'}</h2>
        <p className="muted">
          {lang === 'bn'
            ? 'প্রতিদিনের রান্নার জন্য প্রয়োজনীয় তাজা সবজির ১-ক্লিক প্যাক'
            : 'Essential fresh vegetables pre-bundled for your kitchen'}
        </p>

        <div className="basket-items-list">
          {WEEKLY_BASKET_ITEMS.map((item) => (
            <div key={item.id} className="basket-item-row">
              <span className="item-icon">🥬</span>
              <span className="item-name">{item.nameEn}</span>
              <span className="item-qty">Grade {item.grade} × {item.qty}</span>
            </div>
          ))}
        </div>

        <div className="form-actions" style={{ marginTop: '1.25rem' }}>
          <button type="button" className="btn btn-primary" onClick={handleAddAll}>
            🚀 {lang === 'bn' ? '১-ক্লিকে সব কার্টে যোগ করুন' : '1-Tap Add All to Cart'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
