import { Link } from 'react-router-dom'
import { useStore } from '../context/StoreContext'

export default function Cart() {
  const {
    cart,
    products,
    lang,
    priceFor,
    updateCartQty,
    removeFromCart,
    cartTotal,
  } = useStore()

  if (cart.length === 0) {
    return (
      <div className="page narrow">
        <h1>{lang === 'bn' ? 'আপনার কার্ট' : 'Your cart'}</h1>
        <p className="empty">{lang === 'bn' ? 'কার্ট খালি।' : 'Your cart is empty.'}</p>
        <Link to="/" className="btn btn-primary">
          {lang === 'bn' ? 'কেনাকাটা করুন' : 'Continue shopping'}
        </Link>
      </div>
    )
  }

  return (
    <div className="page narrow">
      <h1>{lang === 'bn' ? 'আপনার কার্ট' : 'Your cart'}</h1>
      <ul className="cart-list">
        {cart.map((item) => {
          const p = products.find((x) => x.id === item.productId)
          if (!p) return null
          const line = priceFor(p, item.grade) * item.qty
          return (
            <li key={`${item.productId}-${item.grade}`} className="cart-row">
              <span className="cart-emoji">{p.emoji}</span>
              <div className="cart-info">
                <strong>{lang === 'bn' ? p.bnName : p.name}</strong>
                <span>
                  Grade {item.grade} · ৳{priceFor(p, item.grade)}/{p.unit}
                </span>
              </div>
              <div className="qty-controls">
                <button
                  type="button"
                  onClick={() => updateCartQty(item.productId, item.grade, item.qty - 1)}
                >
                  −
                </button>
                <span>{item.qty}</span>
                <button
                  type="button"
                  onClick={() => updateCartQty(item.productId, item.grade, item.qty + 1)}
                >
                  +
                </button>
              </div>
              <div className="cart-line">৳{line}</div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => removeFromCart(item.productId, item.grade)}
              >
                {lang === 'bn' ? 'মুছুন' : 'Remove'}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="cart-summary">
        <div>
          <span>{lang === 'bn' ? 'মোট' : 'Total'}</span>
          <strong>৳{cartTotal}</strong>
        </div>
        <div>
          <span>{lang === 'bn' ? 'অগ্রিম (৫০%)' : 'Advance (50%)'}</span>
          <strong>৳{Math.ceil(cartTotal * 0.5)}</strong>
        </div>
        <Link to="/checkout" className="btn btn-primary">
          {lang === 'bn' ? 'চেকআউটে যান' : 'Proceed to checkout'}
        </Link>
      </div>
    </div>
  )
}
