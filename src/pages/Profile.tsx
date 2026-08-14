import { useEffect, useState, useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { supabase } from '../lib/supabase'
import { saveDelivery } from '../lib/storage'
import { showToast } from '../components/Toast'
import type { Address } from '../types'

export default function Profile() {
  const { user, logout, updateUserProfile, updatePassword } = useAuth()
  const { orders, fetchAddresses, saveAddress, deleteAddress, lang, setLang } = useStore()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [loadingAddrs, setLoadingAddrs] = useState(true)

  const [editingName, setEditingName] = useState(false)
  const [editingPhone, setEditingPhone] = useState(false)
  const [nameVal, setNameVal] = useState('')
  const [phoneVal, setPhoneVal] = useState('')
  const [saving, setSaving] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addrInput, setAddrInput] = useState('')

  const [showPinForm, setShowPinForm] = useState(false)
  const [newPinVal, setNewPinVal] = useState('')

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
    } catch {
      showToast(lang === 'bn' ? 'আপডেট ব্যর্থ হয়েছে' : 'Update failed. Please try again.', '❌', 'error')
    }
    setSaving(false)
  }

  const handleSavePhone = async () => {
    if (!user || !phoneVal.trim()) return
    setSaving(true)
    try {
      await updateUserProfile({ phone: phoneVal.trim() })
      setEditingPhone(false)
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

  const cardStyle: React.CSSProperties = { background: 'var(--white, #fff)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--line, #e5e7eb)' }
  const statStyle: React.CSSProperties = { ...cardStyle, textAlign: 'center' as const }
  const labelStyle: React.CSSProperties = { fontSize: '0.8rem', color: 'var(--text-light, #6b7280)', marginTop: '0.25rem' }
  const valueStyle: React.CSSProperties = { fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--primary, #166534)' }

  return (
    <div className="page narrow" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <section style={{ ...cardStyle, display: 'flex', gap: '1rem', alignItems: 'center', padding: '1.5rem' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #166534, #22c55e)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2rem', fontWeight: 'bold', textTransform: 'uppercase', flexShrink: 0
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
