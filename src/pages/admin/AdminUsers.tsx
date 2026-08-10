import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { formatDisplayContact } from '../../lib/business'
import { formatWhatsAppPhone } from '../../lib/whatsapp'
import { showToast } from '../../components/Toast'
import type { Role } from '../../types'

export default function AdminUsers() {
  const { user, users, setUserRole, adminResetUserPin, toggleBlockUser, mode: dataMode } = useAuth()
  const { products, orders, lang, sendNotification } = useStore()

  const [resetModalUserId, setResetModalUserId] = useState<string | null>(null)
  const [newPin, setNewPin] = useState('1234')

  const [notifModalTarget, setNotifModalTarget] = useState<{ id: string | 'all'; name: string } | null>(null)
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMessage, setNotifMessage] = useState('')
  const [sendingNotif, setSendingNotif] = useState(false)

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  const handleResetPin = async (uId: string, name: string, phoneStr: string) => {
    if (!newPin || newPin.length !== 4) {
      alert(lang === 'bn' ? '৪ সংখ্যার পিন দিন' : 'Enter 4-digit PIN')
      return
    }
    await adminResetUserPin(uId, newPin)
    showToast(lang === 'bn' ? `🔑 ${name}-এর পিন রিসেট হয়েছে: ${newPin}` : `🔑 PIN reset for ${name}: ${newPin}`, '🔑')
    setResetModalUserId(null)

    if (phoneStr) {
      const waDigits = formatWhatsAppPhone(phoneStr)
      const msg = encodeURIComponent(
        `নমস্কার ${name}, GreenVest-এ আপনার অ্যাকাউন্ট পিন নতুন পরিবর্তন করা হয়েছে: ${newPin}\nলগইন করুন: https://greenvest.shop/auth`
      )
      if (window.confirm(lang === 'bn' ? 'হোয়াটসঅ্যাপে গ্রাহককে নতুন পিন পাঠাবেন?' : 'Send new PIN to customer via WhatsApp?')) {
        window.open(`https://wa.me/${waDigits}?text=${msg}`, '_blank')
      }
    }
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
        notifTitle.trim() || (lang === 'bn' ? 'অ্যাডমিন আপডেট' : 'Admin Update'),
        notifMessage.trim(),
        'GreenVest Admin'
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
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1>{lang === 'bn' ? 'অ্যাডমিন — ইউজার ও অ্যাকাউন্ট সিকিউরিটি' : 'Admin — User & Account Security'}</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setNotifModalTarget({ id: 'all', name: lang === 'bn' ? 'সকল কাস্টমার (Broadcast)' : 'All Users (Broadcast)' })
            setNotifTitle(lang === 'bn' ? 'জরুরি অ্যানাউন্সমেন্ট' : 'Important Announcement')
            setNotifMessage('')
          }}
        >
          📢 {lang === 'bn' ? 'সবাইকে মেসেজ দিন (Broadcast)' : 'Broadcast to All Users'}
        </button>
      </div>
      <p className="lede">
        {lang === 'bn'
          ? 'সেলার ও রাইডার রোল পরিচালনা করুন, লাইভ নোটিফিকেশন মেসেজ পাঠান, পিন রিসেট করুন বা অ্যাকাউন্ট সসপেন্ড করুন।'
          : 'Manage roles, send live broadcast notifications, reset user PINs, or block accounts.'}
      </p>

      <div className="dash-grid admin-health">
        <div className="stat">
          <span>{lang === 'bn' ? 'ইউজার' : 'Users'}</span>
          <strong>{users.length}</strong>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'প্রোডাক্ট' : 'Products'}</span>
          <strong>{products.length}</strong>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'অর্ডার' : 'Orders'}</span>
          <strong>{orders.length}</strong>
        </div>
        <div className="stat">
          <span>{lang === 'bn' ? 'স্টোরেজ' : 'Storage'}</span>
          <strong>{dataMode === 'cloud' ? 'Supabase' : 'Local'}</strong>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{lang === 'bn' ? 'নাম' : 'Name'}</th>
              <th>{lang === 'bn' ? 'ফোন / যোগাযোগ' : 'Phone / Contact'}</th>
              <th>{lang === 'bn' ? 'রোল' : 'Role'}</th>
              <th>{lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
              <th>{lang === 'bn' ? 'অ্যাকশন' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                </td>
                <td>{formatDisplayContact(u.email, u.phone)}</td>
                <td>
                  <span className={`role-pill role-${u.role}`}>{u.role}</span>
                </td>
                <td>
                  {u.isBlocked ? (
                    <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.85rem' }}>🚫 {lang === 'bn' ? 'ব্লকড' : 'Blocked'}</span>
                  ) : (
                    <span style={{ color: '#166534', fontSize: '0.85rem' }}>✅ {lang === 'bn' ? 'সক্রিয়' : 'Active'}</span>
                  )}
                </td>
                <td className="actions" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {/* 📢 Send Notification Button */}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                    onClick={() => {
                      setNotifModalTarget({ id: u.id, name: u.name })
                      setNotifTitle(lang === 'bn' ? 'অ্যাকাউন্ট আপডেট' : 'Account Update')
                      setNotifMessage('')
                    }}
                  >
                    📩 {lang === 'bn' ? 'মেসেজ দিন' : 'Send Message'}
                  </button>

                  {u.role !== 'admin' && (
                    <>
                      {/* Seller Role Toggle */}
                      {u.role !== 'seller' ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void setUserRole(u.id, 'seller')}
                        >
                          {lang === 'bn' ? 'সেলার করুন' : 'Make seller'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void setUserRole(u.id, 'customer' as Role)}
                        >
                          {lang === 'bn' ? 'সেলার বাতিল' : 'Revoke seller'}
                        </button>
                      )}

                      {/* Rider Role Toggle */}
                      {u.role !== 'rider' ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void setUserRole(u.id, 'rider')}
                        >
                          🛵 {lang === 'bn' ? 'রাইডার করুন' : 'Make Rider'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void setUserRole(u.id, 'customer' as Role)}
                        >
                          🛵 {lang === 'bn' ? 'রাইডার বাতিল' : 'Revoke Rider'}
                        </button>
                      )}

                      {/* 🔑 Reset PIN Button */}
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setResetModalUserId(u.id)
                          setNewPin('1234')
                        }}
                      >
                        🔑 {lang === 'bn' ? 'পিন রিসেট' : 'Reset PIN'}
                      </button>

                      {/* 🚫 Block / Unblock Button */}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ background: u.isBlocked ? '#dcfce7' : '#fef2f2', color: u.isBlocked ? '#166534' : '#dc2626' }}
                        onClick={() => void toggleBlockUser(u.id, !u.isBlocked)}
                      >
                        {u.isBlocked ? (lang === 'bn' ? '🔓 আনব্লক' : '🔓 Unblock') : (lang === 'bn' ? '🚫 ব্লক' : '🚫 Block')}
                      </button>
                    </>
                  )}
                  {u.role === 'admin' && (
                    <span className="muted">{lang === 'bn' ? 'সুরক্ষিত অ্যাডমিন' : 'Protected Admin'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
                placeholder={lang === 'bn' ? 'যেমন: বিশেষ বিবরণ বা আপডেট' : 'e.g. Special Details or Update'}
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
      {resetModalUserId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3>🔑 {lang === 'bn' ? 'নতুন ৪-সংখ্যার পিন দিন' : 'Set New 4-Digit PIN'}</h3>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              style={{ fontSize: '1.2rem', fontWeight: 'bold', padding: '0.5rem', borderRadius: '8px', border: '1px solid #ccc', letterSpacing: '0.2rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setResetModalUserId(null)}>
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const targetUser = users.find((u) => u.id === resetModalUserId)
                  if (targetUser) handleResetPin(targetUser.id, targetUser.name, targetUser.phone || targetUser.email)
                }}
              >
                {lang === 'bn' ? 'পিন আপডেট করুন' : 'Save PIN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
