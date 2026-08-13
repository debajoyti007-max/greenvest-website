import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { formatWhatsAppPhone } from '../../lib/whatsapp'
import { showToast } from '../../components/Toast'

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
  isBlocked?: boolean
}

function waCustomer(phone: string, name: string) {
  const digits = formatWhatsAppPhone(phone)
  const text = encodeURIComponent(
    `নমস্কার ${name}, GreenVest থেকে বলছি। আপনার অর্ডার নিয়ে যোগাযোগ।`,
  )
  window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener,noreferrer')
}

export default function SellerCustomers() {
  const { user, users, adminResetUserPin, toggleBlockUser } = useAuth()
  const { orders, lang, sendNotification } = useStore()

  const [resetModalUser, setResetModalUser] = useState<{ id: string; name: string; phone: string } | null>(null)
  const [newPin, setNewPin] = useState('1234')

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

  function loyaltyTier(spent: number): { label: string; color: string; emoji: string } {
    if (spent >= 10000) return { label: lang === 'bn' ? 'প্লাটিনাম' : 'Platinum', color: '#7c3aed', emoji: '💎' }
    if (spent >= 5000) return { label: lang === 'bn' ? 'গোল্ড' : 'Gold', color: '#d97706', emoji: '🥇' }
    if (spent >= 2000) return { label: lang === 'bn' ? 'সিলভার' : 'Silver', color: '#6b7280', emoji: '🥈' }
    if (spent >= 500) return { label: lang === 'bn' ? 'ব্রোঞ্জ' : 'Bronze', color: '#92400e', emoji: '🥉' }
    return { label: '', color: '', emoji: '' }
  }

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  // Combine users from AuthContext + Orders
  const customerList: CustomerRow[] = useMemo(() => {
    const userMap = new Map<string, CustomerRow>()

    // 1. Add registered users
    users.forEach((u) => {
      userMap.set(u.id, {
        key: u.id,
        userId: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        orders: 0,
        spent: 0,
        lastOrderAt: u.createdAt,
        lastAddress: 'No address saved yet',
        role: u.role,
        isBlocked: u.isBlocked,
      })
    })

    // 2. Aggregate orders
    orders.forEach((o) => {
      if (o.status === 'cancelled') return
      // Month filtering
      const orderDate = new Date(o.createdAt)
      const matchesMonth = spendMode === 'all' ||
        (orderDate.getMonth() === filterMonth && orderDate.getFullYear() === filterYear)
      const key = o.userId || o.phone || o.userEmail
      const existing = userMap.get(key) || userMap.get(o.userId)
      const spentAdd = (o.utrVerified && matchesMonth) ? o.total : 0

      if (existing) {
        existing.orders += 1
        existing.spent += spentAdd
        if (o.createdAt > existing.lastOrderAt) {
          existing.lastOrderAt = o.createdAt
          existing.lastAddress = o.address
          existing.phone = existing.phone || o.phone
          existing.name = existing.name || o.userName
        }
      } else {
        userMap.set(key, {
          key,
          userId: o.userId,
          name: o.userName,
          email: o.userEmail,
          phone: o.phone,
          orders: 1,
          spent: spentAdd,
          lastOrderAt: o.createdAt,
          lastAddress: o.address,
          role: 'customer',
        })
      }
    })

    return Array.from(userMap.values()).sort((a, b) => b.spent - a.spent || b.lastOrderAt.localeCompare(a.lastOrderAt))
  }, [users, orders, filterMonth, filterYear, spendMode])

  const handleResetPin = async () => {
    if (!resetModalUser) return
    if (!newPin || newPin.length !== 4) {
      alert(lang === 'bn' ? '৪ সংখ্যার পিন দিন' : 'Enter 4-digit PIN')
      return
    }
    await adminResetUserPin(resetModalUser.id, newPin)
    showToast(lang === 'bn' ? `🔑 ${resetModalUser.name}-এর পিন রিসেট হয়েছে: ${newPin}` : `🔑 PIN reset for ${resetModalUser.name}: ${newPin}`, '🔑')

    const waDigits = formatWhatsAppPhone(resetModalUser.phone)
    const msg = encodeURIComponent(
      `নমস্কার ${resetModalUser.name}, GreenVest-এ আপনার অ্যাকাউন্ট পিন নতুন পরিবর্তন করা হয়েছে: ${newPin}\nলগইন করুন: https://greenvest.shop/auth`
    )
    if (window.confirm(lang === 'bn' ? 'হোয়াটসঅ্যাপে কাস্টমারকে নতুন পিন পাঠাবেন?' : 'Send new PIN to customer via WhatsApp?')) {
      window.open(`https://wa.me/${waDigits}?text=${msg}`, '_blank')
    }
    setResetModalUser(null)
  }

  const handleSendNotification = async () => {
    if (!notifModalTarget || !notifMessage.trim()) {
      alert(lang === 'bn' ? 'নোটিফিকেশন মেসেজ লিখুন' : 'Enter notification message')
      return
    }
    setSendingNotif(true)
    try {
      await sendNotification(
        notifModalTarget.id,
        notifTitle.trim() || (lang === 'bn' ? 'স্টোর মেসেজ' : 'Store Update'),
        notifMessage.trim(),
        user.name || 'GreenVest Seller'
      )
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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                <th>{lang === 'bn' ? 'নাম' : 'Name'}</th>
                <th>{lang === 'bn' ? 'যোগাযোগ' : 'Contact'}</th>
                <th>{lang === 'bn' ? 'রোল' : 'Role'}</th>
                <th>{lang === 'bn' ? 'অর্ডার' : 'Orders'}</th>
                <th>{lang === 'bn' ? 'কিনেছে' : 'Spent'}</th>
                <th>{lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
                <th>{lang === 'bn' ? 'অ্যাকশন' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {customerList.map((c) => (
                <tr key={c.key}>
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td>
                    <div>{c.phone || 'No phone'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{c.email}</div>
                  </td>
                  <td>
                    <span className={`role-pill role-${c.role}`}>{c.role}</span>
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

                    {/* WhatsApp button */}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => waCustomer(c.phone, c.name)}
                    >
                      💬 WhatsApp
                    </button>

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
    </div>
  )
}
