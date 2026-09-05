import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { useStore } from '../../context/useStore'
import { isSuperAdmin } from '../../lib/business'
import { showToast } from '../../lib/toast'
import CouponGeneratorModal from '../../components/seller/CouponGeneratorModal'
import type { CustomerTier } from '../../types'

type CustomerRow = {
  key: string
  userId?: string
  name: string
  email: string
  phone: string
  orders: number
  spent: number
  lastOrderAt: string
  lastAddress: string
  role: string
  tier?: CustomerTier
  khataApproved?: boolean
  khataCreditLimit?: number
  isBlocked?: boolean
  isSuperAdmin?: boolean
}

export default function SellerCustomers() {
  const { user, users, adminResetUserPin, toggleBlockUser, refreshUsers, setUserTier, setUserKhataApproval } = useAuth()
  const { orders, lang, sendNotification, createCoupon, refresh } = useStore()

  useEffect(() => {
    void refreshUsers()
    void refresh()
  }, [refreshUsers, refresh])

  const [resetModalUser, setResetModalUser] = useState<{ id: string; name: string; phone: string } | null>(null)
  const [newPin, setNewPin] = useState('1234')

  const [selectedCustomerKeys, setSelectedCustomerKeys] = useState<Set<string>>(new Set())
  const [bulkActionBusy, setBulkActionBusy] = useState(false)

  const [notifModalTarget, setNotifModalTarget] = useState<{ id: string | 'all'; name: string } | null>(null)
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMessage, setNotifMessage] = useState('')
  const [sendingNotif, setSendingNotif] = useState(false)

  const now = new Date()
  const [filterMonth, setFilterMonth] = useState(now.getMonth()) // 0-indexed
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [spendMode, setSpendMode] = useState<'all' | 'month'>('all')

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const MONTHS_BN = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর']

  function loyaltyTier(spent: number): { label: string; color: string; emoji: string; minSpend: number } {
    if (spent >= 10000) return { label: lang === 'bn' ? 'প্লাটিনাম' : 'Platinum', color: '#7c3aed', emoji: '💎', minSpend: 10000 }
    if (spent >= 5000) return { label: lang === 'bn' ? 'গোল্ড' : 'Gold', color: '#d97706', emoji: '🥇', minSpend: 5000 }
    if (spent >= 2000) return { label: lang === 'bn' ? 'সিলভার' : 'Silver', color: '#6b7280', emoji: '🥈', minSpend: 2000 }
    if (spent >= 500) return { label: lang === 'bn' ? 'ব্রোঞ্জ' : 'Bronze', color: '#92400e', emoji: '🥉', minSpend: 500 }
    return { label: '', color: '', emoji: '', minSpend: 0 }
  }

  const [couponModal, setCouponModal] = useState<{ name: string; phone: string; userId?: string; spent: number } | null>(null)
  const [couponDiscount, setCouponDiscount] = useState(50)
  const [couponMinOrder, setCouponMinOrder] = useState(500)
  const [couponType, setCouponType] = useState<'flat' | 'percent'>('flat')
  const [couponSending, setCouponSending] = useState(false)
  const [showGeneralCouponModal, setShowGeneralCouponModal] = useState(false)

  const handleSendCoupon = async () => {
    if (!couponModal) return
    setCouponSending(true)
    try {
      const code = `GV${couponModal.name.replace(/\s/g, '').toUpperCase().slice(0, 4)}${Math.floor(Math.random() * 900 + 100)}`
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await createCoupon({ code, discount_type: couponType, discount_value: couponDiscount, min_order: couponMinOrder, valid: true, expires_at: expires })
      const discountText = couponType === 'flat' ? `₹${couponDiscount}` : `${couponDiscount}%`
      if (couponModal.userId) {
        await sendNotification(couponModal.userId, lang === 'bn' ? '🎉 বিশেষ কুপন অফার!' : '🎉 Special Coupon Offer!', lang === 'bn' ? `কুপন কোড: ${code} — ${discountText} ছাড় পান!` : `Use code ${code} for ${discountText} off your next order!`, 'GreenVest')
      }
      try {
        await navigator.clipboard.writeText(code)
      } catch {}
      showToast(lang === 'bn' ? `🎟️ ${couponModal.name}-কে কুপন পাঠানো হয়েছে (কোড: ${code})` : `🎟️ Coupon ${code} sent to ${couponModal.name}!`, '🎉')
      setCouponModal(null)
    } catch {
      showToast(lang === 'bn' ? '❌ কুপন পাঠানো যায়নি' : '❌ Failed to send coupon', '❌')
    } finally {
      setCouponSending(false)
    }
  }

  // Combine users from AuthContext + Orders
  const customerList: CustomerRow[] = useMemo(() => {
    const userMap = new Map<string, CustomerRow>()
    const idMap = new Map<string, CustomerRow>()
    const emailMap = new Map<string, CustomerRow>()
    const phoneMap = new Map<string, CustomerRow>()

    // 1. Add registered users
    users.forEach((u) => {
      const cleanPhone = u.phone ? u.phone.replace(/\D/g, '').slice(-10) : ''
      const row: CustomerRow = {
        key: u.id,
        userId: u.id,
        name: u.name,
        email: u.email,
        phone: cleanPhone || u.phone || '',
        orders: 0,
        spent: 0,
        lastOrderAt: u.createdAt,
        lastAddress: 'No address saved yet',
        role: u.role,
        tier: u.tier || 'regular',
        khataApproved: u.khataApproved,
        khataCreditLimit: u.khataCreditLimit,
        isBlocked: u.isBlocked,
        isSuperAdmin: u.isSuperAdmin,
      }
      userMap.set(u.id, row)
      idMap.set(u.id, row)
      if (u.email) emailMap.set(u.email.toLowerCase(), row)
      if (cleanPhone) phoneMap.set(cleanPhone, row)
    })

    // 2. Aggregate orders
    orders.forEach((o) => {
      if (o.status === 'cancelled') return
      const orderDate = new Date(o.createdAt)
      const matchesMonth = spendMode === 'all' ||
        (orderDate.getMonth() === filterMonth && orderDate.getFullYear() === filterYear)
      const orderCleanPhone = o.phone ? o.phone.replace(/\D/g, '').slice(-10) : ''
      const spentAdd = matchesMonth ? o.total : 0

      // Match by exact User ID -> Phone -> Email
      const existing = (o.userId ? idMap.get(o.userId) : null) ||
        (orderCleanPhone ? phoneMap.get(orderCleanPhone) : null) ||
        (o.userEmail ? emailMap.get(o.userEmail.toLowerCase()) : null)

      if (existing) {
        existing.orders += 1
        existing.spent += spentAdd
        if (o.createdAt > existing.lastOrderAt) {
          existing.lastOrderAt = o.createdAt
          existing.lastAddress = o.address
          existing.phone = existing.phone || orderCleanPhone || o.phone
          existing.name = existing.name || o.userName
        }
      } else {
        const fallbackKey = o.userId || orderCleanPhone || o.userEmail || o.id
        const newRow: CustomerRow = {
          key: fallbackKey,
          userId: o.userId,
          name: o.userName,
          email: o.userEmail,
          phone: orderCleanPhone || o.phone,
          orders: 1,
          spent: spentAdd,
          lastOrderAt: o.createdAt,
          lastAddress: o.address,
          role: 'customer',
        }
        userMap.set(fallbackKey, newRow)
        if (o.userId) idMap.set(o.userId, newRow)
        if (orderCleanPhone) phoneMap.set(orderCleanPhone, newRow)
        if (o.userEmail) emailMap.set(o.userEmail.toLowerCase(), newRow)
      }
    })

    return Array.from(userMap.values())
      .filter((c) => !isSuperAdmin(c))
      .sort((a, b) => b.spent - a.spent || b.lastOrderAt.localeCompare(a.lastOrderAt))
  }, [users, orders, filterMonth, filterYear, spendMode])

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const handleResetPin = async () => {
    if (!resetModalUser) return
    if (!newPin || newPin.length !== 4) {
      showToast(lang === 'bn' ? '৪ সংখ্যার পিন দিন' : 'Enter 4-digit PIN', '⚠️', 'error')
      return
    }
    await adminResetUserPin(resetModalUser.id, newPin)
    showToast(lang === 'bn' ? `🔑 ${resetModalUser.name}-এর পিন রিসেট হয়েছে: ${newPin}` : `🔑 PIN reset for ${resetModalUser.name}: ${newPin}`, '🔑')

    if (resetModalUser.id) {
      await sendNotification(
        resetModalUser.id,
        lang === 'bn' ? '🔐 অ্যাকাউন্ট পিন রিসেট' : '🔐 Account PIN Reset',
        lang === 'bn' ? `আপনার নতুন পিন: ${newPin}` : `Your new login PIN is: ${newPin}`,
        'GreenVest Security'
      )
    }
    try {
      await navigator.clipboard.writeText(`PIN for ${resetModalUser.name}: ${newPin}`)
    } catch {}
    setResetModalUser(null)
  }

  const handleSendNotification = async () => {
    if (!notifModalTarget || !notifMessage.trim()) {
      showToast(lang === 'bn' ? 'নোটিফিকেশন মেসেজ লিখুন' : 'Enter notification message', '⚠️', 'error')
      return
    }
    setSendingNotif(true)
    try {
      if (notifModalTarget.id === 'bulk') {
        for (const key of Array.from(selectedCustomerKeys)) {
          const row = customerList.find((c) => c.key === key)
          const targetId = row?.userId || row?.phone || row?.email
          if (targetId) {
            await sendNotification(
              targetId,
              notifTitle.trim() || (lang === 'bn' ? 'স্টোর মেসেজ' : 'Store Update'),
              notifMessage.trim(),
              user.name || 'GreenVest Seller'
            )
          }
        }
        showToast(
          lang === 'bn'
            ? `${selectedCustomerKeys.size} জন কাস্টমারকে নোটিফিকেশন পাঠানো হয়েছে`
            : `Notification sent to ${selectedCustomerKeys.size} customers`,
          '📢'
        )
      } else {
        await sendNotification(
          notifModalTarget.id,
          notifTitle.trim() || (lang === 'bn' ? 'স্টোর মেসেজ' : 'Store Update'),
          notifMessage.trim(),
          user.name || 'GreenVest Seller'
        )
      }
      setNotifModalTarget(null)
      setNotifTitle('')
      setNotifMessage('')
    } finally {
      setSendingNotif(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lang === 'bn' ? 'কাস্টমার ও ইউজার ম্যানেজমেন্ট' : 'Customer & User Management'}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowGeneralCouponModal(true)}
            style={{ background: '#fef9c3', borderColor: '#fde047', color: '#854d0e', fontWeight: 700 }}
          >
            🎟️ {lang === 'bn' ? 'কুপন তৈরি করুন' : 'Create Promo Code'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setNotifModalTarget({ id: 'all', name: lang === 'bn' ? 'সকল কাস্টমার (Broadcast)' : 'All Customers (Broadcast)' })
              setNotifTitle(lang === 'bn' ? 'অফার ও নতুন স্টক আপডেট' : 'Special Offer & Stock Update')
              setNotifMessage('')
            }}
          >
            📢 {lang === 'bn' ? 'সবাইকে মেসেজ দিন (Broadcast)' : 'Broadcast to All Users'}
          </button>
          <Link to="/seller" className="btn btn-ghost">
            {lang === 'bn' ? '← ড্যাশবোর্ড' : '← Dashboard'}
          </Link>
        </div>
      </div>
      <p className="lede">
        {lang === 'bn'
          ? 'কাস্টমারদের সরাসরি নোটিফিকেশন মেসেজ পাঠান, পিন রিসেট করুন ও অ্যাকাউন্ট সিকিউরিটি চেক করুন।'
          : 'Send live notifications to any customer or all customers at once, reset user PINs, and manage security.'}
      </p>

      {/* 📅 Monthly Spend Filter */}
      <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1.5px solid #86efac', borderRadius: '14px', padding: '1rem 1.2rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: '#166534', fontSize: '0.9rem' }}>📊 {lang === 'bn' ? 'ব্যয়ের সময়কাল:' : 'Spend Period:'}</span>
        <button
          type="button"
          onClick={() => setSpendMode('all')}
          style={{ padding: '0.35rem 0.85rem', borderRadius: '20px', border: '1.5px solid', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', background: spendMode === 'all' ? '#16a34a' : 'white', color: spendMode === 'all' ? 'white' : '#16a34a', borderColor: '#16a34a' }}
        >
          {lang === 'bn' ? '📈 সব সময়' : '📈 All Time'}
        </button>
        <button
          type="button"
          onClick={() => setSpendMode('month')}
          style={{ padding: '0.35rem 0.85rem', borderRadius: '20px', border: '1.5px solid', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', background: spendMode === 'month' ? '#16a34a' : 'white', color: spendMode === 'month' ? 'white' : '#16a34a', borderColor: '#16a34a' }}
        >
          📅 {lang === 'bn' ? 'মাস অনুযায়ী' : 'By Month'}
        </button>
        {spendMode === 'month' && (
          <>
            <select
              value={filterMonth}
              onChange={e => setFilterMonth(Number(e.target.value))}
              style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid #86efac', fontSize: '0.85rem', background: 'white' }}
            >
              {(lang === 'bn' ? MONTHS_BN : MONTHS).map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={e => setFilterYear(Number(e.target.value))}
              style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid #86efac', fontSize: '0.85rem', background: 'white' }}
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </>
        )}
        <span style={{ fontSize: '0.8rem', color: '#166534', marginLeft: 'auto' }}>
          {lang === 'bn' ? `মোট ₹${customerList.reduce((s,c) => s+c.spent,0)} বিক্রি হয়েছে` : `Total ₹${customerList.reduce((s,c) => s+c.spent,0)} sold`}
        </span>
      </div>

      {customerList.length === 0 ? (
        <p className="empty">{lang === 'bn' ? 'এখনো কোনো কাস্টমার নেই।' : 'No customers yet.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={customerList.length > 0 && selectedCustomerKeys.size === customerList.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCustomerKeys(new Set(customerList.map((c) => c.key)))
                      } else {
                        setSelectedCustomerKeys(new Set())
                      }
                    }}
                    title={lang === 'bn' ? 'সব নির্বাচন করুন' : 'Select All'}
                    style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                  />
                </th>
                <th>{lang === 'bn' ? 'নাম' : 'Name'}</th>
                <th>{lang === 'bn' ? 'যোগাযোগ' : 'Contact'}</th>
                <th>{lang === 'bn' ? 'টায়ার / খাতা' : 'Tier & Khata'}</th>
                <th>{lang === 'bn' ? 'অর্ডার' : 'Orders'}</th>
                <th>{lang === 'bn' ? 'কিনেছে' : 'Spent'}</th>
                <th>{lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
                <th>{lang === 'bn' ? 'অ্যাকশন' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {customerList.map((c, idx) => (
                <tr key={c.key} style={selectedCustomerKeys.has(c.key) ? { background: '#f0f9ff' } : idx < 3 ? { background: idx === 0 ? '#fffbeb' : idx === 1 ? '#f8fafc' : '#fff7ed' } : {}}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedCustomerKeys.has(c.key)}
                      onChange={(e) => {
                        const next = new Set(selectedCustomerKeys)
                        if (e.target.checked) next.add(c.key)
                        else next.delete(c.key)
                        setSelectedCustomerKeys(next)
                      }}
                      style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: idx === 0 ? '#d97706' : idx === 1 ? '#6b7280' : idx === 2 ? '#92400e' : '#888', minWidth: '1.5rem' }}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                      </span>
                      <strong>{c.name}</strong>
                    </div>
                  </td>
                  <td>
                    <div>{c.phone || 'No phone'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{c.email}</div>
                  </td>
                  <td>
                    {(() => {
                      const identifier = c.userId || c.phone || c.email || c.key
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '130px' }}>
                          <select
                            value={c.tier || 'regular'}
                            onChange={async (e) => {
                              const newTier = e.target.value as CustomerTier
                              await setUserTier(identifier, newTier)
                              showToast(`Tier updated to ${newTier.toUpperCase()}`, '⭐')
                            }}
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '6px',
                              border: '1.5px solid',
                              borderColor: c.tier === 'wholesale' ? '#7c3aed' : c.tier === 'vip' ? '#d97706' : '#cbd5e1',
                              background: c.tier === 'wholesale' ? '#f5f3ff' : c.tier === 'vip' ? '#fffbeb' : '#f8fafc',
                              color: c.tier === 'wholesale' ? '#6d28d9' : c.tier === 'vip' ? '#b45309' : '#475569',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="regular">⭐ Regular (0%)</option>
                            <option value="vip">🥈 VIP (5% OFF)</option>
                            <option value="wholesale">👑 Wholesale (12% OFF)</option>
                          </select>
                          <button
                            type="button"
                            onClick={async () => {
                              const nextState = !c.khataApproved
                              await setUserKhataApproval(identifier, nextState, c.khataCreditLimit || 2000)
                              showToast(nextState ? '📒 Khata Approved (₹2000 limit)' : '📒 Khata Disabled', '📒')
                            }}
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              border: '1px solid',
                              fontWeight: 600,
                              cursor: 'pointer',
                              background: c.khataApproved ? '#dcfce7' : '#f1f5f9',
                              color: c.khataApproved ? '#15803d' : '#64748b',
                              borderColor: c.khataApproved ? '#86efac' : '#cbd5e1',
                            }}
                          >
                            {c.khataApproved ? '📒 Khata: ON' : '📒 Khata: OFF'}
                          </button>
                        </div>
                      )
                    })()}
                  </td>
                  <td>{c.orders}</td>
                  <td>₹{c.spent}
                    {(() => { const t = loyaltyTier(c.spent); return t.label ? <span style={{ display:'block', fontSize:'0.72rem', fontWeight:700, color: t.color, marginTop:'2px' }}>{t.emoji} {t.label}</span> : null })()} 
                  </td>
                  <td>
                    {c.isBlocked ? (
                      <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.85rem' }}>🚫 Blocked</span>
                    ) : (
                      <span style={{ color: '#166534', fontSize: '0.85rem' }}>✅ Active</span>
                    )}
                  </td>
                  <td className="actions" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {/* 📢 Send Notification Button */}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                      onClick={() => {
                        setNotifModalTarget({ id: c.userId || 'all', name: c.name })
                        setNotifTitle(lang === 'bn' ? 'আপনার অর্ডারের নতুন খবর' : 'Update regarding your order')
                        setNotifMessage('')
                      }}
                    >
                      📩 {lang === 'bn' ? 'মেসেজ দিন' : 'Send Notification'}
                    </button>

                    {/* Support Chat button */}
                    <Link
                      to={c.userId ? `/seller/support?userId=${c.userId}` : '/seller/support'}
                      className="btn btn-secondary btn-sm"
                      style={{ textDecoration: 'none' }}
                    >
                      💬 {lang === 'bn' ? 'সাপোর্ট চ্যাট' : 'Support Chat'}
                    </Link>

                    {/* 🎟️ Send Coupon Button (for spenders >=500) */}
                    {c.spent >= 500 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ background: '#fefce8', color: '#854d0e', border: '1px solid #fde047', fontWeight: 700 }}
                        onClick={() => setCouponModal({ name: c.name, phone: c.phone, userId: c.userId, spent: c.spent })}
                      >
                        🎟️ {lang === 'bn' ? 'কুপন দিন' : 'Send Coupon'}
                      </button>
                    )}

                    {c.userId && (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setResetModalUser({ id: c.userId!, name: c.name, phone: c.phone })
                            setNewPin('1234')
                          }}
                        >
                          🔑 Reset PIN
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ background: c.isBlocked ? '#dcfce7' : '#fef2f2', color: c.isBlocked ? '#166534' : '#dc2626' }}
                          onClick={() => void toggleBlockUser(c.userId!, !c.isBlocked)}
                        >
                          {c.isBlocked ? '🔓 Unblock' : '🚫 Block'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 👥 Floating Multi-Customer Bulk Action Bar */}
      {selectedCustomerKeys.size > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9000,
            background: '#0f172a',
            color: '#f8fafc',
            borderRadius: '16px',
            padding: '0.75rem 1.25rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            maxWidth: '94vw',
            border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#38bdf8' }}>
              {selectedCustomerKeys.size} {lang === 'bn' ? 'জন নির্বাচিত' : 'Selected'}
            </span>
            <button
              type="button"
              onClick={() => setSelectedCustomerKeys(new Set())}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#cbd5e1',
                borderRadius: '20px',
                padding: '2px 8px',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              ✕ {lang === 'bn' ? 'বাতিল' : 'Clear'}
            </button>
          </div>

          <div style={{ height: '20px', width: '1px', background: 'rgba(255,255,255,0.2)' }} />

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 📩 Message All */}
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: '#2563eb', color: 'white', border: 'none', fontSize: '0.8rem', fontWeight: 600 }}
              onClick={() => {
                setNotifModalTarget({ id: 'bulk', name: `${selectedCustomerKeys.size} Customers` })
                setNotifTitle(lang === 'bn' ? 'বিশেষ অফার ও আপডেট' : 'Special Offer & Update')
                setNotifMessage('')
              }}
            >
              📩 {lang === 'bn' ? 'সবাইকে মেসেজ' : 'Message All'}
            </button>

            {/* 🏷️ Bulk Tier Dropdown */}
            <select
              defaultValue=""
              disabled={bulkActionBusy}
              onChange={async (e) => {
                const tier = e.target.value as CustomerTier
                if (!tier) return
                if (!window.confirm(lang === 'bn' ? `নির্বাচিত ${selectedCustomerKeys.size} জনের টায়ার "${tier}" করবেন?` : `Change tier of ${selectedCustomerKeys.size} customers to "${tier}"?`)) {
                  e.target.value = ''
                  return
                }
                setBulkActionBusy(true)
                let count = 0
                for (const key of Array.from(selectedCustomerKeys)) {
                  const row = customerList.find(c => c.key === key)
                  const targetId = row?.userId || row?.phone || row?.email
                  if (targetId) {
                    await setUserTier(targetId, tier)
                    count++
                  }
                }
                setBulkActionBusy(false)
                e.target.value = ''
                showToast(lang === 'bn' ? `${count} জনের টায়ার আপডেট হয়েছে` : `Updated ${count} customers to ${tier}`, '🏷️')
              }}
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #475569',
                borderRadius: '8px',
                padding: '5px 8px',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              <option value="" disabled>{lang === 'bn' ? '🏷️ টায়ার পরিবর্তন...' : '🏷️ Change Tier...'}</option>
              <option value="regular">⭐ Regular (0%)</option>
              <option value="vip">🥈 VIP (5% OFF)</option>
              <option value="wholesale">👑 Wholesale (12% OFF)</option>
            </select>

            {/* 📒 Bulk Khata Toggle */}
            <button
              type="button"
              className="btn btn-sm"
              disabled={bulkActionBusy}
              style={{ background: '#15803d', color: 'white', border: 'none', fontSize: '0.8rem', fontWeight: 600 }}
              onClick={async () => {
                if (!window.confirm(lang === 'bn' ? `নির্বাচিত ${selectedCustomerKeys.size} জনের জন্য খাতা চালু করবেন?` : `Enable Khata credit for all ${selectedCustomerKeys.size} selected customers?`)) return
                setBulkActionBusy(true)
                for (const key of Array.from(selectedCustomerKeys)) {
                  const row = customerList.find(c => c.key === key)
                  const targetId = row?.userId || row?.phone || row?.email
                  if (targetId) {
                    await setUserKhataApproval(targetId, true, 2000)
                  }
                }
                setBulkActionBusy(false)
                showToast(lang === 'bn' ? 'খাতা চালু করা হয়েছে' : 'Khata approved for selected customers', '📒')
              }}
            >
              📒 {lang === 'bn' ? 'খাতা অন' : 'Khata ON'}
            </button>

            {/* 🚫 Bulk Block */}
            <button
              type="button"
              className="btn btn-sm"
              disabled={bulkActionBusy}
              style={{ background: '#dc2626', color: 'white', border: 'none', fontSize: '0.8rem', fontWeight: 600 }}
              onClick={async () => {
                if (!window.confirm(lang === 'bn' ? `নির্বাচিত ${selectedCustomerKeys.size} জনকে ব্লক করবেন?` : `Block all ${selectedCustomerKeys.size} selected customers?`)) return
                setBulkActionBusy(true)
                for (const key of Array.from(selectedCustomerKeys)) {
                  const row = customerList.find(c => c.key === key)
                  if (row?.userId) {
                    await toggleBlockUser(row.userId, true)
                  }
                }
                setBulkActionBusy(false)
                showToast(lang === 'bn' ? 'কাস্টমারদের ব্লক করা হয়েছে' : 'Selected customers blocked', '🚫')
              }}
            >
              🚫 {lang === 'bn' ? 'ব্লক করুন' : 'Block All'}
            </button>
          </div>
        </div>
      )}

      {/* 📢 Send Notification Modal */}
      {notifModalTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', width: '90%', maxWidth: '450px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0 }}>
              📢 {lang === 'bn' ? `${notifModalTarget.name}-কে লাইভ নোটিফিকেশন পাঠান` : `Send Live Notification to ${notifModalTarget.name}`}
            </h3>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600 }}>
              {lang === 'bn' ? 'শিরোনাম (Title):' : 'Title:'}
              <input
                type="text"
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                placeholder={lang === 'bn' ? 'যেমন: বিশেষ ছাড় বা অর্ডারের নতুন মেসেজ' : 'e.g. Special Discount or Order Message'}
                style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #ccc' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600 }}>
              {lang === 'bn' ? 'নোটিফিকেশন মেসেজ (Message):' : 'Notification Message:'}
              <textarea
                rows={4}
                value={notifMessage}
                onChange={(e) => setNotifMessage(e.target.value)}
                placeholder={lang === 'bn' ? 'আপনার মেসেজ লিখুন...' : 'Write your message here...'}
                style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #ccc', resize: 'vertical' }}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setNotifModalTarget(null)}>
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button className="btn btn-primary" onClick={handleSendNotification} disabled={sendingNotif}>
                {sendingNotif ? '...' : (lang === 'bn' ? '📢 পাঠান' : '📢 Send Notification')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Reset Modal */}
      {resetModalUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0 }}>🔑 {lang === 'bn' ? `${resetModalUser.name}-এর নতুন ৪-সংখ্যার পিন দিন` : `Set New 4-Digit PIN for ${resetModalUser.name}`}</h3>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              style={{ fontSize: '1.2rem', fontWeight: 'bold', padding: '0.5rem', borderRadius: '8px', border: '1px solid #ccc', letterSpacing: '0.2rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setResetModalUser(null)}>
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button className="btn btn-primary" onClick={handleResetPin}>
                {lang === 'bn' ? 'পিন আপডেট করুন' : 'Save PIN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎟️ Send Coupon Modal */}
      {couponModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: '16px', width: '90%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg,#fef08a,#fde047)', padding: '1.2rem 1.5rem', borderBottom: '1px solid #fde047' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#713f12' }}>
                🎟️ {lang === 'bn' ? `${couponModal.name}-কে বিশেষ কুপন পাঠান` : `Send Special Coupon to ${couponModal.name}`}
              </h3>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#92400e' }}>
                {lang === 'bn' ? `মোট খরচ: ₹${couponModal.spent} — তাকে পুরস্কার দিন!` : `Total spent: ₹${couponModal.spent} — Reward them!`}
              </p>
            </div>
            {/* Body */}
            <div style={{ padding: '1.2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600 }}>
                {lang === 'bn' ? 'ছাড়ের ধরন' : 'Discount Type'}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setCouponType('flat')}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '2px solid', fontWeight: 700, cursor: 'pointer', background: couponType === 'flat' ? '#fef08a' : 'white', borderColor: couponType === 'flat' ? '#eab308' : '#e5e7eb' }}
                  >
                    💸 {lang === 'bn' ? 'ফ্ল্যাট (যেমন ₹50)' : 'Flat (e.g. ₹50 off)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCouponType('percent')}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '2px solid', fontWeight: 700, cursor: 'pointer', background: couponType === 'percent' ? '#fef08a' : 'white', borderColor: couponType === 'percent' ? '#eab308' : '#e5e7eb' }}
                  >
                    🎟️ {lang === 'bn' ? 'পার্সেন্ট (যেমন 10%)' : 'Percent (e.g. 10% off)'}
                  </button>
                </div>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600 }}>
                {couponType === 'flat' ? (lang === 'bn' ? `ছাড়ের পরিমাণ (₹)` : 'Discount Amount (₹)') : (lang === 'bn' ? 'ছাড় শতাংশ (%)' : 'Discount Percentage (%)')}
                <input
                  type="number"
                  min={1}
                  max={couponType === 'percent' ? 50 : 500}
                  value={couponDiscount}
                  onChange={e => setCouponDiscount(Number(e.target.value))}
                  style={{ padding: '0.5rem', borderRadius: '8px', border: '1.5px solid #fde047', fontSize: '1rem', fontWeight: 700 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600 }}>
                {lang === 'bn' ? 'মিনিমাম অর্ডার (₹)' : 'Minimum Order Amount (₹)'}
                <input
                  type="number"
                  min={100}
                  value={couponMinOrder}
                  onChange={e => setCouponMinOrder(Number(e.target.value))}
                  style={{ padding: '0.5rem', borderRadius: '8px', border: '1.5px solid #fde047', fontSize: '1rem', fontWeight: 700 }}
                />
              </label>
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '0.75rem', fontSize: '0.85rem', color: '#166534' }}>
                👀 {lang === 'bn' ? 'কুপন কোড অ্যাপে তৈরি হবে এবং গ্রাহককে ইন-অ্যাপ নোটিফিকেশন পাঠানো হবে। মেয়াদ ৭ দিন।' : 'Code will be generated and sent via in-app notification. Valid for 7 days.'}
              </div>
            </div>
            {/* Footer */}
            <div style={{ padding: '0 1.5rem 1.2rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setCouponModal(null)}>
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSendCoupon}
                disabled={couponSending}
                style={{ background: '#eab308', color: '#1c1917', border: 'none' }}
              >
                {couponSending ? '⏳...' : `🎟️ ${lang === 'bn' ? 'কুপন পাঠান' : 'Send In-App Coupon'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seller General Coupon Generator Modal */}
      {showGeneralCouponModal && <CouponGeneratorModal onClose={() => setShowGeneralCouponModal(false)} />}
    </div>
  )
}
