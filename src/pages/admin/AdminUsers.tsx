import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import type { Role } from '../../types'

export default function AdminUsers() {
  const { user, users, setUserRole } = useAuth()

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="page">
      <h1>Admin — Users</h1>
      <p className="lede">Make or revoke sellers. No revenue screens here.</p>

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
                          onClick={() => setUserRole(u.id, 'seller')}
                        >
                          Make seller
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setUserRole(u.id, 'customer' as Role)}
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
