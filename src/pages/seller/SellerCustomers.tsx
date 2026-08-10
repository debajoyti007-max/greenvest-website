import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { formatWhatsAppPhone } from '../../lib/whatsapp'
import { showToast } from '../../components/Toast'
import type { Order } from '../../types'

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
  isBlocked?: boolean
}

function waCustomer(phone: string, name: string) {
  const digits = formatWhatsAppPhone(phone)
  const text = encodeURIComponent(
    `নমস্কার ${name}, GreenVest থেকে বলছি। আপনার অর্ডার নিয়ে যোগাযোগ।`,
  )
  window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener,noreferrer')
}

function buildCustomers(orders: Order[]): CustomerRow[] {
  const map = new Map<string, CustomerRow>()
  for (const o of orders) {
    if (o.status === 'cancelled') continue
    const key = o.userId || o.phone || o.userEmail
    const prev = map.get(key)
    const spentAdd = o.utrVerified ? o.total : 0
    if (!prev) {
      map.set(key, {
        key,
        userId: o.userId,
        name: o.userName,
        email: o.userEmail,
        phone: o.phone,
        orders: 1,
        spent: spentAdd,
        lastOrderAt: o.createdAt,
        lastAddress: o.address,
      })
    } else {
      prev.orders += 1
      prev.spent += spentAdd
      if (o.createdAt > prev.lastOrderAt) {
        prev.lastOrderAt = o.createdAt
        prev.lastAddress = o.address
        prev.phone = o.phone
        prev.name = o.userName
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt))
}

export default function SellerCustomers() {
  const { user, users, adminResetUserPin, toggleBlockUser } = useAuth()
  const { orders, lang } = useStore()
  const [resetModalUser, setResetModalUser] = useState<{ id: string; name: string; phone: string } | null>(null)
  const [newPin, setNewPin] = useState('1234')

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const customers = useMemo(() => {
    const raw = buildCustomers(orders)
    return raw.map(c => {
      const matched = users.find(u => u.id === c.userId || u.email === c.email || u.phone === c.phone)
      return { ...c, userId: matched?.id || c.userId, isBlocked: matched?.isBlocked }
    })
  }, [orders, users])

  const handleResetPin = async () => {
    if (!resetModalUser) return
    if (!newPin || newPin.length !== 4) {
      alert(lang === 'bn' ? '৪ সংখ্যার পিন দিন' : 'Enter 4-digit PIN')
      return
    }
    await adminResetUserPin(resetModalUser.id, newPin)
    showToast(lang === 'bn' ? `🔑 ${resetModalUser.name}-এর পিন রিসেট হয়েছে: ${newPin}` : `🔑 PIN reset for ${resetModalUser.name}: ${newPin}`, '🔑')

    // Optional WhatsApp Message link
    const waDigits = formatWhatsAppPhone(resetModalUser.phone)
    const msg = encodeURIComponent(
      `নমস্কার ${resetModalUser.name}, GreenVest-এ আপনার অ্যাকাউন্ট পিন নতুন পরিবর্তন করা হয়েছে: ${newPin}\nলগইন করুন: https://greenvest.shop/auth`
    )
    if (window.confirm(lang === 'bn' ? 'হোয়াটসঅ্যাপে কাস্টমারকে নতুন পিন পাঠাবেন?' : 'Send new PIN to customer via WhatsApp?')) {
      window.open(`https://wa.me/${waDigits}?text=${msg}`, '_blank')
    }
    setResetModalUser(null)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lang === 'bn' ? 'কাস্টমার ম্যানেজমেন্ট' : 'Customer Management'}</h1>
        <Link to="/seller" className="btn btn-ghost">
          {lang === 'bn' ? '← ড্যাশবোর্ড' : '← Dashboard'}
        </Link>
      </div>
      <p className="lede">
        {lang === 'bn'
          ? 'কাস্টমারদের যোগাযোগের তথ্য, পিন রিসেট ও ব্লক ম্যানেজমেন্ট।'
          : 'Customer contacts, PIN reset, and order security management.'}
      </p>

      {customers.length === 0 ? (
        <p className="empty">{lang === 'bn' ? 'এখনো কোনো কাস্টমার নেই।' : 'No customers yet.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{lang === 'bn' ? 'নাম' : 'Name'}</th>
                <th>{lang === 'bn' ? 'যোগাযোগ' : 'Contact'}</th>
                <th>{lang === 'bn' ? 'অর্ডার' : 'Orders'}</th>
                <th>{lang === 'bn' ? 'কিনেছে' : 'Spent'}</th>
                <th>{lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
                <th>{lang === 'bn' ? 'অ্যাকশন' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.key}>
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td>
                    <div>{c.phone}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{c.email}</div>
                  </td>
                  <td>{c.orders}</td>
                  <td>₹{c.spent}</td>
                  <td>
                    {c.isBlocked ? (
                      <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.85rem' }}>🚫 Blocked</span>
                    ) : (
                      <span style={{ color: '#166534', fontSize: '0.85rem' }}>✅ Active</span>
                    )}
                  </td>
                  <td className="actions" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
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

      {/* PIN Reset Modal */}
      {resetModalUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3>🔑 {lang === 'bn' ? `${resetModalUser.name}-এর নতুন ৪-সংখ্যার পিন দিন` : `Set New 4-Digit PIN for ${resetModalUser.name}`}</h3>
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
