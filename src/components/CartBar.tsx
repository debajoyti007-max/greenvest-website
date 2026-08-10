import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import { MIN_ORDER_AMOUNT } from '../lib/business'

export default function CartBar() {
  const { cartCount, cartTotal, lang } = useStore()
  if (cartCount === 0) return null

  const shortfall = Math.max(0, MIN_ORDER_AMOUNT - cartTotal)
  const meetsMin = cartTotal >= MIN_ORDER_AMOUNT

  return (
    <div className="cart-bar floating-sticky-cartbar">
      <div className="cart-bar-info">
        <span className="cart-bar-icon">🛒</span>
        <div className="cart-bar-details">
          <div className="cart-bar-title">
            <strong>{cartCount}</strong> {lang === 'bn' ? 'টি আইটেম' : cartCount === 1 ? 'item' : 'items'} · <strong>₹{cartTotal}</strong>
          </div>
          {!meetsMin && (
            <div className="cart-bar-hint">
              {lang === 'bn' ? `আরও ₹${shortfall} যোগ করুন` : `Add ₹${shortfall} more for min order`}
            </div>
          )}
        </div>
      </div>
      <Link to="/cart" className="cart-bar-btn">
        {lang === 'bn' ? 'চেকআউট করুন ➔' : 'View Cart & Checkout ➔'}
      </Link>
    </div>
  )
}
