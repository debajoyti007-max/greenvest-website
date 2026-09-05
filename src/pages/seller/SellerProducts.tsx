import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { useStore } from '../../context/useStore'
import { showToast } from '../../lib/toast'
import { SEASON_LABELS, computeMarketMrp, computeDiscountPercent } from '../../lib/business'
import { t } from '../../lib/i18n'
import { uploadProductImage } from '../../lib/imageUpload'
import { resolveProductImage } from '../../lib/productImages'
import type { Grade, Product, Season } from '../../types'

const emptyForm = {
  emoji: '🥬',
  name: '',
  bnName: '',
  pA: 0,
  pB: 0,
  pC: 0,
  mrp: 0,
  availableGrades: ['A', 'B', 'C'] as Grade[],
  inStock: true,
  archived: false,
  stockQty: 20,
  season: 'all' as Season,
  category: 'Vegetables',
  unit: 'kg',
  imageUrl: '',
  soldAs: 'loose' as 'loose' | 'packet' | 'both',
  gramOptions: [] as number[],
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
  const [quickPriceId, setQuickPriceId] = useState<string | null>(null)
  const [quickPrices, setQuickPrices] = useState({ pA: 0, pB: 0, pC: 0 })

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
      mrp: p.mrp || 0,
      availableGrades: (p.availableGrades && p.availableGrades.length > 0) ? p.availableGrades : ['A', 'B', 'C'],
      inStock: p.inStock,
      archived: Boolean(p.archived),
      stockQty: p.stockQty ?? 0,
      season: (p.season || 'all') as Season,
      category: p.category,
      unit: p.unit,
      imageUrl: p.imageUrl || '',
      soldAs: p.soldAs || 'loose',
      gramOptions: p.gramOptions || [],
    })
  }

  const onPhoto = async (file: File | null) => {
    if (!file) return
    setPhotoError('')
    setPhotoBusy(true)
    try {
      const key = editing?.id || (user ? `tmp-${user.id}` : `tmp-${Date.now()}`)
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
    try {
      if (editing) {
        await updateProduct({ ...editing, ...payload })
        showToast(lang === 'bn' ? `✅ "${payload.bnName || payload.name}" আপডেট হয়েছে!` : `✅ "${payload.name}" updated!`, '✏️')
        setEditing(null)
      } else {
        await addProduct(payload)
        showToast(lang === 'bn' ? `✅ "${payload.bnName || payload.name}" সফলভাবে যোগ হয়েছে!` : `✅ "${payload.name}" added successfully!`, '🎉')
      }
      setForm(emptyForm)
      setPhotoError('')
    } catch (err: any) {
      showToast(err.message || 'Error saving product', 'error')
    }
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

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

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
              <option value="Vegetables">🥦 Vegetables (শাকসবজি)</option>
              <option value="Leafy">🤬 Leafy Greens (শাক)</option>
              <option value="Spices">🌶️ Spices (মশলা)</option>
              <option value="Fish">🐟 Fish (মাছ)</option>
              <option value="Fruits">🥭 Fruits (ফল)</option>
              <option value="Dairy">🥛 Dairy (দুগ্ধজাত)</option>
            </select>
          </label>
          <label>
            {lang === 'bn' ? 'ইউনিট' : 'Unit'}
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="kg">kg (কিলো)</option>
              <option value="pc">pc (পিস)</option>
              <option value="bunch">bunch (ডাঁটা)</option>
              <option value="litre">litre (লিটার)</option>
              <option value="packet">packet (প্যাকেট)</option>
            </select>
          </label>
          <label>
            {lang === 'bn' ? 'বিক্রয় পদ্ধতি' : 'Sold As'}
            <select value={form.soldAs || 'loose'} onChange={(e) => setForm({ ...form, soldAs: e.target.value as 'loose' | 'packet' | 'both' })}>
              <option value="loose">⚖️ Loose by weight ({lang === 'bn' ? 'ওজনে বিক্রয়' : 'e.g. 1 kg, 2 kg'})</option>
              <option value="packet">📦 Fixed Packets only ({lang === 'bn' ? 'প্যাকেটে বিক্রয়' : 'e.g. 250g, 500g'})</option>
              <option value="both">♾️ Both loose & packet ({lang === 'bn' ? 'দুটোই বিক্রয় হয়' : 'customer can choose'})</option>
            </select>
          </label>
          {(form.soldAs === 'packet' || form.soldAs === 'both') && (
            <label>
              {lang === 'bn' ? 'গ্রাম অপশন (কমা দিয়ে বিভক্ত করুন)' : 'Gram options (comma-separated)'}
              <input
                placeholder="e.g. 250,500,1000"
                value={(form.gramOptions || []).join(',')}
                onChange={(e) => setForm({ ...form, gramOptions: e.target.value.split(',').map(v => parseInt(v.trim())).filter(n => !isNaN(n)) })}
              />
              <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{lang === 'bn' ? 'যেমন: 250,500,1000 মানে তিনটি সাইজে বিক্রয় হবে' : 'e.g. 250,500,1000 means 3 packet sizes'}</span>
            </label>
          )}
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
          <div className="span-2" style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #cbd5e1', margin: '0.25rem 0' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, display: 'block', marginBottom: '0.45rem', color: '#1e293b' }}>
              🔘 {lang === 'bn' ? 'ক্রেতাদের কোন কোন অপশন/গ্রেড দেখাবেন? (Option A, B, C Toggle):' : 'Which Grades to show customers? (Option A, B, C Toggle):'}
            </span>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {(['A', 'B', 'C'] as Grade[]).map((g) => {
                const isChecked = form.availableGrades?.includes(g) ?? true
                return (
                  <label key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', color: isChecked ? '#166534' : '#64748b' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const cur = form.availableGrades || ['A', 'B', 'C']
                        let next: Grade[]
                        if (e.target.checked) {
                          next = [...cur, g]
                        } else {
                          next = cur.filter((x) => x !== g)
                          if (next.length === 0) next = [g] // Keep at least 1 grade active
                        }
                        setForm({ ...form, availableGrades: next })
                      }}
                    />
                    Grade {g}
                  </label>
                )
              })}
            </div>
          </div>

          <label>
            Grade A ₹
            <input
              type="number"
              value={form.pA}
              onChange={(e) => setForm({ ...form, pA: Number(e.target.value) })}
            />
          </label>
          <label>
            Grade B ₹
            <input
              type="number"
              value={form.pB}
              onChange={(e) => setForm({ ...form, pB: Number(e.target.value) })}
            />
          </label>
          <label>
            Grade C ₹
            <input
              type="number"
              value={form.pC}
              onChange={(e) => setForm({ ...form, pC: Number(e.target.value) })}
            />
          </label>
          <label>
            {lang === 'bn' ? 'বাজারের MRP (কাটা দাম ₹)' : 'Market MRP (Strikethrough ₹)'}
            <input
              type="number"
              min={0}
              value={form.mrp || ''}
              placeholder={lang === 'bn' ? 'অটো হিসাব (স্বয়ংক্রিয়)' : 'Auto calculated'}
              onChange={(e) => setForm({ ...form, mrp: Number(e.target.value) || 0 })}
            />
            {form.pA > 0 && (
              <span style={{ display: 'block', marginTop: '4px', fontSize: '0.76rem', color: '#166534', fontWeight: 600 }}>
                ✨ {lang === 'bn' ? 'ডিসকাউন্ট দেখাবে:' : 'Storefront preview:'}{' '}
                <strong style={{ background: '#dcfce7', color: '#15803d', padding: '1px 5px', borderRadius: '4px', border: '1px solid #86efac' }}>
                  {computeDiscountPercent(form.mrp || computeMarketMrp(form.pA, undefined, form.name || 'preview'), form.pA)}% OFF
                </strong>{' '}
                (MRP: ₹{form.mrp || computeMarketMrp(form.pA, undefined, form.name || 'preview')})
              </span>
            )}
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
                    </div>
                  </td>
                  <td>
                    {quickPriceId === p.id ? (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input type="number" value={quickPrices.pA} onChange={e => setQuickPrices({...quickPrices, pA: Number(e.target.value)})} style={{width: '60px', padding: '2px'}} />
                        <input type="number" value={quickPrices.pB} onChange={e => setQuickPrices({...quickPrices, pB: Number(e.target.value)})} style={{width: '60px', padding: '2px'}} />
                        <input type="number" value={quickPrices.pC} onChange={e => setQuickPrices({...quickPrices, pC: Number(e.target.value)})} style={{width: '60px', padding: '2px'}} />
                        <button type="button" className="btn btn-primary" style={{padding: '2px 6px', fontSize: '12px'}} onClick={() => {
                          void updateProduct({ ...p, pA: quickPrices.pA, pB: quickPrices.pB, pC: quickPrices.pC })
                          setQuickPriceId(null)
                        }}>Save</button>
                        <button type="button" className="btn btn-ghost" style={{padding: '2px 6px', fontSize: '12px'}} onClick={() => setQuickPriceId(null)}>X</button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>₹{p.pA} / ₹{p.pB} / ₹{p.pC}</span>
                          <button type="button" className="btn btn-ghost" style={{padding: '2px 6px', fontSize: '11px'}} onClick={() => {
                            setQuickPriceId(p.id)
                            setQuickPrices({ pA: p.pA, pB: p.pB, pC: p.pC })
                          }}>✏️ Price</button>
                        </div>
                        {/* 1-Tap Grade Toggles */}
                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Grades:</span>
                          {(['A', 'B', 'C'] as Grade[]).map((g) => {
                            const available: Grade[] = (p.availableGrades && p.availableGrades.length > 0) ? p.availableGrades : ['A', 'B', 'C']
                            const isEn = available.includes(g)
                            return (
                              <button
                                key={g}
                                type="button"
                                onClick={async () => {
                                  let next: Grade[] = isEn ? available.filter((x) => x !== g) : [...available, g]
                                  if (next.length === 0) next = [g]
                                  await updateProduct({ ...p, availableGrades: next })
                                  showToast(isEn ? `Grade ${g} disabled for ${p.name}` : `Grade ${g} enabled for ${p.name}`, isEn ? '✕' : '✓')
                                }}
                                style={{
                                  padding: '1px 5px',
                                  fontSize: '0.7rem',
                                  borderRadius: '4px',
                                  border: '1px solid',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  background: isEn ? '#dcfce7' : '#f1f5f9',
                                  color: isEn ? '#15803d' : '#94a3b8',
                                  borderColor: isEn ? '#86efac' : '#cbd5e1',
                                }}
                                title={`Click to ${isEn ? 'disable' : 'enable'} Grade ${g} on store`}
                              >
                                {isEn ? `✓ ${g}` : `✕ ${g}`}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
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
