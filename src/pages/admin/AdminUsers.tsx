import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import type { Role } from '../../types'

export default function AdminUsers() {
  const { user, users, setUserRole, mode: dataMode } = useAuth()
  const { products, orders, lang } = useStore()

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="page">
      <h1>{lang === 'bn' ? 'অ্যাডমিন — ইউজার' : 'Admin — Users'}</h1>
      <p className="lede">
        {lang === 'bn'
          ? 'সেলার বানান বা বাতিল করুন। আয়ের স্ক্রিন নেই।'
          : 'Make or revoke sellers. No revenue screens here.'}
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
              <th>{lang === 'bn' ? 'ইমেইল' : 'Email'}</th>
              <th>{lang === 'bn' ? 'রোল' : 'Role'}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                </td>
                <td>{u.email}</td>
                <td>
                  <span className={`role-pill role-${u.role}`}>{u.role}</span>
                </td>
                <td className="actions">
                  {u.role !== 'admin' && (
                    <>
                      {u.role !== 'seller' ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => void setUserRole(u.id, 'seller')}
                        >
                          {lang === 'bn' ? 'সেলার বানান' : 'Make seller'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void setUserRole(u.id, 'customer' as Role)}
                        >
                          {lang === 'bn' ? 'সেলার বাতিল' : 'Revoke seller'}
                        </button>
                      )}
                    </>
                  )}
                  {u.role === 'admin' && (
                    <span className="muted">{lang === 'bn' ? 'সুরক্ষিত' : 'Protected'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
