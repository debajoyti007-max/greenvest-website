import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { showToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { LOW_STOCK_QTY } from '../../lib/business'
import { printPackingList } from '../../lib/printOrder'

function dayKey(d: Date) {
  return d.toDateString()
}

export default function SellerHome() {
  const { user } = useAuth()
  const { products, orders, lang, morningReset } = useStore()
  const [sheet, setSheet] = useState<string | null>(null)

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const todayKey = dayKey(new Date())
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yesterdayKey = dayKey(y)

  const todayOrders = orders.filter((o) => dayKey(new Date(o.createdAt)) === todayKey)
  const yesterdayOrders = orders.filter((o) => dayKey(new Date(o.createdAt)) === yesterdayKey)

  const todaySales = todayOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + o.total, 0)
  const yesterdaySales = yesterdayOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + o.total, 0)

  const revenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + (o.utrVerified ? o.advanceAmount : 0), 0)
  const pending = orders.filter((o) => !o.utrVerified && o.status !== 'cancelled').length
  const active = orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length
  const inStock = products.filter((p) => p.inStock && !p.archived).length
  const outStock = products.filter((p) => !p.archived && !p.inStock)
  const lowStock = products.filter(
    (p) =>
      !p.archived &&
      p.inStock &&
      p.stockQty != null &&
      p.stockQty > 0 &&
      p.stockQty <= LOW_STOCK_QTY,
  )
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
            {pending} {lang === 'bn' ? 'UTR যাচাই বাকি।' : 'UTR(s) waiting.'}{' '}
            <Link to="/seller/orders">{lang === 'bn' ? 'দেখুন →' : 'Open →'}</Link>
          </span>
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="alert warn low-stock-alert">
          <strong>{lang === 'bn' ? 'লো স্টক' : 'Low stock'}</strong>
          <span>
            {lowStock
              .map(
                (p) =>
                  `${lang === 'bn' ? p.bnName : p.name} (${p.stockQty} ${p.unit})`,
              )
              .join(', ')}
          </span>
        </div>
      )}

      {outStock.length > 0 && (
        <div className="alert warn">
          <strong>{lang === 'bn' ? 'স্টক আউট' : 'Out of stock'}</strong>
          <span>{outStock.map((p) => (lang === 'bn' ? p.bnName : p.name)).join(', ')}</span>
        </div>
      )}

      <div className="dash-grid">
        <div className="stat">
          <span>{lang === 'bn' ? 'আজকের বিক্রি' : "Today's sales"}</span>
          <strong>₹{todaySales}</strong>
          <em className="muted">
            {todayOrders.length} {lang === 'bn' ? 'অর্ডার' : 'orders'}
          </em>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'গতকালের বিক্রি' : "Yesterday's sales"}</span>
          <strong>₹{yesterdaySales}</strong>
          <em className="muted">
            {yesterdayOrders.length} {lang === 'bn' ? 'অর্ডার' : 'orders'}
          </em>
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
          <strong>₹{revenue}</strong>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'স্টকে / কাস্টমার' : 'In stock / customers'}</span>
          <strong>
            {inStock} · {uniqueCustomers}
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
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => printPackingList(orders, lang)}
        >
          {lang === 'bn' ? 'প্যাকিং লিস্ট (সকাল/সন্ধ্যা)' : 'Packing list (AM/PM)'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            onMorningReset()
            showToast(
              lang === 'bn'
                ? '🌅 সকালের স্টক রিসেট সম্পন্ন হয়েছে!'
                : '🌅 6 AM Morning Stock Reset Complete!',
              '🥬'
            )
          }}
          style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#166534', fontWeight: 700 }}
        >
          {lang === 'bn' ? '🌅 6 AM সকালের স্টক রিসেট' : '🌅 6 AM Morning Stock Reset'}
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
