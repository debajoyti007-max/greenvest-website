import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import type { Role } from '../../types'

export default function AdminUsers() {
  const { user, users, setUserRole, mode: dataMode } = useAuth()
  const { products, orders, resetDemo, lang } = useStore()

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  const onReset = async () => {
    if (
      confirm(
        lang === 'bn'
          ? 'সব অর্ডার মুছবেন ও লোকাল কার্ট খালি করবেন?'
          : 'Clear all cloud orders and local cart?',
      )
    ) {
      await resetDemo()
    }
  }

  return (
    <div className="page">
      <h1>Admin — Users</h1>
      <p className="lede">Make or revoke sellers. No revenue screens here.</p>

      <div className="dash-grid admin-health">
        <div className="stat">
          <span>Users</span>
          <strong>{users.length}</strong>
        </div>
        <div className="stat">
          <span>Products</span>
          <strong>{products.length}</strong>
        </div>
        <div className="stat">
          <span>Orders</span>
          <strong>{orders.length}</strong>
        </div>
        <div className="stat">
          <span>Storage</span>
          <strong>{dataMode === 'cloud' ? 'Supabase' : 'This device'}</strong>
        </div>
      </div>

      <div className="admin-tools">
        <button type="button" className="btn btn-ghost danger" onClick={onReset}>
          Reset demo data
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Actions</th>
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
                          Make seller
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void setUserRole(u.id, 'customer' as Role)}
                        >
                          Revoke seller
                        </button>
                      )}
                    </>
                  )}
                  {u.role === 'admin' && <span className="muted">Protected</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
