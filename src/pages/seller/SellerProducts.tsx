import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { LOW_STOCK_QTY, SEASON_LABELS } from '../../lib/business'
import { t } from '../../lib/i18n'
import { uploadProductImage } from '../../lib/imageUpload'
import { resolveProductImage } from '../../lib/productImages'
import type { Product, Season } from '../../types'

const emptyForm = {
  emoji: '🥬',
  name: '',
  bnName: '',
  pA: 0,
  pB: 0,
  pC: 0,
  inStock: true,
  archived: false,
  stockQty: 20,
  season: 'all' as Season,
  category: 'Vegetables',
  unit: 'kg',
  imageUrl: '',
}

type Section = 'active' | 'restock' | 'archived'

export default function SellerProducts() {
  const { user } = useAuth()
  const { products, lang, updateProduct, addProduct, deleteProduct, toggleStock } = useStore()
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<Section>('active')

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.bnName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      )
    })
  }, [products, query])

  const active = searched.filter((p) => !p.archived && p.inStock)
  const restock = searched.filter((p) => !p.archived && !p.inStock)
  const archived = searched.filter((p) => p.archived)

  const list = section === 'active' ? active : section === 'restock' ? restock : archived

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
      archived: Boolean(p.archived),
      stockQty: p.stockQty ?? 0,
      season: (p.season || 'all') as Season,
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
      const key = editing?.id || `tmp-${user.id}`
      const url = await uploadProductImage(file, key)
      setForm((f) => ({ ...f, imageUrl: url }))
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

  const setArchived = async (p: Product, archived: boolean) => {
    await updateProduct({ ...p, archived, inStock: archived ? false : p.inStock })
  }

  const preview = form.imageUrl
    ? form.imageUrl
    : editing
      ? resolveProductImage(editing.id, editing.imageUrl, `${editing.name} ${editing.bnName}`)
      : ''

  const tabs: { id: Section; en: string; bn: string; count: number }[] = [
    { id: 'active', en: 'Selling today', bn: 'আজ বিক্রি', count: active.length },
    { id: 'restock', en: 'Out of stock', bn: 'স্টক নেই', count: restock.length },
    { id: 'archived', en: 'Old / archived', bn: 'পুরনো / আর্কাইভ', count: archived.length },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lang === 'bn' ? 'প্রোডাক্ট ম্যানেজ' : 'Manage products'}</h1>
        <Link to="/seller" className="btn btn-ghost">
          {t(lang, 'backDashboard')}
        </Link>
      </div>
      <p className="lede">
        {lang === 'bn'
          ? 'স্টক আউট হলে নিজে থেকে “স্টক নেই” সেকশনে যায়। সিজন শেষ হলে আর্কাইভ করুন।'
          : 'Out-of-stock items auto-move to Restock. Archive old season items to hide from shop.'}
      </p>

      <form className="form product-form" onSubmit={onSubmit}>
        <h2>
          {editing
            ? lang === 'bn'
              ? 'এডিট'
              : 'Edit product'
            : lang === 'bn'
              ? 'নতুন আইটেম'
              : 'Add product'}
        </h2>
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
          <label>
            {lang === 'bn' ? 'স্টক পরিমাণ' : 'Stock qty'}
            <input
              type="number"
              min={0}
              value={form.stockQty}
              onChange={(e) => setForm({ ...form, stockQty: Number(e.target.value) })}
            />
          </label>
          <label>
            {lang === 'bn' ? 'সিজন' : 'Season'}
            <select
              value={form.season}
              onChange={(e) => setForm({ ...form, season: e.target.value as Season })}
            >
              {(Object.keys(SEASON_LABELS) as Season[]).map((s) => (
                <option key={s} value={s}>
                  {SEASON_LABELS[s][lang]}
                </option>
              ))}
            </select>
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
                : 'Save'
              : lang === 'bn'
                ? 'যোগ করুন'
                : 'Add'}
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

      <div className="cat-filters seller-filters">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`chip ${section === tab.id ? 'active' : ''}`}
            onClick={() => setSection(tab.id)}
          >
            {lang === 'bn' ? tab.bn : tab.en} ({tab.count})
          </button>
        ))}
      </div>

      <label className="search-field seller-product-search">
        <span className="sr-only">Search</span>
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
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  {lang === 'bn' ? 'এই সেকশনে কিছু নেই।' : 'Nothing in this section.'}
                </td>
              </tr>
            ) : (
              list.map((p) => (
                <tr key={p.id}>
                  <td className="emoji-cell">
                    <img
                      src={resolveProductImage(p.id, p.imageUrl, `${p.name} ${p.bnName}`)}
                      alt=""
                      className="seller-thumb"
                      width={40}
                      height={40}
                    />
                  </td>
                  <td>
                    <strong>{lang === 'bn' ? p.bnName : p.name}</strong>
                    <div className="muted">
                      {lang === 'bn' ? p.name : p.bnName}
                      {p.season && p.season !== 'all' ? ` · ${SEASON_LABELS[p.season][lang]}` : ''}
                      {p.stockQty != null ? ` · qty ${p.stockQty}` : ''}
                      {p.inStock &&
                      p.stockQty != null &&
                      p.stockQty > 0 &&
                      p.stockQty <= LOW_STOCK_QTY
                        ? lang === 'bn'
                          ? ' · লো স্টক'
                          : ' · low'
                        : ''}
                    </div>
                  </td>
                  <td>
                    ৳{p.pA} / ৳{p.pB} / ৳{p.pC}
                  </td>
                  <td>
                    {!p.archived && (
                      <button
                        type="button"
                        className={`stock-toggle ${p.inStock ? 'in' : 'out'}`}
                        onClick={() => void toggleStock(p.id)}
                      >
                        {p.inStock ? 'IN' : 'OUT'}
                      </button>
                    )}
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-ghost" onClick={() => startEdit(p)}>
                      {lang === 'bn' ? 'এডিট' : 'Edit'}
                    </button>
                    {p.archived ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void setArchived(p, false)}
                      >
                        {lang === 'bn' ? 'ফেরত আনুন' : 'Restore'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void setArchived(p, true)}
                      >
                        {lang === 'bn' ? 'আর্কাইভ' : 'Archive'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost danger"
                      onClick={() => void deleteProduct(p.id)}
                    >
                      {lang === 'bn' ? 'মুছুন' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
