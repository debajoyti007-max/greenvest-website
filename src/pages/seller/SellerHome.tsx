import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'

export default function SellerHome() {
  const { user } = useAuth()
  const { products, orders, lang } = useStore()

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const revenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + (o.utrVerified ? o.advanceAmount : 0), 0)
  const pending = orders.filter((o) => !o.utrVerified && o.status !== 'cancelled').length
  const inStock = products.filter((p) => p.inStock).length

  return (
    <div className="page">
      <h1>{lang === 'bn' ? 'সেলার ড্যাশবোর্ড' : 'Seller dashboard'}</h1>
      <p className="lede">
        {lang === 'bn' ? 'লাইভ স্টক, অর্ডার ও আয় দেখুন।' : 'Manage live stock, orders, and revenue.'}
      </p>

      <div className="dash-grid">
        <div className="stat">
          <span>{lang === 'bn' ? 'যাচাইকৃত অগ্রিম আয়' : 'Verified advance revenue'}</span>
          <strong>৳{revenue}</strong>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'মোট অর্ডার' : 'Total orders'}</span>
          <strong>{orders.length}</strong>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'UTR অপেক্ষমাণ' : 'UTR pending'}</span>
          <strong>{pending}</strong>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'স্টকে আছে' : 'In stock items'}</span>
          <strong>
            {inStock}/{products.length}
          </strong>
        </div>
      </div>

      <div className="seller-links">
        <Link to="/seller/products" className="btn btn-primary">
          {lang === 'bn' ? 'সবজি তালিকা' : 'Manage products'}
        </Link>
        <Link to="/seller/orders" className="btn btn-secondary">
          {lang === 'bn' ? 'অর্ডার ম্যানেজ' : 'Manage orders'}
        </Link>
      </div>
    </div>
  )
}
