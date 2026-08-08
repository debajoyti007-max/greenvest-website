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

  const today = new Date().toDateString()
  const todayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === today)
  const revenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + (o.utrVerified ? o.advanceAmount : 0), 0)
  const pending = orders.filter((o) => !o.utrVerified && o.status !== 'cancelled').length
  const active = orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length
  const inStock = products.filter((p) => p.inStock).length
  const outStock = products.filter((p) => !p.inStock)
  const uniqueCustomers = new Set(
    orders.filter((o) => o.status !== 'cancelled').map((o) => o.userId || o.phone),
  ).size

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
    const header =
      lang === 'bn'
        ? `মন্ডি সোর্সিং — ${new Date().toLocaleDateString('bn-IN')}\n`
        : `Mandi sourcing — ${new Date().toLocaleDateString()}\n`
    setSheet(header + sourcingLines.join('\n'))
  }

  const copySheet = async () => {
    if (!sheet) return
    try {
      await navigator.clipboard.writeText(sheet)
    } catch {
      /* ignore */
    }
  }

  const onMorningReset = () => {
    if (
      confirm(lang === 'bn' ? 'সব আইটেম স্টকে আনবেন?' : 'Mark ALL items IN STOCK for the new day?')
    ) {
      void morningReset().then(() => setSheet(null))
    }
  }

  return (
    <div className="page">
      <h1>{lang === 'bn' ? 'সেলার ড্যাশবোর্ড' : 'Seller dashboard'}</h1>
      <p className="lede">
        {lang === 'bn'
          ? 'প্রতিদিন: সকালের স্টক → মন্ডি শিট → UTR যাচাই → ডেলিভারি।'
          : 'Daily flow: morning stock → mandi sheet → verify UTR → deliver.'}
      </p>

      {pending > 0 && (
        <div className="alert warn">
          <strong>{lang === 'bn' ? 'আজকের কাজ' : 'Action needed'}</strong>
          <span>
            {pending}{' '}
            {lang === 'bn' ? 'UTR যাচাই বাকি।' : 'UTR(s) waiting for verification.'}{' '}
            <Link to="/seller/orders">{lang === 'bn' ? 'দেখুন →' : 'Open →'}</Link>
          </span>
        </div>
      )}

      {outStock.length > 0 && (
        <div className="alert warn">
          <strong>{lang === 'bn' ? 'স্টক আউট' : 'Out of stock'}</strong>
          <span>
            {outStock.map((p) => (lang === 'bn' ? p.bnName : p.name)).join(', ')}
          </span>
        </div>
      )}

      <div className="dash-grid">
        <div className="stat">
          <span>{lang === 'bn' ? 'আজকের অর্ডার' : "Today's orders"}</span>
          <strong>{todayOrders.length}</strong>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'চলমান ডেলিভারি' : 'Active deliveries'}</span>
          <strong>{active}</strong>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'UTR বাকি' : 'UTR pending'}</span>
          <strong>{pending}</strong>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'যাচাইকৃত অগ্রিম' : 'Verified advance'}</span>
          <strong>৳{revenue}</strong>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'কাস্টমার' : 'Customers'}</span>
          <strong>{uniqueCustomers}</strong>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'স্টকে' : 'In stock'}</span>
          <strong>
            {inStock}/{products.length}
          </strong>
        </div>
      </div>

      <div className="seller-links">
        <Link to="/seller/orders" className="btn btn-primary">
          {lang === 'bn' ? 'অর্ডার' : 'Orders'}
        </Link>
        <Link to="/seller/products" className="btn btn-secondary">
          {lang === 'bn' ? 'প্রোডাক্ট / দাম' : 'Products & prices'}
        </Link>
        <Link to="/seller/customers" className="btn btn-secondary">
          {lang === 'bn' ? 'কাস্টমার' : 'Customers'}
        </Link>
        <button type="button" className="btn btn-secondary" onClick={generateSheet}>
          {lang === 'bn' ? 'মন্ডি শিট' : 'Mandi sheet'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onMorningReset}>
          {lang === 'bn' ? 'সকালের স্টক রিসেট' : 'Morning stock reset'}
        </button>
      </div>

      {sheet && (
        <div className="sheet-box">
          <h2>{lang === 'bn' ? 'মন্ডি সোর্সিং তালিকা' : 'Mandi procurement list'}</h2>
          <pre>{sheet}</pre>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => void copySheet()}>
              {lang === 'bn' ? 'কপি' : 'Copy'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSheet(null)}>
              {lang === 'bn' ? 'বন্ধ' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
