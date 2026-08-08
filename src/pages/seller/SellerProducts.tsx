import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { t } from '../../lib/i18n'
import { fileToProductImage } from '../../lib/imageUpload'
import { resolveProductImage } from '../../lib/productImages'
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
  imageUrl: '',
}

export default function SellerProducts() {
  const { user } = useAuth()
  const { products, lang, updateProduct, addProduct, deleteProduct, toggleStock } = useStore()
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [query, setQuery] = useState('')

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const filtered = products.filter((p) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) ||
      p.bnName.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    )
  })

  const startEdit = (p: Product) => {
    setEditing(p)
    setPhotoError('')
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
      imageUrl: p.imageUrl || '',
    })
  }

  const onPhoto = async (file: File | null) => {
    if (!file) return
    setPhotoError('')
    setPhotoBusy(true)
    try {
      const dataUrl = await fileToProductImage(file)
      setForm((f) => ({ ...f, imageUrl: dataUrl }))
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setPhotoBusy(false)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const payload = {
      ...form,
      imageUrl: form.imageUrl.trim() || undefined,
    }
    if (editing) {
      await updateProduct({ ...editing, ...payload })
      setEditing(null)
    } else {
      await addProduct(payload)
    }
    setForm(emptyForm)
    setPhotoError('')
  }

  const preview = form.imageUrl
    ? form.imageUrl
    : editing
      ? resolveProductImage(editing.id, editing.imageUrl)
      : ''

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lang === 'bn' ? 'সবজি তালিকা' : 'Product list'}</h1>
        <Link to="/seller" className="btn btn-ghost">
          {t(lang, 'backDashboard')}
        </Link>
      </div>

      <form className="form product-form" onSubmit={onSubmit}>
        <h2>{editing ? (lang === 'bn' ? 'এডিট' : 'Edit product') : lang === 'bn' ? 'নতুন আইটেম' : 'Add product'}</h2>
        <div className="form-grid">
          <label>
            Emoji
            <input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
          </label>
          <label>
            {lang === 'bn' ? 'নাম (ইংরেজি)' : 'Name'}
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            {lang === 'bn' ? 'বাংলা নাম' : 'Bangla name'}
            <input value={form.bnName} onChange={(e) => setForm({ ...form, bnName: e.target.value })} />
          </label>
          <label>
            {lang === 'bn' ? 'ক্যাটাগরি' : 'Category'}
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="Vegetables">Vegetables</option>
              <option value="Leafy">Leafy</option>
              <option value="Spices">Spices</option>
              <option value="Fish">Fish</option>
              <option value="Eggs">Eggs</option>
              <option value="Pulses">Pulses</option>
            </select>
          </label>
          <label>
            {lang === 'bn' ? 'ইউনিট' : 'Unit'}
            <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </label>
          <label className="span-2">
            {t(lang, 'uploadPhoto')}
            <input
              type="file"
              accept="image/*"
              disabled={photoBusy}
              onChange={(e) => void onPhoto(e.target.files?.[0] || null)}
            />
          </label>
          {preview && (
            <div className="span-2 seller-photo-preview">
              <img src={preview} alt="" />
            </div>
          )}
          {photoError && <p className="form-error span-2">{photoError}</p>}
          <label className="span-2">
            {lang === 'bn' ? 'অথবা ইমেজ URL' : 'Or image URL'}
            <input
              value={form.imageUrl.startsWith('data:') ? '' : form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="/veg/tomato.jpg or https://..."
            />
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
          <button type="submit" className="btn btn-primary" disabled={photoBusy}>
            {editing
              ? lang === 'bn'
                ? 'সেভ'
                : 'Save changes'
              : lang === 'bn'
                ? 'যোগ করুন'
                : 'Add item'}
          </button>
          {editing && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditing(null)
                setForm(emptyForm)
                setPhotoError('')
              }}
            >
              {t(lang, 'cancel')}
            </button>
          )}
        </div>
      </form>

      <label className="search-field seller-product-search">
        <span className="sr-only">{lang === 'bn' ? 'সার্চ' : 'Search'}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === 'bn' ? 'প্রোডাক্ট খুঁজুন…' : 'Search products…'}
        />
      </label>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>{lang === 'bn' ? 'নাম' : 'Name'}</th>
              <th>A/B/C</th>
              <th>{lang === 'bn' ? 'স্টক' : 'Stock'}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td className="emoji-cell">
                  <img
                    src={resolveProductImage(p.id, p.imageUrl)}
                    alt=""
                    className="seller-thumb"
                    width={40}
                    height={40}
                  />
                </td>
                <td>
                  <strong>{lang === 'bn' ? p.bnName : p.name}</strong>
                  <div className="muted">{lang === 'bn' ? p.name : p.bnName}</div>
                </td>
                <td>
                  ৳{p.pA} / ৳{p.pB} / ৳{p.pC}
                </td>
                <td>
                  <button
                    type="button"
                    className={`stock-toggle ${p.inStock ? 'in' : 'out'}`}
                    onClick={() => void toggleStock(p.id)}
                  >
                    {p.inStock ? 'IN' : 'OUT'}
                  </button>
                </td>
                <td className="actions">
                  <button type="button" className="btn btn-ghost" onClick={() => startEdit(p)}>
                    {lang === 'bn' ? 'এডিট' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost danger"
                    onClick={() => void deleteProduct(p.id)}
                  >
                    {lang === 'bn' ? 'মুছুন' : 'Delete'}
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
