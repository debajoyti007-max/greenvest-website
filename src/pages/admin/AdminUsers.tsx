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

  const [resettingPinId, setResettingPinId] = useState<string | null>(null)

  const [notifModalTarget, setNotifModalTarget] = useState<{ id: string | 'all'; name: string } | null>(null)
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMessage, setNotifMessage] = useState('')
  const [sendingNotif, setSendingNotif] = useState(false)

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  const isProtectedAdmin = (email: string) => email.toLowerCase().replace('@greenvest.shop', '@gmail.com').includes('debajoyti007')

  const handleResetPin = async (u: { id: string; name: string; phone?: string; email: string }) => {
    const inputPin = window.prompt(
      lang === 'bn'
        ? `${u.name}-এর জন্য নতুন ৪-সংখ্যার সিকিউরিটি পিন দিন:`
        : `Enter new 4-digit security PIN for ${u.name}:`,
      '1234',
    )
    if (!inputPin) return
    const cleanPin = inputPin.replace(/\D/g, '').slice(0, 4)
    if (cleanPin.length !== 4) {
      showToast(lang === 'bn' ? 'পিন অবশ্যই ৪ সংখ্যার হতে হবে' : 'PIN must be exactly 4 digits', '⚠️', 'error')
      return
    }

    setResettingPinId(u.id)
    try {
      await adminResetUserPin(u.id, cleanPin)

      // Send in-app notification to user
      sendNotification(
        u.id,
        lang === 'bn' ? '🔑 নতুন সিকিউরিটি পিন সেট করা হয়েছে' : '🔑 Security PIN Updated',
        lang === 'bn'
          ? `আপনার অ্যাকাউন্ট সিকিউরিটি পিন আপডেট করা হয়েছে। আপনার পিন: ${cleanPin}`
          : `Your account security PIN has been updated to: ${cleanPin}`,
      )

      showToast(
        lang === 'bn'
          ? `✅ ${u.name}-এর পিন আপডেট করা হয়েছে: ${cleanPin}`
          : `✅ PIN for ${u.name} updated to: ${cleanPin}`,
        '🔑',
      )

      // Optionally send WhatsApp
      const phoneStr = u.phone || u.email
      if (phoneStr) {
        const waDigits = formatWhatsAppPhone(phoneStr)
        const msg = encodeURIComponent(
          `নমস্কার ${u.name}, GreenVest-এ আপনার লগইন পিন আপডেট করা হয়েছে: ${cleanPin}\nলগইন করুন: https://greenvest.shop/auth`,
        )
        if (window.confirm(lang === 'bn' ? 'হোয়াটসঅ্যাপে গ্রাহককে জানাবেন?' : 'Notify customer via WhatsApp?')) {
          window.open(`https://wa.me/${waDigits}?text=${msg}`, '_blank')
        }
      }
    } finally {
      setResettingPinId(null)
    }
  }

  const handleSendNotification = async () => {
    if (!notifModalTarget || !notifMessage.trim()) {
      showToast(lang === 'bn' ? 'নোটিফিকেশন মেসেজ লিখুন' : 'Enter notification message', '⚠️', 'error')
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

                  {/* === ROLE BUTTONS === */}
                  {isProtectedAdmin(u.email) ? (
                    <span style={{ color: '#b45309', fontWeight: 700, fontSize: '0.8rem', background: '#fef3c7', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                      🛡️ {lang === 'bn' ? 'সুরক্ষিত সুপার অ্যাডমিন' : 'Protected Super Admin'}
                    </span>
                  ) : (
                    <>
                      {/* Make Admin / Revoke Admin */}
                      {u.role !== 'admin' ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}
                          onClick={async () => {
                            if (window.confirm(lang === 'bn' ? `${u.name}-কে অ্যাডমিন বানাবেন?` : `Make ${u.name} an Admin?`)) {
                              await setUserRole(u.id, 'admin' as Role)
                              showToast(lang === 'bn' ? `👑 ${u.name} এখন অ্যাডমিন!` : `👑 ${u.name} is now an Admin!`, '👑')
                            }
                          }}
                        >
                          👑 {lang === 'bn' ? 'অ্যাডমিন করুন' : 'Make Admin'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}
                          onClick={async () => {
                            if (window.confirm(lang === 'bn' ? `${u.name}-এর অ্যাডমিন রোল বাতিল করবেন?` : `Revoke Admin from ${u.name}?`)) {
                              await setUserRole(u.id, 'customer' as Role)
                              showToast(lang === 'bn' ? `${u.name} এখন কাস্টমার` : `${u.name} is now a Customer`, '👤')
                            }
                          }}
                        >
                          👑 {lang === 'bn' ? 'অ্যাডমিন বাতিল' : 'Revoke Admin'}
                        </button>
                      )}

                      {/* Seller Role Toggle */}
                      {u.role !== 'admin' && (
                        u.role !== 'seller' ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={async () => {
                              await setUserRole(u.id, 'seller')
                              showToast(lang === 'bn' ? `🏬 ${u.name} এখন সেলার!` : `🏬 ${u.name} is now a Seller!`, '🏬')
                            }}
                          >
                            {lang === 'bn' ? 'সেলার করুন' : 'Make Seller'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={async () => {
                              await setUserRole(u.id, 'customer' as Role)
                              showToast(lang === 'bn' ? `${u.name} এখন কাস্টমার` : `${u.name} is now a Customer`, '👤')
                            }}
                          >
                            {lang === 'bn' ? 'সেলার বাতিল' : 'Revoke Seller'}
                          </button>
                        )
                      )}

                      {/* Rider Role Toggle */}
                      {u.role !== 'admin' && (
                        u.role !== 'rider' ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={async () => {
                              await setUserRole(u.id, 'rider')
                              showToast(lang === 'bn' ? `🛵 ${u.name} এখন রাইডার!` : `🛵 ${u.name} is now a Rider!`, '🛵')
                            }}
                          >
                            🛵 {lang === 'bn' ? 'রাইডার করুন' : 'Make Rider'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={async () => {
                              await setUserRole(u.id, 'customer' as Role)
                              showToast(lang === 'bn' ? `${u.name} এখন কাস্টমার` : `${u.name} is now a Customer`, '👤')
                            }}
                          >
                            🛵 {lang === 'bn' ? 'রাইডার বাতিল' : 'Revoke Rider'}
                          </button>
                        )
                      )}

                      {/* 🔑 Reset PIN — auto-reset, no modal */}
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={resettingPinId === u.id}
                        onClick={() => void handleResetPin(u)}
                      >
                        {resettingPinId === u.id
                          ? (lang === 'bn' ? '⏳ রিসেট হচ্ছে...' : '⏳ Resetting...')
                          : (lang === 'bn' ? '🔑 পিন রিসেট' : '🔑 Reset PIN')}
                      </button>

                      {/* 🚫 Block / Unblock */}
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

      {/* PIN Reset Modal removed — now uses one-click auto-reset with notification */}
    </div>
  )
}
