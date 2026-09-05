import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { formatDisplayContact, isSuperAdmin } from '../../lib/business'
import { showToast } from '../../lib/toast'
import DatabaseCleaner from '../../components/admin/DatabaseCleaner'
import type { Role } from '../../types'

export default function AdminUsers() {
  const { user, users, setUserRole, adminResetUserPin, toggleBlockUser, deleteUser, refreshUsers, mode: dataMode } = useAuth()
  const {
    products,
    orders,
    lang,
    sendNotification,
    deleteOrder,
    updateOrderStatus,
    refresh,
  } = useStore()

  useEffect(() => {
    void refreshUsers()
    void refresh()
  }, [refreshUsers, refresh])

  const [adminTab, setAdminTab] = useState<'users' | 'database'>('users')
  const [resettingPinId, setResettingPinId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActionBusy, setBulkActionBusy] = useState(false)

  const [notifModalTarget, setNotifModalTarget] = useState<{ id: string | 'all' | 'bulk'; name: string } | null>(null)
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMessage, setNotifMessage] = useState('')
  const [sendingNotif, setSendingNotif] = useState(false)

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  // 🕶️ Shadow Super Admin: Cloaked from all other admins
  const isViewerSuperAdmin = isSuperAdmin(user)
  const displayedUsers = users.filter((u) => {
    if (!isViewerSuperAdmin && isSuperAdmin(u)) return false
    return true
  })

  const isProtectedAdmin = (u: any) => isSuperAdmin(u)

  const handleResetPin = async (u: { id: string; name: string; phone?: string; email: string }) => {
    const inputPin = window.prompt(
      lang === 'bn'
        ? `${u.name}-এর জন্য নতুন ৪-সংখ্যার সিকিউরিটি পিন দিন:`
        : `Enter new 4-digit security PIN for ${u.name}:`,
      '1234'
    )
    if (!inputPin) return
    const cleanPin = inputPin.replace(/\D/g, '').slice(0, 4)
    if (cleanPin.length !== 4) {
      showToast(
        lang === 'bn' ? 'পিন অবশ্যই ৪ সংখ্যার হতে হবে' : 'PIN must be exactly 4 digits',
        '⚠️',
        'error'
      )
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
          : `Your account security PIN has been updated to: ${cleanPin}`
      )

      showToast(
        lang === 'bn'
          ? `✅ ${u.name}-এর পিন আপডেট করা হয়েছে: ${cleanPin}`
          : `✅ PIN for ${u.name} updated to: ${cleanPin}`,
        '🔑'
      )

      // Send In-App Notification & Copy PIN
      if (u.id) {
        await sendNotification(
          u.id,
          lang === 'bn' ? '🔐 অ্যাকাউন্ট পিন আপডেট' : '🔐 Account PIN Updated',
          lang === 'bn' ? `আপনার নতুন পিন: ${cleanPin}` : `Your new login PIN is: ${cleanPin}`,
          'GreenVest Security'
        )
      }
      try {
        await navigator.clipboard.writeText(`Customer: ${u.name} | PIN: ${cleanPin}`)
      } catch {}
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
      if (notifModalTarget.id === 'bulk') {
        for (const uid of Array.from(selectedIds)) {
          await sendNotification(
            uid,
            notifTitle.trim() || (lang === 'bn' ? 'অ্যাডমিন আপডেট' : 'Admin Update'),
            notifMessage.trim(),
            'GreenVest Admin'
          )
        }
        showToast(
          lang === 'bn'
            ? `${selectedIds.size} জন ইউজারকে নোটিফিকেশন পাঠানো হয়েছে`
            : `Notification sent to ${selectedIds.size} users`,
          '📢'
        )
      } else {
        await sendNotification(
          notifModalTarget.id,
          notifTitle.trim() || (lang === 'bn' ? 'অ্যাডমিন আপডেট' : 'Admin Update'),
          notifMessage.trim(),
          'GreenVest Admin'
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
    <div className="page admin-page">
      <div
        className="page-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1>{lang === 'bn' ? 'অ্যাডমিন ড্যাশবোর্ড' : 'Admin Control Dashboard'}</h1>
          <p className="subtle" style={{ margin: '0.25rem 0 0' }}>
            {lang === 'bn'
              ? 'ইউজার সিকিউরিটি, রোল ম্যানেজমেন্ট ও স্মার্ট ডেটাবেস রক্ষণাবেক্ষণ'
              : 'User security, role management & smart database maintenance'}
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setNotifModalTarget({
              id: 'all',
              name: lang === 'bn' ? 'সকল কাস্টমার (Broadcast)' : 'All Users (Broadcast)',
            })
            setNotifTitle(lang === 'bn' ? 'জরুরি অ্যানাউন্সমেন্ট' : 'Important Announcement')
            setNotifMessage('')
          }}
        >
          📢 {lang === 'bn' ? 'সবাইকে মেসেজ দিন (Broadcast)' : 'Broadcast to All Users'}
        </button>
      </div>

      {/* 🧭 Admin Tab Switcher */}
      <div
        className="admin-tab-nav"
        style={{
          display: 'flex',
          gap: '0.5rem',
          margin: '1.25rem 0',
          borderBottom: '1.5px solid #e5e7eb',
          paddingBottom: '0.5rem',
        }}
      >
        <button
          type="button"
          className={`btn btn-sm ${adminTab === 'users' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setAdminTab('users')}
          style={{ borderRadius: '8px' }}
        >
          👥 {lang === 'bn' ? 'ইউজার ও সিকিউরিটি' : 'Users & Security'} ({users.length})
        </button>

        <button
          type="button"
          className={`btn btn-sm ${adminTab === 'database' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setAdminTab('database')}
          style={{ borderRadius: '8px' }}
        >
          📊 {lang === 'bn' ? 'স্মার্ট ডেটাবেস ক্লিনার ও হেলথ' : 'Smart Database Cleaner & Health'}
        </button>
      </div>

      {adminTab === 'database' ? (
        /* 📊 Tab 2: Database Cleaner & Health */
        <DatabaseCleaner
          orders={orders}
          users={users}
          products={products}
          lang={lang}
          deleteOrder={deleteOrder}
          updateOrderStatus={updateOrderStatus}
          onRefresh={refresh}
        />
      ) : (
        /* 👥 Tab 1: Users & Security */
        <>
          <div className="dash-grid admin-health">
            <div className="stat">
              <span>{lang === 'bn' ? 'ইউজার' : 'Users'}</span>
              <strong>{displayedUsers.length}</strong>
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
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={
                        displayedUsers.filter((u) => !isSuperAdmin(u)).length > 0 &&
                        selectedIds.size === displayedUsers.filter((u) => !isSuperAdmin(u)).length
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(displayedUsers.filter((u) => !isSuperAdmin(u)).map((u) => u.id)))
                        } else {
                          setSelectedIds(new Set())
                        }
                      }}
                      title={lang === 'bn' ? 'সব নির্বাচন করুন' : 'Select All'}
                      style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                    />
                  </th>
                  <th>{lang === 'bn' ? 'নাম' : 'Name'}</th>
                  <th>{lang === 'bn' ? 'ফোন / যোগাযোগ' : 'Phone / Contact'}</th>
                  <th>{lang === 'bn' ? 'রোল' : 'Role'}</th>
                  <th>{lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
                  <th>{lang === 'bn' ? 'অ্যাকশন' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {displayedUsers.map((u) => (
                  <tr key={u.id} style={{ background: selectedIds.has(u.id) ? '#f0f9ff' : isSuperAdmin(u) ? '#f8fafc' : undefined }}>
                    <td style={{ textAlign: 'center' }}>
                      {isSuperAdmin(u) ? (
                        <span title={lang === 'bn' ? 'শ্যাডো সুপার অ্যাডমিন' : 'Shadow Super Admin'} style={{ fontSize: '1rem', cursor: 'default' }}>🕶️</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(u.id)}
                          onChange={(e) => {
                            const next = new Set(selectedIds)
                            if (e.target.checked) next.add(u.id)
                            else next.delete(u.id)
                            setSelectedIds(next)
                          }}
                          style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                        />
                      )}
                    </td>
                    <td>
                      <strong>{u.name}</strong>
                      {isSuperAdmin(u) && (
                        <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>
                          🕶️ {lang === 'bn' ? 'অন্য অ্যাডমিনদের কাছে সম্পূর্ণ অদৃশ্য' : 'Cloaked from other admins'}
                        </span>
                      )}
                    </td>
                    <td>{formatDisplayContact(u.email, u.phone)}</td>
                    <td>
                      {isSuperAdmin(u) ? (
                        <span
                          style={{
                            background: '#0f172a',
                            color: '#38bdf8',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            border: '1px solid #334155',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          🕶️ {lang === 'bn' ? 'শ্যাডো অ্যাডমিন' : 'Shadow Admin'}
                        </span>
                      ) : (
                        <span className={`role-pill role-${u.role}`}>{u.role}</span>
                      )}
                    </td>
                    <td>
                      {u.isBlocked ? (
                        <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.85rem' }}>
                          🚫 {lang === 'bn' ? 'ব্লকড' : 'Blocked'}
                        </span>
                      ) : (
                        <span style={{ color: '#166534', fontSize: '0.85rem' }}>
                          ✅ {lang === 'bn' ? 'সক্রিয়' : 'Active'}
                        </span>
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
                        <span
                          style={{
                            color: '#b45309',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            background: '#fef3c7',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                          }}
                        >
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
                                if (
                                  window.confirm(
                                    lang === 'bn'
                                      ? `${u.name}-কে অ্যাডমিন বানাবেন?`
                                      : `Make ${u.name} an Admin?`
                                  )
                                ) {
                                  const res = await setUserRole(u.id, 'admin' as Role)
                                  if (res && !res.ok) {
                                    showToast(`⚠️ Database error: ${res.error}`, '❌', 'error')
                                  } else {
                                    showToast(
                                      lang === 'bn'
                                        ? `👑 ${u.name} এখন অ্যাডমিন!`
                                        : `👑 ${u.name} is now an Admin!`,
                                      '👑',
                                    )
                                  }
                                }
                              }}
                            >
                              👑 {lang === 'bn' ? 'অ্যাডমিন বানান' : 'Make Admin'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: '#dc2626' }}
                              onClick={async () => {
                                if (
                                  window.confirm(
                                    lang === 'bn'
                                      ? `${u.name}-এর অ্যাডমিন রোল বাতিল করবেন?`
                                      : `Revoke Admin from ${u.name}?`,
                                  )
                                ) {
                                  const res = await setUserRole(u.id, 'customer' as Role)
                                  if (res && !res.ok) {
                                    showToast(`⚠️ Database error: ${res.error}`, '❌', 'error')
                                  } else {
                                    showToast(
                                      lang === 'bn'
                                        ? `${u.name}-এর অ্যাডমিন বাতিল হয়েছে`
                                        : `Revoked Admin from ${u.name}`,
                                      'ℹ️',
                                    )
                                  }
                                }
                              }}
                            >
                              {lang === 'bn' ? 'অ্যাডমিন বাতিল' : 'Revoke Admin'}
                            </button>
                          )}

                          {/* Make Seller / Revoke Seller */}
                          {u.role !== 'seller' ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={async () => {
                                if (
                                  window.confirm(
                                    lang === 'bn'
                                      ? `${u.name}-কে সেলার বানাবেন?`
                                      : `Make ${u.name} a Seller?`
                                  )
                                ) {
                                  const res = await setUserRole(u.id, 'seller' as Role)
                                  if (res && !res.ok) {
                                    showToast(`⚠️ Database error: ${res.error}`, '❌', 'error')
                                  } else {
                                    void sendNotification(
                                      u.id,
                                      lang === 'bn' ? '🏪 সেলার রোল সক্রিয়' : '🏪 Seller Access Granted',
                                      lang === 'bn'
                                        ? 'অভিনন্দন! আপনাকে GreenVest-এ সেলার অ্যাক্সেস প্রদান করা হয়েছে।'
                                        : 'Congratulations! You have been granted Seller access on GreenVest.'
                                    )
                                    showToast(
                                      lang === 'bn'
                                        ? `🏪 ${u.name} এখন সেলার!`
                                        : `🏪 ${u.name} is now a Seller!`,
                                      '🏪'
                                    )
                                  }
                                }
                              }}
                            >
                              🏪 {lang === 'bn' ? 'সেলার বানান' : 'Make Seller'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={async () => {
                                if (
                                  window.confirm(
                                    lang === 'bn'
                                      ? `${u.name}-এর সেলার রোল বাতিল করবেন?`
                                      : `Revoke Seller from ${u.name}?`
                                  )
                                ) {
                                  const res = await setUserRole(u.id, 'customer' as Role)
                                  if (res && !res.ok) {
                                    showToast(`⚠️ Database error: ${res.error}`, '❌', 'error')
                                  } else {
                                    showToast(
                                      lang === 'bn'
                                        ? `${u.name}-এর সেলার বাতিল হয়েছে`
                                        : `Revoked Seller from ${u.name}`,
                                      'ℹ️'
                                    )
                                  }
                                }
                              }}
                            >
                              {lang === 'bn' ? 'সেলার বাতিল' : 'Revoke Seller'}
                            </button>
                          )}

                          {/* Make Rider / Revoke Rider */}
                          {u.role !== 'rider' ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #86efac' }}
                              onClick={async () => {
                                if (
                                  window.confirm(
                                    lang === 'bn'
                                      ? `${u.name}-কে রাইডার বানাবেন?`
                                      : `Make ${u.name} a Delivery Rider?`
                                  )
                                ) {
                                  const res = await setUserRole(u.id, 'rider' as Role)
                                  if (res && !res.ok) {
                                    showToast(`⚠️ Database error: ${res.error}`, '❌', 'error')
                                  } else {
                                    showToast(
                                      lang === 'bn'
                                        ? `🛵 ${u.name} এখন ডেলিভারি রাইডার!`
                                        : `🛵 ${u.name} is now a Delivery Rider!`,
                                      '🛵'
                                    )
                                  }
                                }
                              }}
                            >
                              🛵 {lang === 'bn' ? 'রাইডার বানান' : 'Make Rider'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={async () => {
                                if (
                                  window.confirm(
                                    lang === 'bn'
                                      ? `${u.name}-এর রাইডার রোল বাতিল করবেন?`
                                      : `Revoke Rider from ${u.name}?`
                                  )
                                ) {
                                  const res = await setUserRole(u.id, 'customer' as Role)
                                  if (res && !res.ok) {
                                    showToast(`⚠️ Database error: ${res.error}`, '❌', 'error')
                                  } else {
                                    showToast(
                                      lang === 'bn'
                                        ? `${u.name}-এর রাইডার বাতিল হয়েছে`
                                        : `Revoked Rider from ${u.name}`,
                                      'ℹ️'
                                    )
                                  }
                                }
                              }}
                            >
                              {lang === 'bn' ? 'রাইডার বাতিল' : 'Revoke Rider'}
                            </button>
                          )}

                          {/* 🔑 Reset PIN Button */}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}
                            disabled={resettingPinId === u.id}
                            onClick={() => handleResetPin(u)}
                          >
                            🔑 {resettingPinId === u.id ? '...' : lang === 'bn' ? 'পিন রিসেট' : 'Reset PIN'}
                          </button>

                          {/* 🚫 Block / Unblock User */}
                          <button
                            type="button"
                            className={`btn btn-sm ${u.isBlocked ? 'btn-primary' : 'btn-secondary'}`}
                            style={{
                              background: u.isBlocked ? '#166534' : '#fff1f2',
                              color: u.isBlocked ? '#fff' : '#e11d48',
                              border: u.isBlocked ? 'none' : '1px solid #fecdd3',
                            }}
                            onClick={async () => {
                              const action = u.isBlocked
                                ? lang === 'bn'
                                  ? 'আনব্লক'
                                  : 'unblock'
                                : lang === 'bn'
                                  ? 'ব্লক'
                                  : 'block'
                              if (
                                window.confirm(
                                  lang === 'bn'
                                    ? `আপনি কি নিশ্চিত ${u.name}-কে ${action} করবেন?`
                                    : `Are you sure you want to ${action} ${u.name}?`
                                )
                              ) {
                                await toggleBlockUser(u.id, !u.isBlocked)
                                showToast(
                                  lang === 'bn'
                                    ? `ইউজার ${action} সফল হয়েছে`
                                    : `User ${action}ed successfully`,
                                  u.isBlocked ? '✅' : '🚫'
                                )
                              }
                            }}
                          >
                            {u.isBlocked
                              ? lang === 'bn'
                                ? '🔓 আনব্লক'
                                : '🔓 Unblock'
                              : lang === 'bn'
                                ? '🚫 ব্লক'
                                : '🚫 Block'}
                          </button>

                          {/* 🗑️ Delete User Button */}
                          {user?.id !== u.id && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }}
                              onClick={async () => {
                                const confirmMsg = lang === 'bn'
                                  ? `আপনি কি নিশ্চিত যে ${u.name}-কে স্থায়ীভাবে মুছে ফেলবেন?`
                                  : `Are you sure you want to permanently delete user "${u.name}"?`
                                if (!window.confirm(confirmMsg)) return
                                const res = await deleteUser(u.id)
                                if (!res.ok) {
                                  showToast(res.error || 'Delete failed', '⚠️', 'error')
                                } else {
                                  showToast(lang === 'bn' ? `${u.name}-কে মুছে ফেলা হয়েছে` : `Deleted ${u.name}`, '🗑️')
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev)
                                    next.delete(u.id)
                                    return next
                                  })
                                }
                              }}
                            >
                              🗑️ {lang === 'bn' ? 'মুছুন' : 'Delete'}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 👥 Floating Multi-User Bulk Action Bar */}
          {selectedIds.size > 0 && (
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
                  {selectedIds.size} {lang === 'bn' ? 'জন নির্বাচিত' : 'Selected'}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
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
                {/* 📩 Bulk Notification */}
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ background: '#2563eb', color: 'white', border: 'none', fontSize: '0.8rem', fontWeight: 600 }}
                  onClick={() => {
                    setNotifModalTarget({ id: 'bulk', name: `${selectedIds.size} Users` })
                    setNotifTitle(lang === 'bn' ? 'জরুরি বিজ্ঞপ্তি' : 'Important Announcement')
                    setNotifMessage('')
                  }}
                >
                  📩 {lang === 'bn' ? 'সবাইকে মেসেজ' : 'Message All'}
                </button>

                {/* Role Assign Dropdown */}
                <select
                  defaultValue=""
                  disabled={bulkActionBusy}
                  onChange={async (e) => {
                    const role = e.target.value as Role
                    if (!role) return
                    if (!window.confirm(lang === 'bn' ? `নির্বাচিত ${selectedIds.size} জনের রোল "${role}" করবেন?` : `Change role of ${selectedIds.size} users to "${role}"?`)) {
                      e.target.value = ''
                      return
                    }
                    setBulkActionBusy(true)
                    let count = 0
                    for (const id of Array.from(selectedIds)) {
                      const res = await setUserRole(id, role)
                      if (res?.ok) count++
                    }
                    setBulkActionBusy(false)
                    e.target.value = ''
                    showToast(lang === 'bn' ? `${count} জনের রোল পরিবর্তিত হয়েছে` : `Updated ${count} users to ${role}`, '👑')
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
                  <option value="" disabled>{lang === 'bn' ? '👑 রোল পরিবর্তন...' : '👑 Change Role...'}</option>
                  <option value="customer">👤 Customer</option>
                  <option value="seller">🏪 Seller</option>
                  <option value="rider">🛵 Rider</option>
                  <option value="admin">👑 Admin</option>
                </select>

                {/* Bulk Block */}
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={bulkActionBusy}
                  style={{ background: '#dc2626', color: 'white', border: 'none', fontSize: '0.8rem', fontWeight: 600 }}
                  onClick={async () => {
                    if (!window.confirm(lang === 'bn' ? `নির্বাচিত ${selectedIds.size} জনকে ব্লক করবেন?` : `Block all ${selectedIds.size} selected users?`)) return
                    setBulkActionBusy(true)
                    for (const id of Array.from(selectedIds)) {
                      await toggleBlockUser(id, true)
                    }
                    setBulkActionBusy(false)
                    showToast(lang === 'bn' ? 'ইউজারদের ব্লক করা হয়েছে' : 'Selected users blocked', '🚫')
                  }}
                >
                  🚫 {lang === 'bn' ? 'ব্লক করুন' : 'Block All'}
                </button>

                {/* Bulk Delete */}
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={bulkActionBusy}
                  style={{ background: '#991b1b', color: 'white', border: 'none', fontSize: '0.8rem', fontWeight: 600 }}
                  onClick={async () => {
                    if (!window.confirm(lang === 'bn' ? `সাবধান! নির্বাচিত ${selectedIds.size} জনকে মুছে ফেলতে চান? (যেসব অ্যাকাউন্টে বকেয়া বা সক্রিয় অর্ডার আছে সেগুলো মোছা হবে না)` : `Caution: Permanently delete ${selectedIds.size} selected accounts? (Accounts with active orders or dues will be safely skipped)`)) return
                    setBulkActionBusy(true)
                    let deleted = 0
                    let skipped = 0
                    for (const id of Array.from(selectedIds)) {
                      const res = await deleteUser(id)
                      if (res.ok) deleted++
                      else skipped++
                    }
                    setBulkActionBusy(false)
                    setSelectedIds(new Set())
                    showToast(
                      lang === 'bn'
                        ? `${deleted} জন মোছা হয়েছে${skipped > 0 ? ` (${skipped} জন বাদ রাখা হয়েছে)` : ''}`
                        : `Deleted ${deleted} users${skipped > 0 ? ` (${skipped} skipped due to dues/orders)` : ''}`,
                      '🗑️'
                    )
                  }}
                >
                  🗑️ {lang === 'bn' ? 'মুছে ফেলুন' : 'Delete All'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 📢 Send Notification Modal */}
      {notifModalTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '450px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <h3 style={{ margin: 0 }}>
              📢{' '}
              {lang === 'bn'
                ? `${notifModalTarget.name}-কে লাইভ নোটিফিকেশন পাঠান`
                : `Send Live Notification to ${notifModalTarget.name}`}
            </h3>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {lang === 'bn' ? 'শিরোনাম (Title):' : 'Title:'}
              <input
                type="text"
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                placeholder={lang === 'bn' ? 'যেমন: বিশেষ বিবরণ বা আপডেট' : 'e.g. Special Details or Update'}
                style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #ccc' }}
              />
            </label>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {lang === 'bn' ? 'নোটিফিকেশন মেসেজ (Message):' : 'Notification Message:'}
              <textarea
                rows={4}
                value={notifMessage}
                onChange={(e) => setNotifMessage(e.target.value)}
                placeholder={lang === 'bn' ? 'আপনার মেসেজ লিখুন...' : 'Write your message here...'}
                style={{
                  padding: '0.5rem',
                  borderRadius: '8px',
                  border: '1px solid #ccc',
                  resize: 'vertical',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setNotifModalTarget(null)}>
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSendNotification}
                disabled={sendingNotif}
              >
                {sendingNotif ? '...' : lang === 'bn' ? '📢 পাঠান' : '📢 Send Notification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
