import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { showToast } from '../../components/Toast'
import CouponGeneratorModal from '../../components/seller/CouponGeneratorModal'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { printPackingList, printRiderManifest } from '../../lib/printOrder'

function dayKey(d: Date) {
  return d.toDateString()
}

export default function SellerHome() {
  const { user } = useAuth()
  const { products, orders, lang, fetchDailyReport, saveDailyReport, safeCloudSync } = useStore()
  const [sheet, setSheet] = useState<string | null>(null)
  const [mandiCost, setMandiCost] = useState<number | ''>('')
  const [showCouponModal, setShowCouponModal] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSafeSync = async () => {
    setIsSyncing(true)
    try {
      await safeCloudSync()
      showToast(
        lang === 'bn'
          ? '✅ ক্লাউড সিঙ্ক সম্পন্ন! তাজা অর্ডার ও স্টক লোড হয়েছে।'
          : '✅ Cloud synced! Latest orders & stock updated.',
        '🔄',
      )
    } catch {
      showToast(lang === 'bn' ? 'সিঙ্ক ব্যর্থ হয়েছে' : 'Sync failed', '⚠️', 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    let active = true
    const todayStr = new Date().toISOString().split('T')[0]
    fetchDailyReport(todayStr).then(report => {
      if (active && report) {
        setMandiCost(report.mandi_cost)
      }
    })
    return () => { active = false }
  }, [fetchDailyReport])

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
  const uniqueCustomers = new Set(
    orders.filter((o) => o.status !== 'cancelled').map((o) => o.userId || o.phone),
  ).size

  const sourcingLines = useMemo(() => {
    const map = new Map<string, number>()
    orders
      .filter((o) => o.status !== 'cancelled' && o.status !== 'delivered')
      .forEach((o) => {
        o.items.forEach((it) => {
          const weightMult = Number(it.weightMultiplier) || 1
          const totalKg = it.qty * weightMult
          const gradeLabel = it.grade ? ` (Grade ${it.grade})` : ''
          const key = `${it.emoji} ${it.name}${gradeLabel}`
          map.set(key, (map.get(key) || 0) + totalKg)
        })
      })
    return Array.from(map.entries()).map(([name, kg]) => `• ${name}: ${kg.toFixed(kg % 1 === 0 ? 0 : 2)} kg`)
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

  const handleSaveReport = async () => {
    const todayStr = new Date().toISOString().split('T')[0]
    const cost = Number(mandiCost) || 0
    const profit = todaySales - cost
    const totalCancelled = todayOrders.filter(o => o.status === 'cancelled').length
    await saveDailyReport({
      report_date: todayStr,
      total_orders: todayOrders.length,
      total_revenue: todaySales,
      total_cancelled: totalCancelled,
      mandi_cost: cost,
      delivery_cost: 0,
      profit
    })
    showToast(lang === 'bn' ? 'রিপোর্ট সেভ হয়েছে!' : 'Report saved!', '📈')
  }

  const copySheet = async () => {
    if (!sheet) return
    try {
      await navigator.clipboard.writeText(sheet)
    } catch {
      /* ignore */
    }
  }

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="page" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🌿 {lang === 'bn' ? 'সেলার অপারেশনস হাব' : 'Seller Operations Hub'}
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            {lang === 'bn'
              ? 'দৈনিক কর্মপ্রবাহ: সকালের স্টক → মন্ডি শিট → পেমেন্ট যাচাই → ডেলিভারি ও খাতা বুক।'
              : 'Daily workflow: morning stock → mandi sheet → verify payment → deliver & khata.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleSafeSync}
            disabled={isSyncing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: isSyncing ? '#f8fafc' : 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
              border: '1px solid #86efac',
              padding: '6px 12px',
              borderRadius: '10px',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: '#166534',
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 3px rgba(22, 101, 52, 0.08)',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{ display: 'inline-block', transform: isSyncing ? 'rotate(360deg)' : 'none', transition: 'transform 0.6s linear' }}>
              🔄
            </span>
            {isSyncing ? (lang === 'bn' ? 'সিঙ্ক হচ্ছে...' : 'Syncing...') : (lang === 'bn' ? 'ক্লাউড সিঙ্ক' : 'Cloud Sync')}
          </button>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              padding: '6px 14px',
              borderRadius: '10px',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: '#334155',
              textDecoration: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            🏪 {lang === 'bn' ? 'দোকানের সম্মুখভাগ' : 'View Storefront'}
          </Link>
        </div>
      </div>

      {/* Action required alerts */}
      {pending > 0 && (
        <div
          style={{
            background: '#fffbeb',
            border: '1.5px solid #fde68a',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '1.2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <div>
              <strong style={{ color: '#92400e', fontSize: '0.95rem', display: 'block' }}>
                {lang === 'bn' ? 'আজকের কাজ বাকি:' : 'Action Required:'}
              </strong>
              <span style={{ color: '#b45309', fontSize: '0.85rem' }}>
                {pending} {lang === 'bn' ? 'টি অর্ডারের পেমেন্ট যাচাই বাকি আছে।' : 'order(s) waiting for payment verification.'}
              </span>
            </div>
          </div>
          <Link
            to="/seller/orders"
            style={{
              background: '#d97706',
              color: '#ffffff',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            {lang === 'bn' ? 'যাচাই করুন →' : 'Verify Now →'}
          </Link>
        </div>
      )}

      {outStock.length > 0 && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '10px 16px',
            marginBottom: '1.2rem',
            fontSize: '0.85rem',
            color: '#991b1b',
          }}
        >
          <strong>🚫 {lang === 'bn' ? 'স্টক শেষ:' : 'Out of Stock:'} </strong>
          <span>{outStock.map((p) => (lang === 'bn' ? p.bnName : p.name)).join(', ')}</span>
        </div>
      )}

      {/* Executive KPI Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
            border: '1px solid #bbf7d0',
            borderRadius: '14px',
            padding: '1.2rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            💰 {lang === 'bn' ? 'আজকের মোট বিক্রি' : "Today's Sales"}
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#14532d', margin: '4px 0' }}>
            ₹{todaySales}
          </div>
          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
            {todayOrders.length} {lang === 'bn' ? 'টি অর্ডার' : 'orders placed'}
          </span>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '1.2rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            📅 {lang === 'bn' ? 'গতকালের বিক্রি' : "Yesterday's Sales"}
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#334155', margin: '4px 0' }}>
            ₹{yesterdaySales}
          </div>
          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
            {yesterdayOrders.length} {lang === 'bn' ? 'টি অর্ডার' : 'orders'}
          </span>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)',
            border: '1px solid #bfdbfe',
            borderRadius: '14px',
            padding: '1.2rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🛵 {lang === 'bn' ? 'চলমান ডেলিভারি' : 'Active Deliveries'}
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#1e3a8a', margin: '4px 0' }}>
            {active}
          </div>
          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
            {lang === 'bn' ? 'প্যাকিং ও ডেলিভারি চলমান' : 'In packing & transit'}
          </span>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)',
            border: '1px solid #fed7aa',
            borderRadius: '14px',
            padding: '1.2rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ⏳ {lang === 'bn' ? 'পেমেন্ট যাচাই বাকি' : 'Payment Pending'}
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#9a3412', margin: '4px 0' }}>
            {pending}
          </div>
          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
            {lang === 'bn' ? 'যাচাইকৃত অগ্রিম: ₹' : 'Verified: ₹'}{revenue}
          </span>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #faf5ff 100%)',
            border: '1px solid #e9d5ff',
            borderRadius: '14px',
            padding: '1.2rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🥬 {lang === 'bn' ? 'সক্রিয় ক্যাটালগ' : 'Live Inventory'}
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#581c87', margin: '4px 0' }}>
            {inStock}
          </div>
          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
            {uniqueCustomers} {lang === 'bn' ? 'জন কাস্টমার' : 'unique buyers'}
          </span>
        </div>
      </div>

      {/* Daily Profit & Mandi Cost Ledger */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          padding: '1.2rem',
          marginBottom: '1.8rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>📊</span>
            <div>
              <strong style={{ fontSize: '1rem', color: '#0f172a', display: 'block' }}>
                {lang === 'bn' ? 'আজকের মন্ডি লাভ-ক্ষতি হিসাব' : "Today's Mandi Profit Calculator"}
              </strong>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {lang === 'bn' ? 'মন্ডি ক্রয়ের খরচ লিখুন এবং দৈনিক মার্জিন সংরক্ষণ করুন।' : 'Record wholesale procurement cost and track profit margins.'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '4px 10px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginRight: '4px' }}>₹</span>
              <input
                type="number"
                placeholder="0"
                value={mandiCost}
                onChange={(e) => setMandiCost(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100px', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.95rem', fontWeight: 700 }}
              />
            </div>

            <button
              type="button"
              onClick={handleSaveReport}
              style={{
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              💾 {lang === 'bn' ? 'রিপোর্ট সেভ করুন' : 'Save Report'}
            </button>

            {typeof mandiCost === 'number' && mandiCost >= 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', padding: '6px 12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#166534' }}>
                  {lang === 'bn' ? 'নিট লাভ: ₹' : 'Net Profit: ₹'}{todaySales - mandiCost}
                </span>
                {todaySales > 0 && (
                  <span style={{ fontSize: '0.75rem', background: '#22c55e', color: '#ffffff', padding: '2px 6px', borderRadius: '12px', fontWeight: 800 }}>
                    {(((todaySales - mandiCost) / todaySales) * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Categorized 4-Suite Operations Control Center */}
      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem' }}>
        ⚙️ {lang === 'bn' ? 'ম্যানেজমেন্ট কন্ট্রোল সেন্টার' : 'Management Control Suites'}
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.2rem',
          marginBottom: '2rem',
        }}
      >
        {/* Suite 1: Orders & Fulfillment */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '1.3rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.3rem' }}>📦</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>
              {lang === 'bn' ? 'অর্ডার ও ডেলিভারি' : 'Orders & Dispatch'}
            </h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 1rem', flex: 1 }}>
            {lang === 'bn'
              ? 'নতুন অর্ডার যাচাই, স্ট্যাটাস পরিবর্তন এবং ডেলিভারি শিট প্রিন্ট করুন।'
              : 'Process customer orders, verify payments, and generate delivery manifests.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link
              to="/seller/orders"
              style={{
                background: '#16a34a',
                color: '#ffffff',
                textAlign: 'center',
                padding: '9px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              📋 {lang === 'bn' ? 'সমস্ত অর্ডার দেখুন' : 'Manage Orders'}
            </Link>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                onClick={() => printPackingList(orders, lang)}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  padding: '7px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                🖨️ {lang === 'bn' ? 'প্যাকিং লিস্ট' : 'Packing List'}
              </button>
              <button
                type="button"
                onClick={() => printRiderManifest(orders, lang)}
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  padding: '7px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#1e40af',
                  cursor: 'pointer',
                }}
              >
                🛵 {lang === 'bn' ? 'রাইডার শিট' : 'Rider Sheet'}
              </button>
            </div>
          </div>
        </div>

        {/* Suite 2: Produce & Mandi Operations */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '1.3rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🥬</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>
              {lang === 'bn' ? 'প্রোডাক্ট ও মন্ডি রেট' : 'Produce & Mandi Rates'}
            </h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 1rem', flex: 1 }}>
            {lang === 'bn'
              ? 'দৈনিক বাজার দর, গ্রেড A/B/C টগল এবং মন্ডি সোর্সিং তালিকা তৈরি।'
              : 'Update daily vegetable rates, MRP markup, Grade A/B/C options, and mandi sheets.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link
              to="/seller/products"
              style={{
                background: '#0f172a',
                color: '#ffffff',
                textAlign: 'center',
                padding: '9px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              🏷️ {lang === 'bn' ? 'প্রোডাক্ট ও রেট পরিবর্তন' : 'Edit Products & Rates'}
            </Link>
            <button
              type="button"
              onClick={generateSheet}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                padding: '7px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              📝 {lang === 'bn' ? 'সকালের মন্ডি সোর্সিং শিট' : 'Generate Mandi Sourcing Sheet'}
            </button>
          </div>
        </div>

        {/* Suite 3: Digital Khata & Customer Tiers */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '1.3rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.3rem' }}>📒</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>
              {lang === 'bn' ? 'খাতা বুক ও কাস্টমার' : 'Khata Ledger & Customers'}
            </h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 1rem', flex: 1 }}>
            {lang === 'bn'
              ? 'বাকি খাতা হিসাব, ১-ট্যাপ ইন-অ্যাপ পেমেন্ট রিমাইন্ডার এবং VIP/পাইকারি টায়ার।'
              : 'Track customer dues, send 1-tap in-app payment reminders, and assign VIP tiers.'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Link
              to="/seller/khata"
              style={{
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                color: '#991b1b',
                textAlign: 'center',
                padding: '9px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              📒 {lang === 'bn' ? 'খাতা বুক' : 'Khata Book'}
            </Link>
            <Link
              to="/seller/customers"
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#334155',
                textAlign: 'center',
                padding: '9px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              👥 {lang === 'bn' ? 'কাস্টমার টায়ার' : 'Customers'}
            </Link>
          </div>
        </div>

        {/* Suite 4: Deals & Marketing */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '1.3rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🎟️</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>
              {lang === 'bn' ? 'অফার ব্যানার ও কুপন' : 'Deals & Coupons'}
            </h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 1rem', flex: 1 }}>
            {lang === 'bn'
              ? 'হোমপেজ অফার ব্যানার তৈরি (অটো-এক্সপায়ারি সহ) ও ডিসকাউন্ট কুপন।'
              : 'Create promotional home banners with auto-expiry timers and custom promo coupons.'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Link
              to="/seller/deals"
              style={{
                background: '#f0fdf4',
                border: '1px solid #86efac',
                color: '#166534',
                textAlign: 'center',
                padding: '9px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              🎟️ {lang === 'bn' ? 'অফার ব্যানার' : 'Deals Banner'}
            </Link>
            <button
              type="button"
              onClick={() => setShowCouponModal(true)}
              style={{
                background: '#fef9c3',
                border: '1px solid #fde047',
                color: '#854d0e',
                padding: '9px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              ⚡ {lang === 'bn' ? 'কুপন তৈরি' : 'Coupons'}
            </button>
          </div>
        </div>
      </div>

      {/* Mandi Sourcing Sheet Drawer */}
      {sheet && (
        <div
          style={{
            background: '#ffffff',
            border: '2px solid #16a34a',
            borderRadius: '16px',
            padding: '1.5rem',
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            marginBottom: '2rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#166534' }}>
              📝 {lang === 'bn' ? 'আজকের মন্ডি সোর্সিং তালিকা' : 'Mandi Procurement Sourcing Sheet'}
            </h3>
            <button
              type="button"
              onClick={() => setSheet(null)}
              style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
            >
              ✕
            </button>
          </div>
          <pre
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '1rem',
              fontSize: '0.9rem',
              lineHeight: 1.6,
              color: '#1e293b',
              whiteSpace: 'pre-wrap',
            }}
          >
            {sheet}
          </pre>
          <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={() => void copySheet()}
              style={{
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              📋 {lang === 'bn' ? 'কপি করুন' : 'Copy Sheet'}
            </button>
            <button
              type="button"
              onClick={() => setSheet(null)}
              style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                color: '#475569',
              }}
            >
              {lang === 'bn' ? 'বন্ধ' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {showCouponModal && <CouponGeneratorModal onClose={() => setShowCouponModal(false)} />}
    </div>
  )
}
