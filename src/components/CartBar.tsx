import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'

export default function CartBar() {
  const { cartCount, cartTotal, lang } = useStore()
  if (cartCount === 0) return null
  return (
    <div className="cart-bar">
      <span className="cart-bar-info">
        🛒 <strong>{cartCount}</strong> {lang === 'bn' ? 'আইটেম' : cartCount === 1 ? 'item' : 'items'}
        <span className="cart-bar-sep">·</span>
        <strong>৳{cartTotal}</strong>
      </span>
      <Link to="/cart" className="cart-bar-btn">
        {lang === 'bn' ? 'কার্ট দেখুন →' : 'View Cart →'}
      </Link>
    </div>
  )
}
