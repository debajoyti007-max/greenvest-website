import { FormEvent, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import type { Product } from '../../types'

const emptyForm = {
  emoji: '🥬',
  name: '',
  bnName: '',
  pA: 0,
  pB: 0,
  pC: 0,
  inStock: true,
  category: 'Vegetables',
  unit: 'kg',
}

export default function SellerProducts() {
  const { user } = useAuth()
  const { products, lang, updateProduct, addProduct, deleteProduct, toggleStock } = useStore()
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const startEdit = (p: Product) => {
    setEditing(p)
    setForm({
      emoji: p.emoji,
      name: p.name,
      bnName: p.bnName,
      pA: p.pA,
      pB: p.pB,
      pC: p.pC,
      inStock: p.inStock,
      category: p.category,
      unit: p.unit,
    })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    if (editing) {
      updateProduct({ ...editing, ...form })
      setEditing(null)
    } else {
      addProduct(form)
    }
    setForm(emptyForm)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lang === 'bn' ? 'সবজি তালিকা' : 'Product list'}</h1>
        <Link to="/seller" className="btn btn-ghost">
          ← Dashboard
        </Link>
      </div>

      <form className="form product-form" onSubmit={onSubmit}>
        <h2>{editing ? 'Edit product' : 'Add product'}</h2>
        <div className="form-grid">
          <label>
            Emoji
            <input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
          </label>
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            Bangla name
            <input value={form.bnName} onChange={(e) => setForm({ ...form, bnName: e.target.value })} />
          </label>
          <label>
            Category
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </label>
          <label>
            Unit
            <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </label>
          <label>
            Grade A ৳
            <input
              type="number"
              value={form.pA}
              onChange={(e) => setForm({ ...form, pA: Number(e.target.value) })}
            />
          </label>
          <label>
            Grade B ৳
            <input
              type="number"
              value={form.pB}
              onChange={(e) => setForm({ ...form, pB: Number(e.target.value) })}
            />
          </label>
          <label>
            Grade C ৳
            <input
              type="number"
              value={form.pC}
              onChange={(e) => setForm({ ...form, pC: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            {editing ? 'Save changes' : 'Add vegetable'}
          </button>
          {editing && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditing(null)
                setForm(emptyForm)
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>A/B/C</th>
              <th>Stock</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td className="emoji-cell">{p.emoji}</td>
                <td>
                  <strong>{p.name}</strong>
                  <div className="muted">{p.bnName}</div>
                </td>
                <td>
                  ৳{p.pA} / ৳{p.pB} / ৳{p.pC}
                </td>
                <td>
                  <button
                    type="button"
                    className={`stock-toggle ${p.inStock ? 'in' : 'out'}`}
                    onClick={() => toggleStock(p.id)}
                  >
                    {p.inStock ? 'IN' : 'OUT'}
                  </button>
                </td>
                <td className="actions">
                  <button type="button" className="btn btn-ghost" onClick={() => startEdit(p)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-ghost danger" onClick={() => deleteProduct(p.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
