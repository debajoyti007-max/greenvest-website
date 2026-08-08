import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'

export default function SellerHome() {
  const { user } = useAuth()
  const { products, orders, lang, morningReset } = useStore()
  const [sheet, setSheet] = useState<string | null>(null)

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const revenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + (o.utrVerified ? o.advanceAmount : 0), 0)
  const pending = orders.filter((o) => !o.utrVerified && o.status !== 'cancelled').length
  const inStock = products.filter((p) => p.inStock).length
  const outStock = products.filter((p) => !p.inStock)

  const sourcingLines = useMemo(() => {
    const map = new Map<string, number>()
    orders
      .filter((o) => o.status !== 'cancelled' && o.status !== 'delivered')
      .forEach((o) => {
        o.items.forEach((it) => {
          const key = `${it.emoji} ${it.name}`
          map.set(key, (map.get(key) || 0) + it.qty)
        })
      })
    return Array.from(map.entries()).map(([name, qty]) => `• ${name}: ${qty}`)
  }, [orders])

  const generateSheet = () => {
    if (sourcingLines.length === 0) {
      setSheet(lang === 'bn' ? 'সক্রিয় অর্ডারে কোনো আইটেম নেই।' : 'No items in active orders.')
      return
    }
    setSheet(sourcingLines.join('\n'))
  }

  const onMorningReset = () => {
    if (confirm(lang === 'bn' ? 'সব সবজি স্টকে আনবেন?' : 'Mark ALL produce IN STOCK for the new morning?')) {
      void morningReset().then(() => setSheet(null))
    }
  }

  return (
    <div className="page">
      <h1>{lang === 'bn' ? 'সেলার ড্যাশবোর্ড' : 'Seller dashboard'}</h1>
      <p className="lede">
        {lang === 'bn' ? 'লাইভ স্টক, অর্ডার ও আয় দেখুন।' : 'Manage live stock, orders, and revenue.'}
      </p>

      {outStock.length > 0 && (
        <div className="alert warn">
          <strong>{lang === 'bn' ? 'লো স্টক অ্যালার্ট' : 'Low stock alert'}</strong>
          <span>
            {outStock.length} {lang === 'bn' ? 'আইটেম স্টক আউট:' : 'item(s) out of stock:'}{' '}
            {outStock.map((p) => (lang === 'bn' ? p.bnName : p.name)).join(', ')}
          </span>
        </div>
      )}

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
        <button type="button" className="btn btn-secondary" onClick={generateSheet}>
          {lang === 'bn' ? 'মন্ডি সোর্সিং শিট' : 'Mandi sourcing sheet'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onMorningReset}>
          {lang === 'bn' ? 'সকালের রিসেট' : 'Morning stock reset'}
        </button>
      </div>

      {sheet && (
        <div className="sheet-box">
          <h2>{lang === 'bn' ? 'সকালের মন্ডি তালিকা' : 'Morning mandi procurement'}</h2>
          <pre>{sheet}</pre>
          <button type="button" className="btn btn-ghost" onClick={() => setSheet(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  )
}
