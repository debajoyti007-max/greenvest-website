import { useEffect, useState, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import type { Address } from '../types'

export default function Profile() {
  const { user, logout } = useAuth()
  const { orders, fetchAddresses, deleteAddress, lang, setLang } = useStore()
  
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loadingAddrs, setLoadingAddrs] = useState(true)

  useEffect(() => {
    if (user) {
      setLoadingAddrs(true)
      fetchAddresses(user.id)
        .then(setAddresses)
        .catch(console.error)
        .finally(() => setLoadingAddrs(false))
    }
  }, [user, fetchAddresses])

  const handleDeleteAddress = async (id?: number) => {
    if (!id) return
    if (!window.confirm('Delete this address?')) return
    await deleteAddress(id)
    if (user) {
      const updated = await fetchAddresses(user.id)
      setAddresses(updated)
    }
  }

  const { totalOrders, totalSpent, mostOrderedItem } = useMemo(() => {
    if (!user) return { totalOrders: 0, totalSpent: 0, mostOrderedItem: '-' }
    
    const userOrders = orders.filter(o => o.userId === user.id)
    const validOrders = userOrders.filter(o => o.status !== 'cancelled')
    
    const totalOrders = userOrders.length
    const totalSpent = validOrders.reduce((sum, o) => sum + o.total, 0)
    
    const itemCounts: Record<string, number> = {}
    validOrders.forEach(o => {
      o.items.forEach(item => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.qty
      })
    })
    
    let mostOrderedItem = '-'
    let maxQty = 0
    for (const [name, qty] of Object.entries(itemCounts)) {
      if (qty > maxQty) {
        maxQty = qty
        mostOrderedItem = name
      }
    }
    
    return { totalOrders, totalSpent, mostOrderedItem }
  }, [user, orders])

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  const phone = user.phone || (user.email.endsWith('@greenvest.shop') ? user.email.replace('@greenvest.shop', '') : 'N/A')

  return (
    <div className="page narrow" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Header Section */}
      <section style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'var(--white, #fff)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--line, #eee)' }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%', background: 'var(--primary, #00764A)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 'bold', textTransform: 'uppercase'
        }}>
          {user.name.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: '0 0 0.25rem 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</h2>
          <div style={{ color: 'var(--text-light, #666)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>{user.email}</div>
          <div style={{ color: 'var(--text-light, #666)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>{phone}</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
            <span style={{ background: 'var(--primary, #00764A)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', textTransform: 'capitalize' }}>
              {user.role}
            </span>
            <span style={{ color: 'var(--text-light, #666)', background: 'var(--bg, #f5f5f5)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
              Member since {new Date(user.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </section>

      {/* P3: Order Stats Section */}
      <section>
        <h3 style={{ margin: '0 0 1rem 0' }}>Order Stats</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '1rem' }}>
          <div style={{ background: 'var(--white, #fff)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line, #eee)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary, #00764A)', marginBottom: '0.25rem' }}>{totalOrders}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-light, #666)' }}>Total Orders</div>
          </div>
          <div style={{ background: 'var(--white, #fff)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line, #eee)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary, #00764A)', marginBottom: '0.25rem' }}>₹{totalSpent}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-light, #666)' }}>Total Spent</div>
          </div>
          <div style={{ background: 'var(--white, #fff)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line, #eee)', textAlign: 'center', overflow: 'hidden' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary, #00764A)', marginBottom: '0.25rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }} title={mostOrderedItem}>{mostOrderedItem}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-light, #666)' }}>Most Ordered</div>
          </div>
        </div>
      </section>

      {/* P2: Saved Addresses Section */}
      <section>
        <h3 style={{ margin: '0 0 1rem 0' }}>Saved Addresses</h3>
        {loadingAddrs ? (
          <p style={{ color: 'var(--text-light, #666)' }}>Loading...</p>
        ) : addresses.length === 0 ? (
          <p style={{ color: 'var(--text-light, #666)', fontStyle: 'italic', background: 'var(--white, #fff)', padding: '1rem', borderRadius: '8px', border: '1px dashed var(--line, #eee)' }}>No saved addresses yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {addresses.map(addr => (
              <div key={addr.id} style={{ background: 'var(--white, #fff)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line, #eee)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{addr.label}</div>
                  <div style={{ color: 'var(--text-light, #666)', fontSize: '0.9rem', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={addr.address}>{addr.address}</div>
                  <div style={{ color: 'var(--text-light, #666)', fontSize: '0.8rem' }}>Phone: {addr.phone} | PIN: {addr.pin}</div>
                </div>
                <button 
                  onClick={() => handleDeleteAddress(addr.id)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'red', padding: '0.5rem', flexShrink: 0 }}
                  title="Delete Address"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Account Actions */}
      <section style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
        <h3 style={{ margin: '0' }}>Preferences</h3>
        <div style={{ background: 'var(--white, #fff)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line, #eee)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>Language</div>
          <button
            onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--line, #eee)', borderRadius: '4px', cursor: 'pointer' }}
          >
            {lang === 'en' ? 'EN / BN' : 'BN / EN'}
          </button>
        </div>
        
        <button 
          onClick={logout}
          style={{ width: '100%', border: '1px solid red', color: 'red', background: 'transparent', marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Logout
        </button>
      </section>

    </div>
  )
}
