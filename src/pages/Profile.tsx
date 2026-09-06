import { useEffect, useState, useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useStore } from '../context/useStore'
import { supabase } from '../lib/supabase'
import { saveDelivery } from '../lib/storage'
import { showToast } from '../lib/toast'
import { validatePhoneStrict } from '../lib/validation'
import { UPI_ID } from '../lib/business'
import type { Address } from '../types'

export default function Profile() {
  const { user, logout, updateUserProfile, updatePassword } = useAuth()
  const { orders, fetchAddresses, saveAddress, deleteAddress, lang, setLang, getUserKhataBalance, khataEntries, safeCloudSync } = useStore()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [loadingAddrs, setLoadingAddrs] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [editingPhone, setEditingPhone] = useState(false)
  const [nameVal, setNameVal] = useState('')
  const [phoneVal, setPhoneVal] = useState('')
  const [saving, setSaving] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addrInput, setAddrInput] = useState('')

  const [showPinForm, setShowPinForm] = useState(false)
  const [newPinVal, setNewPinVal] = useState('')
  const [copiedRef, setCopiedRef] = useState(false)

  const referralCode = useMemo(() => {
    if (!user) return 'GV-2026'
    const phoneDigits = (user.phone || '').replace(/\D/g, '').slice(-4)
    if (phoneDigits.length === 4) return `GV-${phoneDigits}`
    const idDigits = (user.id || '').replace(/\D/g, '').slice(-4) || '2026'
    return `GV-${idDigits}`
  }, [user])

  const handleCopyReferral = async () => {
    try {
      await navigator.clipboard.writeText(referralCode)
      setCopiedRef(true)
      showToast(lang === 'bn' ? 'রেফারেল কোড কপি হয়েছে!' : 'Referral code copied!', '🎉')
      setTimeout(() => setCopiedRef(false), 2500)
    } catch {
      showToast('Copy failed', 'error')
    }
  }

  const referralShareUrl = `https://greenvest.shop/?ref=${referralCode}`
  const referralMsg = lang === 'bn'
    ? `🌿 GreenVest থেকে তাজা সবজি ও আলু-পটল কিনুন! আমার রেফার কোড ${referralCode} ব্যবহার করলে পাবেন ₹৫০ ছাড়! এখনই অর্ডার করুন: ${referralShareUrl}`
    : `🌿 Buy fresh vegetables & essentials on GreenVest! Use my referral code ${referralCode} to get ₹50 OFF your first order: ${referralShareUrl}`
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(referralMsg)}`

  useEffect(() => {
    if (user) {
      setNameVal(user.name)
      const ph = user.phone || (user.email.endsWith('@greenvest.shop') ? user.email.replace('@greenvest.shop', '') : '')
      setPhoneVal(ph)
      setLoadingAddrs(true)
      fetchAddresses(user.id)
        .then(setAddresses)
        .catch(console.error)
        .finally(() => setLoadingAddrs(false))
    }
  }, [user, fetchAddresses])

  const handleSaveName = async () => {
    if (!user || !nameVal.trim()) return
    setSaving(true)
    try {
      await updateUserProfile({ name: nameVal.trim() })
      setEditingName(false)
      showToast(lang === 'bn' ? '✅ নাম সফলভাবে সেভ হয়েছে' : '✅ Name updated successfully', '🎉')
    } catch {
      showToast(lang === 'bn' ? 'আপডেট ব্যর্থ হয়েছে' : 'Update failed. Please try again.', '❌', 'error')
    }
    setSaving(false)
  }

  const handleSavePhone = async () => {
    if (!user || !phoneVal.trim()) return
    const check = validatePhoneStrict(phoneVal)
    if (!check.isValid) {
      showToast(lang === 'bn' ? check.errorBn : check.errorEn, '⚠️', 'error')
      return
    }
    setSaving(true)
    try {
      await updateUserProfile({ phone: check.cleanedValue })
      setEditingPhone(false)
      showToast(lang === 'bn' ? '✅ মোবাইল নম্বর সেভ হয়েছে' : '✅ Phone number saved', '🎉')
    } catch {
      showToast(lang === 'bn' ? 'আপডেট ব্যর্থ হয়েছে' : 'Update failed. Please try again.', '❌', 'error')
    }
    setSaving(false)
  }

  const handleUpdateMyPin = async () => {
    if (!user || newPinVal.length !== 4 || /\D/.test(newPinVal)) {
      showToast(lang === 'bn' ? '৪ সংখ্যার পিন দিন' : 'PIN must be 4 digits', '⚠️', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await updatePassword(newPinVal)
      if (res.ok) {
        showToast(lang === 'bn' ? '🔑 আপনার নতুন ৪-সংখ্যার পিন সেভ হয়েছে!' : '🔑 New 4-digit PIN saved!', '🎉')
        setNewPinVal('')
        setShowPinForm(false)
      } else {
        showToast(res.error || (lang === 'bn' ? 'পিন আপডেট ব্যর্থ হয়েছে' : 'PIN update failed'), '❌', 'error')
      }
    } catch (err: any) {
      showToast(err?.message || (lang === 'bn' ? 'পিন আপডেট ব্যর্থ হয়েছে' : 'PIN update failed'), '❌', 'error')
    }
    setSaving(false)
  }

  const handleSaveAddress = async () => {
    if (!user || !addrInput.trim()) return
    setSaving(true)
    try {
      await saveAddress({
        user_id: user.id,
        label: 'Home Delivery',
        address: addrInput.trim(),
        phone: phoneVal || user.phone || '',
        pin: '721632',
        is_default: true,
      })
      saveDelivery(user.id, { address: addrInput.trim(), phone: phoneVal || user.phone || '', pin: '721632' })
      const updated = await fetchAddresses(user.id)
      setAddresses(updated)
      setAddrInput('')
      setShowAddForm(false)
    } catch {
      showToast(lang === 'bn' ? 'ঠিকানা আপডেট ব্যর্থ হয়েছে' : 'Address save failed', '❌', 'error')
    }
    setSaving(false)
  }

  const handleDeleteAddress = async (id?: number) => {
    if (!id) return
    if (!window.confirm(lang === 'bn' ? 'ঠিকানা মুছে ফেলবেন?' : 'Delete this address?')) return
    await deleteAddress(id)
    if (user) {
      const updated = await fetchAddresses(user.id)
      setAddresses(updated)
    }
  }

  const handleSafeSync = async () => {
    setIsSyncing(true)
    try {
      await safeCloudSync()
      showToast(
        lang === 'bn'
          ? '✅ ক্লাউড সিঙ্ক সম্পন্ন! তাজা দাম ও অর্ডার আপডেট হয়েছে।'
          : '✅ Synced with GreenVest Cloud! Latest data updated.',
        '🔄',
      )
    } catch {
      showToast(lang === 'bn' ? 'সিঙ্ক করতে সমস্যা হয়েছে' : 'Sync failed', '⚠️', 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  const { totalOrders, totalSpent, mostOrderedItem, avgOrderValue } = useMemo(() => {
    if (!user) return { totalOrders: 0, totalSpent: 0, mostOrderedItem: '-', avgOrderValue: 0 }
    const userOrders = orders.filter(o => o.userId === user.id)
    const validOrders = userOrders.filter(o => o.status !== 'cancelled')
    const totalOrders = userOrders.length
    const totalSpent = validOrders.reduce((sum, o) => sum + o.total, 0)
    const avgOrderValue = validOrders.length > 0 ? Math.round(totalSpent / validOrders.length) : 0

    const itemCounts: Record<string, number> = {}
    validOrders.forEach(o => {
      o.items.forEach(item => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.qty
      })
    })
    let mostOrderedItem = '-'
    let maxQty = 0
    for (const [name, qty] of Object.entries(itemCounts)) {
      if (qty > maxQty) { maxQty = qty; mostOrderedItem = name }
    }
    return { totalOrders, totalSpent, mostOrderedItem, avgOrderValue }
  }, [user, orders])

  const recentOrders = useMemo(() => {
    if (!user) return []
    return orders
      .filter(o => o.userId === user.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
  }, [user, orders])

  if (!user) return <Navigate to="/auth" replace />

  const phone = user.phone || (user.email.endsWith('@greenvest.shop') ? user.email.replace('@greenvest.shop', '') : '')
  const memberDays = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))

  const cardStyle: React.CSSProperties = {
    background: '#ffffff',
    padding: '1.25rem',
    borderRadius: '16px',
    border: '1px solid #f1f5f9',
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
  }
  const statStyle: React.CSSProperties = { ...cardStyle, textAlign: 'center' as const, padding: '1rem 0.75rem' }
  const labelStyle: React.CSSProperties = { fontSize: '0.76rem', fontWeight: 600, color: '#64748b', marginTop: '0.25rem' }
  const valueStyle: React.CSSProperties = { fontSize: '1.4rem', fontWeight: 800, color: '#166534' }

  return (
    <div className="page narrow" style={{ padding: '0.75rem 1rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <section style={{ ...cardStyle, display: 'flex', gap: '1.25rem', alignItems: 'center', padding: '1.25rem 1.5rem' }}>
        <div style={{
          width: '68px', height: '68px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #166534, #22c55e)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.8rem', fontWeight: 800, textTransform: 'uppercase', flexShrink: 0,
          boxShadow: '0 4px 14px rgba(22, 101, 52, 0.3)',
          border: '2px solid #ffffff',
        }}>
          {user.name.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Editable Name */}
          {editingName ? (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input value={nameVal} onChange={e => setNameVal(e.target.value)} style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--line)' }} />
              <button onClick={handleSaveName} disabled={saving} style={{ padding: '4px 12px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                {saving ? '...' : '✓'}
              </button>
              <button onClick={() => { setEditingName(false); setNameVal(user.name) }} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid var(--line)', borderRadius: '6px', cursor: 'pointer' }}>✕</button>
            </div>
          ) : (
            <h2 style={{ margin: '0 0 0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
              <span onClick={() => setEditingName(true)} style={{ cursor: 'pointer', fontSize: '0.9rem', marginLeft: '0.5rem', opacity: 0.6 }}>✏️</span>
            </h2>
          )}

          {/* Editable Phone */}
          {editingPhone ? (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input value={phoneVal} onChange={e => setPhoneVal(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--line)' }} />
              <button onClick={handleSavePhone} disabled={saving} style={{ padding: '4px 12px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                {saving ? '...' : '✓'}
              </button>
              <button onClick={() => { setEditingPhone(false); setPhoneVal(phone) }} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid var(--line)', borderRadius: '6px', cursor: 'pointer' }}>✕</button>
            </div>
          ) : (
            <div style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
              📱 {phone || 'No phone'}
              <span onClick={() => setEditingPhone(true)} style={{ cursor: 'pointer', fontSize: '0.85rem', marginLeft: '0.5rem', opacity: 0.6 }}>✏️</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.8rem', marginTop: '0.4rem' }}>
            <span style={{ background: 'linear-gradient(135deg, #166534, #22c55e)', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '12px', textTransform: 'capitalize' }}>
              {user.role}
            </span>
            <span style={{ background: '#f0fdf4', color: '#166534', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
              {memberDays === 0 ? (lang === 'bn' ? 'আজ যোগ দিয়েছেন' : 'Joined today') : (lang === 'bn' ? `${memberDays} দিন আগে যোগ দিয়েছেন` : `${memberDays} days`)}
            </span>
          </div>
        </div>
      </section>

      {/* Order Stats */}
      <section>
        <h3 style={{ margin: '0 0 0.75rem' }}>{lang === 'bn' ? '📊 অর্ডার পরিসংখ্যান' : '📊 Order Stats'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          <div style={statStyle}>
            <div style={valueStyle}>{totalOrders}</div>
            <div style={labelStyle}>{lang === 'bn' ? 'মোট অর্ডার' : 'Total Orders'}</div>
          </div>
          <div style={statStyle}>
            <div style={valueStyle}>₹{totalSpent}</div>
            <div style={labelStyle}>{lang === 'bn' ? 'মোট খরচ' : 'Total Spent'}</div>
          </div>
          <div style={statStyle}>
            <div style={valueStyle}>₹{avgOrderValue}</div>
            <div style={labelStyle}>{lang === 'bn' ? 'গড় অর্ডার' : 'Avg Order'}</div>
          </div>
          <div style={statStyle}>
            <div style={{ ...valueStyle, fontSize: '1.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mostOrderedItem}>{mostOrderedItem}</div>
            <div style={labelStyle}>{lang === 'bn' ? 'সবচেয়ে বেশি' : 'Most Ordered'}</div>
          </div>
        </div>
      </section>

      {/* 🤝 Refer & Earn ₹50 Card */}
      {user && (
        <section style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          border: '1.5px solid #86efac',
          borderRadius: '16px',
          padding: '1.2rem',
          boxShadow: '0 4px 16px rgba(22, 101, 52, 0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🤝</span>
            <h3 style={{ margin: 0, color: '#166534', fontSize: '1.05rem' }}>
              {lang === 'bn' ? 'প্রতিবেশীকে রেফার করুন — পান ₹৫০ ছাড়!' : 'Refer a Neighbor — Get ₹50 OFF!'}
            </h3>
          </div>
          <p style={{ margin: '0 0 0.85rem', fontSize: '0.84rem', color: '#166534', lineHeight: 1.4 }}>
            {lang === 'bn'
              ? 'আপনার বন্ধু বা প্রতিবেশীকে GreenVest-এ আমন্ত্রণ জানান। তারা প্রথম অর্ডারে পাবেন ₹৫০ ছাড়, আর তাদের ডেলিভারির পর আপনার অ্যাকাউন্টেও মিলবে ₹৫০ ছাড়ের কুপন!'
              : 'Invite friends or neighbors to GreenVest. They get ₹50 OFF their first order, and you get ₹50 OFF after their delivery!'}
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            border: '1.5px dashed #22c55e',
            borderRadius: '12px',
            padding: '0.6rem 0.9rem',
            marginBottom: '0.75rem',
          }}>
            <div>
              <span style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                {lang === 'bn' ? 'আপনার রেফার কোড' : 'Your Referral Code'}
              </span>
              <strong style={{ fontSize: '1.15rem', color: '#15803d', letterSpacing: '0.05rem' }}>
                {referralCode}
              </strong>
            </div>
            <button
              type="button"
              onClick={handleCopyReferral}
              style={{
                padding: '5px 12px',
                background: copiedRef ? '#15803d' : '#f0fdf4',
                color: copiedRef ? '#ffffff' : '#15803d',
                border: '1px solid #86efac',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              {copiedRef ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>

          <a
            href={whatsappShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: '#25D366',
              border: 'none',
              color: '#ffffff',
              fontWeight: 700,
              textDecoration: 'none',
              padding: '0.6rem 1rem',
              borderRadius: '10px',
            }}
          >
            💬 {lang === 'bn' ? 'হোয়াটসঅ্যাপে বন্ধুদের শেয়ার করুন' : 'Share on WhatsApp'}
          </a>
        </section>
      )}

      {/* 📒 Digital Khata Passbook & Customer Tier */}
      {user && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              📒 {lang === 'bn' ? 'আমার ডিজিটাল খাতা বুক' : 'My Digital Khata Book'}
            </h3>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                background: user.tier === 'wholesale' ? '#fef3c7' : user.tier === 'vip' ? '#dbeafe' : '#f1f5f9',
                color: user.tier === 'wholesale' ? '#92400e' : user.tier === 'vip' ? '#1e40af' : '#475569',
              }}
            >
              {user.tier === 'wholesale'
                ? 'Wholesale (12% OFF)'
                : user.tier === 'vip'
                ? 'VIP (5% OFF)'
                : 'Regular Tier'}
            </span>
          </div>

          <div style={{ ...cardStyle, background: getUserKhataBalance(user.id) > 0 ? '#fef2f2' : '#f0fdf4', border: getUserKhataBalance(user.id) > 0 ? '1.5px solid #fecaca' : '1.5px solid #bbf7d0', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  {lang === 'bn' ? 'বর্তমান বকেয়া দেনা' : 'Current Outstanding Dues'}
                </span>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: getUserKhataBalance(user.id) > 0 ? '#dc2626' : '#16a34a' }}>
                  ₹{getUserKhataBalance(user.id)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block' }}>
                  {lang === 'bn' ? 'খাতা সুবিধা:' : 'Khata Credit:'}
                </span>
                <strong style={{ fontSize: '0.85rem', color: user.khataApproved ? '#15803d' : '#991b1b' }}>
                  {user.khataApproved ? `✓ ${lang === 'bn' ? 'অনুমোদিত' : 'Approved'} (₹${user.khataCreditLimit || 2000})` : `✕ ${lang === 'bn' ? 'অনুমোদন প্রক্রিয়াধীন' : 'Pending Approval'}`}
                </strong>
              </div>
            </div>

            {getUserKhataBalance(user.id) > 0 && (
              <div style={{ marginTop: '0.85rem' }}>
                <a
                  href={`upi://pay?pa=${UPI_ID}&pn=GreenVest&am=${getUserKhataBalance(user.id)}&cu=INR&tn=${encodeURIComponent('Khata Dues ' + user.name)}`}
                  className="btn btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.55rem 1rem',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
                    color: '#ffffff',
                  }}
                >
                  ⚡ {lang === 'bn' ? `১-ক্লিকে বকেয়া পরিশোধ করুন (₹${getUserKhataBalance(user.id)})` : `Pay Dues Online (₹${getUserKhataBalance(user.id)})`}
                </a>
              </div>
            )}

            {/* User transactions */}
            {khataEntries.filter((e) => e.userId === user.id).length > 0 && (
              <div style={{ marginTop: '0.75rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
                  {lang === 'bn' ? 'সাম্প্রতিক খাতা বিবরণী:' : 'Recent Khata Transactions:'}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {khataEntries
                    .filter((e) => e.userId === user.id)
                    .slice(-3)
                    .reverse()
                    .map((e) => (
                      <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', background: '#ffffff', padding: '4px 8px', borderRadius: '6px' }}>
                        <span>{e.type === 'payment_credit' ? '🟢 Payment Received' : '🔴 Debit / Order'} · {new Date(e.createdAt).toLocaleDateString()}</span>
                        <strong style={{ color: e.type === 'payment_credit' ? '#16a34a' : '#dc2626' }}>
                          {e.type === 'payment_credit' ? `-₹${e.amount}` : `+₹${e.amount}`}
                        </strong>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Recent Orders */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>{lang === 'bn' ? '🕐 সাম্প্রতিক অর্ডার' : '🕐 Recent Orders'}</h3>
          <Link to="/orders" style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>{lang === 'bn' ? 'সব দেখুন →' : 'View all →'}</Link>
        </div>
        {recentOrders.length === 0 ? (
          <p style={{ ...cardStyle, color: 'var(--text-light)', fontStyle: 'italic', borderStyle: 'dashed' }}>
            {lang === 'bn' ? 'কোনো অর্ডার নেই' : 'No orders yet'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentOrders.map(o => (
              <div key={o.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {o.items.map(i => i.emoji).join(' ')} ₹{o.total}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                    {new Date(o.createdAt).toLocaleDateString()} · {o.items.length} {lang === 'bn' ? 'আইটেম' : 'items'}
                  </div>
                </div>
                <span style={{
                  fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px',
                  background: o.status === 'delivered' ? '#dcfce7' : o.status === 'cancelled' ? '#fef2f2' : o.status === 'confirmed' ? '#dbeafe' : '#fef9c3',
                  color: o.status === 'delivered' ? '#166534' : o.status === 'cancelled' ? '#991b1b' : o.status === 'confirmed' ? '#1e40af' : '#854d0e',
                  textTransform: 'capitalize', whiteSpace: 'nowrap'
                }}>
                  {o.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Saved Delivery Address Section with Edit / Add */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>{lang === 'bn' ? '📍 সংরক্ষিত ডেলিভারি ঠিকানা' : '📍 Saved Delivery Address'}</h3>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowAddForm(!showAddForm)}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
          >
            {showAddForm ? '✕' : (lang === 'bn' ? '✏️ সম্পাদনা / নতুন' : '✏️ Edit / Add')}
          </button>
        </div>

        {showAddForm && (
          <div style={{ ...cardStyle, marginBottom: '0.85rem', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              {lang === 'bn' ? 'নতুন ডেলিভারি ঠিকানা লিখুন:' : 'Enter Delivery Address:'}
            </label>
            <input
              type="text"
              value={addrInput}
              onChange={(e) => setAddrInput(e.target.value)}
              placeholder={lang === 'bn' ? 'বাড়ি, পারা, ল্যান্ডমার্ক, এলাকা' : 'House, Para, Landmark, Area'}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #d1d5db', marginBottom: '0.5rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveAddress}
                disabled={saving}
              >
                {saving ? '...' : (lang === 'bn' ? 'সংরক্ষণ করুন' : 'Save Address')}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAddForm(false)}
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {loadingAddrs ? (
          <p style={{ color: 'var(--text-light)' }}>{lang === 'bn' ? 'লোড হচ্ছে...' : 'Loading...'}</p>
        ) : addresses.length === 0 ? (
          <p style={{ ...cardStyle, color: 'var(--text-light)', fontStyle: 'italic', borderStyle: 'dashed' }}>
            {lang === 'bn' ? 'কোনো সংরক্ষিত ঠিকানা নেই। কেনাকাটার সময় অটো সংরক্ষণ হবে।' : 'No saved address yet. It will automatically save when you place an order!'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {addresses.map(addr => (
              <div key={addr.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{addr.label} {addr.is_default && '⭐'}</div>
                  <div style={{ color: 'var(--text-light)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={addr.address}>{addr.address}</div>
                  <div style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>📱 {addr.phone}</div>
                </div>
                <button onClick={() => handleDeleteAddress(addr.id)} style={{ background: '#fef2f2', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#dc2626', padding: '0.4rem 0.6rem', borderRadius: '8px', flexShrink: 0 }}>
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Preferences & Security Actions */}
      <section style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
        <h3 style={{ margin: 0 }}>{lang === 'bn' ? '⚙️ সেটিংস ও অ্যাকাউন্ট সিকিউরিটি' : '⚙️ Settings & Security'}</h3>

        {/* Change PIN Option */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>🔑 {lang === 'bn' ? 'আমার সিকিউরিটি পিন পরিবর্তন করুন' : 'Change My Security PIN'}</strong>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{lang === 'bn' ? 'নতুন পছন্দসই ৪-সংখ্যার পিন সেভ করুন' : 'Set your own preferred 4-digit PIN'}</div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowPinForm(!showPinForm)}
            >
              {showPinForm ? '✕' : (lang === 'bn' ? '🔑 পরিবর্তন করুন' : '🔑 Change PIN')}
            </button>
          </div>

          {showPinForm && (
            <div style={{ marginTop: '0.5rem', background: '#f0fdf4', padding: '0.75rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                {lang === 'bn' ? 'নতুন ৪-সংখ্যার সিকিউরিটি পিন (PIN) লিখুন:' : 'Enter New 4-Digit Security PIN:'}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPinVal}
                onChange={(e) => setNewPinVal(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder={lang === 'bn' ? 'যেমন ১২৩৪' : 'e.g. 1234'}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #d1d5db', marginBottom: '0.5rem', fontSize: '1.2rem', fontWeight: 'bold', letterSpacing: '0.2rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleUpdateMyPin}
                  disabled={saving}
                >
                  {saving ? '...' : (lang === 'bn' ? 'নতুন পিন সেভ করুন' : 'Save New PIN')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowPinForm(false)}
                >
                  {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Small & Premium Cloud Sync Button */}
        <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>☁️</span> {lang === 'bn' ? 'ক্লাউড সিঙ্ক ও ক্যাশ রিফ্রেশ' : 'Cloud Sync & Fresh Data'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              {lang === 'bn' ? 'সরাসরি ক্লাউড থেকে তাজা দাম ও অর্ডার রিফ্রেশ করুন' : 'Fetch live prices & orders without logging out'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSafeSync}
            disabled={isSyncing}
            style={{
              padding: '0.4rem 0.85rem',
              background: isSyncing ? '#f1f5f9' : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              border: '1px solid #86efac',
              borderRadius: '999px',
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '0.8rem',
              color: '#166534',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              boxShadow: '0 1px 3px rgba(22, 101, 52, 0.08)',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{ display: 'inline-block', transform: isSyncing ? 'rotate(360deg)' : 'none', transition: 'transform 0.6s linear' }}>
              🔄
            </span>
            {isSyncing
              ? (lang === 'bn' ? 'সিঙ্ক হচ্ছে...' : 'Syncing...')
              : (lang === 'bn' ? 'সিঙ্ক করুন' : 'Sync Now')}
          </button>
        </div>

        <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>{lang === 'bn' ? 'ভাষা' : 'Language'}</div>
          <button onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            style={{ padding: '0.4rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#166534' }}>
            {lang === 'en' ? '🇮🇳 বাংলা' : '🇬🇧 English'}
          </button>
        </div>

        <button onClick={logout}
          style={{ width: '100%', border: '1px solid #fca5a5', color: '#dc2626', background: '#fef2f2', padding: '0.75rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
          {lang === 'bn' ? '🚪 লগআউট' : '🚪 Logout'}
        </button>
        <button onClick={async () => {
          if (supabase) await supabase.auth.signOut({ scope: 'global' })
          await logout()
        }}
          style={{ width: '100%', border: '1px solid #fca5a5', color: '#dc2626', background: 'transparent', padding: '0.5rem', borderRadius: '12px', cursor: 'pointer', fontSize: '0.85rem' }}>
          {lang === 'bn' ? 'সব ডিভাইস থেকে লগআউট করুন' : 'Logout from all devices'}
        </button>
      </section>
    </div>
  )
}
