import { useEffect, useState, useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { supabase } from '../lib/supabase'
import type { Address } from '../types'

export default function Profile() {
  const { user, logout } = useAuth()
  const { orders, fetchAddresses, deleteAddress, lang, setLang } = useStore()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [loadingAddrs, setLoadingAddrs] = useState(true)

  const [editingName, setEditingName] = useState(false)
  const [editingPhone, setEditingPhone] = useState(false)
  const [nameVal, setNameVal] = useState('')
  const [phoneVal, setPhoneVal] = useState('')
  const [saving, setSaving] = useState(false)

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
      if (supabase) {
        await supabase.from('profiles').update({ name: nameVal.trim() }).eq('id', user.id)
      }
      setEditingName(false)
    } catch (e) {
      alert(lang === 'bn' ? 'আপডেট ব্যর্থ হয়েছে' : 'Update failed. Please try again.')
    }
    setSaving(false)
  }

  const handleSavePhone = async () => {
    if (!user || !phoneVal.trim()) return
    setSaving(true)
    try {
      if (supabase) {
        await supabase.from('profiles').update({ phone: phoneVal.trim() }).eq('id', user.id)
      }
      setEditingPhone(false)
    } catch (e) {
      alert(lang === 'bn' ? 'আপডেট ব্যর্থ হয়েছে' : 'Update failed. Please try again.')
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

      {/* Saved Addresses */}
      <section>
        <h3 style={{ margin: '0 0 0.75rem' }}>{lang === 'bn' ? '📍 সংরক্ষিত ঠিকানা' : '📍 Saved Addresses'}</h3>
        {loadingAddrs ? (
          <p style={{ color: 'var(--text-light)' }}>{lang === 'bn' ? 'লোড হচ্ছে...' : 'Loading...'}</p>
        ) : addresses.length === 0 ? (
          <p style={{ ...cardStyle, color: 'var(--text-light)', fontStyle: 'italic', borderStyle: 'dashed' }}>
            {lang === 'bn' ? 'কোনো সংরক্ষিত ঠিকানা নেই' : 'No saved addresses yet. Save one during checkout!'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {addresses.map(addr => (
              <div key={addr.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{addr.label} {addr.is_default && '⭐'}</div>
                  <div style={{ color: 'var(--text-light)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={addr.address}>{addr.address}</div>
                  <div style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>📱 {addr.phone} · PIN {addr.pin}</div>
                </div>
                <button onClick={() => handleDeleteAddress(addr.id)} style={{ background: '#fef2f2', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#dc2626', padding: '0.4rem 0.6rem', borderRadius: '8px', flexShrink: 0 }}>
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Preferences & Actions */}
      <section style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
        <h3 style={{ margin: 0 }}>{lang === 'bn' ? '⚙️ সেটিংস' : '⚙️ Settings'}</h3>
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
