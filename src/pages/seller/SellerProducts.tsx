import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { useStore } from '../../context/useStore'
import { showToast } from '../../lib/toast'
import { SEASON_LABELS, computeMarketMrp, computeDiscountPercent } from '../../lib/business'
import { t } from '../../lib/i18n'
import { uploadProductImage } from '../../lib/imageUpload'
import { resolveProductImage } from '../../lib/productImages'
import MandiBulkPriceModal from '../../components/seller/MandiBulkPriceModal'
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
  stockQty: 100,
  season: 'all' as Season,
  category: 'Vegetables',
  unit: 'kg',
  imageUrl: '',
  soldAs: 'loose' as 'loose' | 'packet' | 'both',
  gramOptions: [] as number[],
}

const COMMON_EMOJIS = ['🥬', '🥦', '🥔', '🧅', '🍅', '🥕', '🍆', '🥒', '🌶️', '🐟', '🍎', '🍌', '🥭', '🍋', '🌽', '🥜']

const COMMON_GRAM_PRESETS = [
  { val: 250, label: '250g' },
  { val: 500, label: '500g' },
  { val: 1000, label: '1 kg (1000g)' },
  { val: 2000, label: '2 kg (2000g)' },
  { val: 5000, label: '5 kg (5000g)' },
]

type Section = 'active' | 'restock' | 'archived'

export default function SellerProducts() {
  const { user } = useAuth()
  const { products, lang, updateProduct, addProduct, deleteProduct, toggleStock } = useStore()
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [customGramInput, setCustomGramInput] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<Section>('active')
  const [quickPriceId, setQuickPriceId] = useState<string | null>(null)
  const [quickPrices, setQuickPrices] = useState({ pA: 0, pB: 0, pC: 0 })
  const [isMandiOpen, setIsMandiOpen] = useState(false)

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
    setCustomGramInput('')
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
      stockQty: p.inStock ? (p.stockQty ?? 100) : 0,
      season: (p.season || 'all') as Season,
      category: p.category,
      unit: p.unit,
      imageUrl: p.imageUrl || '',
      soldAs: p.soldAs || 'loose',
      gramOptions: p.gramOptions || [],
    })
  }

  const cancelEdit = () => {
    setEditing(null)
    setForm(emptyForm)
    setCustomGramInput('')
    setPhotoError('')
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

  const toggleGramPreset = (val: number) => {
    const cur = form.gramOptions || []
    let next: number[]
    if (cur.includes(val)) {
      next = cur.filter((x) => x !== val)
    } else {
      next = [...cur, val].sort((a, b) => a - b)
    }
    setForm({ ...form, gramOptions: next })
  }

  const addCustomGram = (e?: FormEvent) => {
    if (e) e.preventDefault()
    const val = parseInt(customGramInput.trim(), 10)
    if (val && !isNaN(val) && val > 0) {
      const cur = form.gramOptions || []
      if (!cur.includes(val)) {
        setForm({ ...form, gramOptions: [...cur, val].sort((a, b) => a - b) })
      }
      setCustomGramInput('')
    }
  }

  const removeGram = (val: number) => {
    setForm({ ...form, gramOptions: (form.gramOptions || []).filter((x) => x !== val) })
  }

  const toggleGrade = (g: Grade) => {
    const cur: Grade[] = form.availableGrades && form.availableGrades.length > 0 ? form.availableGrades : (['A', 'B', 'C'] as Grade[])
    let next: Grade[]
    if (cur.includes(g)) {
      next = cur.filter((x): x is Grade => x !== g)
      if (next.length === 0) {
        showToast(lang === 'bn' ? 'অন্তত একটি গ্রেড সক্রিয় রাখা আবশ্যক' : 'At least one grade must remain active', 'warning')
        return
      }
    } else {
      next = [...cur, g]
    }
    setForm({ ...form, availableGrades: next })
  }

  const effectiveBasePrice = useMemo(() => {
    const activeGrades: Grade[] = form.availableGrades && form.availableGrades.length > 0 ? form.availableGrades : (['A', 'B', 'C'] as Grade[])
    if (activeGrades.includes('A') && form.pA > 0) return form.pA
    if (activeGrades.includes('B') && form.pB > 0) return form.pB
    if (activeGrades.includes('C') && form.pC > 0) return form.pC
    return form.pA || form.pB || form.pC || 0
  }, [form.availableGrades, form.pA, form.pB, form.pC])

  const handleAutoMrp = () => {
    if (effectiveBasePrice <= 0) {
      showToast(lang === 'bn' ? 'আগে গ্রেডের বিক্রয় মূল্য লিখুন' : 'Enter a selling price first', 'warning')
      return
    }
    const computed = computeMarketMrp(effectiveBasePrice, undefined, form.name || 'item')
    setForm((f) => ({ ...f, mrp: computed }))
    showToast(lang === 'bn' ? `MRP নির্ধারণ করা হয়েছে: ₹${computed}` : `Calculated Market MRP: ₹${computed}`, '⚡')
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return

    const activeGrades = form.availableGrades && form.availableGrades.length > 0 ? form.availableGrades : (['A'] as Grade[])
    const baseP = (activeGrades.includes('A') ? form.pA : 0) ||
                  (activeGrades.includes('B') ? form.pB : 0) ||
                  (activeGrades.includes('C') ? form.pC : 0) ||
                  form.pA || form.pB || form.pC || 0

    const payload = {
      ...form,
      inStock: form.inStock,
      stockQty: form.inStock ? 100 : 0,
      availableGrades: activeGrades,
      pA: activeGrades.includes('A') ? form.pA : (form.pB || form.pC || baseP),
      pB: activeGrades.includes('B') ? form.pB : (form.pA || form.pC || baseP),
      pC: activeGrades.includes('C') ? form.pC : (form.pA || form.pB || baseP),
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
      setCustomGramInput('')
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsMandiOpen(true)}
            style={{
              background: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
              boxShadow: '0 2px 8px rgba(22, 101, 52, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ⚡ {lang === 'bn' ? 'দৈনিক মান্ডি রেট' : 'Daily Mandi Rates'}
          </button>
          <Link to="/seller" className="btn btn-ghost">
            {t(lang, 'backDashboard')}
          </Link>
        </div>
      </div>
      <p className="lede">
        {lang === 'bn'
          ? 'স্টক আউট হলে নিজে থেকে “স্টক নেই” সেকশনে যায়। সিজন শেষ হলে আর্কাইভ করুন।'
          : 'Out-of-stock items auto-move to Restock. Archive old season items to hide from shop.'}
      </p>

      <form className="seller-product-form" onSubmit={onSubmit}>
        {editing && (
          <div className="seller-form-top-banner">
            <div>
              <strong style={{ fontSize: '0.95rem', color: '#166534' }}>
                ✏️ {lang === 'bn' ? 'এডিট করা হচ্ছে:' : 'Editing:'} {editing.name} {editing.bnName ? `(${editing.bnName})` : ''}
              </strong>
              <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                {lang === 'bn' ? 'তথ্য পরিবর্তন করে সেভ করুন অথবা বাতিল করুন' : 'Update the fields below and click Save Changes'}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={cancelEdit}
              style={{ padding: '4px 10px', fontSize: '0.85rem' }}
            >
              ✕ {t(lang, 'cancel')}
            </button>
          </div>
        )}

        <div className="seller-form-cards">
          {/* Card 1: 📝 Basic Information */}
          <div className="seller-card">
            <div className="seller-card-head">
              <span className="seller-card-icon">📝</span>
              <div>
                <h3>{lang === 'bn' ? '১. মৌলিক তথ্য' : '1. Basic Information'}</h3>
                <p>{lang === 'bn' ? 'নাম, আইকন, ক্যাটাগরি ও ফটো যোগ করুন' : 'Product name, icon, category, season & photo'}</p>
              </div>
            </div>

            <div className="seller-card-body">
              {/* Emoji Selection */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <label style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                    Emoji / {lang === 'bn' ? 'আইকন' : 'Icon'}
                  </label>
                  <input
                    value={form.emoji}
                    onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                    style={{ width: '56px', textAlign: 'center', fontSize: '1.25rem', padding: '4px 6px' }}
                    title="Type custom emoji or tap one below"
                  />
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    {lang === 'bn' ? 'নিচের আইকনে ট্যাপ করে নির্বাচন করুন:' : '1-tap quick palette:'}
                  </span>
                </div>
                <div className="seller-emoji-palette">
                  {COMMON_EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      className={`seller-emoji-btn ${form.emoji === em ? 'active' : ''}`}
                      onClick={() => setForm({ ...form, emoji: em })}
                      title={em}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              {/* Names */}
              <div className="seller-field-grid">
                <label>
                  {lang === 'bn' ? 'ইংরেজি নাম *' : 'Name (English) *'}
                  <input
                    placeholder="e.g. Fresh Potato"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </label>
                <label>
                  {lang === 'bn' ? 'বাংলা নাম' : 'Bangla Name'}
                  <input
                    placeholder="যেমন: নতুন গোল আলু"
                    value={form.bnName}
                    onChange={(e) => setForm({ ...form, bnName: e.target.value })}
                  />
                </label>
              </div>

              {/* Category & Season */}
              <div className="seller-field-grid">
                <label>
                  {lang === 'bn' ? 'ক্যাটাগরি' : 'Category'}
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="Vegetables">🥦 Vegetables (শাকসবজি)</option>
                    <option value="Leafy">🥗 Leafy Greens (শাক)</option>
                    <option value="Spices">🌶️ Spices (মশলা)</option>
                    <option value="Fish">🐟 Fish (মাছ)</option>
                    <option value="Fruits">🥭 Fruits (ফল)</option>
                    <option value="Dairy">🥛 Dairy (দুগ্ধজাত)</option>
                  </select>
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
              </div>

              {/* Photo Upload & Preview */}
              <div>
                <label>
                  {t(lang, 'uploadPhoto')}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={photoBusy}
                    onChange={(e) => void onPhoto(e.target.files?.[0] || null)}
                  />
                </label>
                {photoBusy && (
                  <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600, display: 'block', marginTop: '4px' }}>
                    ⏳ {lang === 'bn' ? 'ছবি আপলোড হচ্ছে...' : 'Uploading photo...'}
                  </span>
                )}
                {preview && (
                  <div className="seller-photo-preview" style={{ marginTop: '8px' }}>
                    <img
                      src={preview}
                      alt=""
                      style={{ maxWidth: '90px', maxHeight: '90px', borderRadius: '8px', border: '1px solid #cbd5e1', objectFit: 'cover' }}
                    />
                  </div>
                )}
                {photoError && <p className="form-error">{photoError}</p>}
              </div>
            </div>
          </div>

          {/* Card 2: 📦 Packaging & Inventory */}
          <div className="seller-card">
            <div className="seller-card-head">
              <span className="seller-card-icon">📦</span>
              <div>
                <h3>{lang === 'bn' ? '২. প্যাকেজিং ও ইনভেন্টরি' : '2. Packaging & Stock'}</h3>
                <p>{lang === 'bn' ? 'ইউনিট, সাইজ ও মজুত পরিমাণ নির্ধারণ করুন' : 'Unit, packet sizes & available stock'}</p>
              </div>
            </div>

            <div className="seller-card-body">
              <div className="seller-field-grid">
                <label>
                  {lang === 'bn' ? 'ইউনিট' : 'Base Unit'}
                  <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                    <option value="kg">kg (কিলো)</option>
                    <option value="pc">pc (পিস)</option>
                    <option value="bunch">bunch (ডাঁটা / আঁটি)</option>
                    <option value="litre">litre (লিটার)</option>
                    <option value="packet">packet (প্যাকেট)</option>
                  </select>
                </label>

                <label>
                  {lang === 'bn' ? 'বিক্রয় পদ্ধতি' : 'Selling Method'}
                  <select
                    value={form.soldAs || 'loose'}
                    onChange={(e) => setForm({ ...form, soldAs: e.target.value as 'loose' | 'packet' | 'both' })}
                  >
                    <option value="loose">⚖️ Loose by weight ({lang === 'bn' ? 'ওজনে বিক্রয় - e.g. 1 kg, 2 kg' : 'Loose by weight'})</option>
                    <option value="packet">📦 Fixed Packets only ({lang === 'bn' ? 'প্যাকেটে বিক্রয় - e.g. 250g, 500g' : 'Fixed packets only'})</option>
                    <option value="both">♾️ Both loose & packet ({lang === 'bn' ? 'উভয় পদ্ধতি - ক্রেতা পছন্দ করতে পারে' : 'Both loose & packets'})</option>
                  </select>
                </label>
              </div>

              {/* Gram Options / Packet Sizes (Show only for kg unit with packet/both) */}
              {form.unit === 'kg' && (form.soldAs === 'packet' || form.soldAs === 'both') ? (
                <div className="seller-gram-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                    <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>
                      ⚖️ {lang === 'bn' ? 'প্যাকেট সাইজ অপশন (1-ট্যাপ প্রিসেট):' : 'Available Packet Sizes (1-Tap Presets):'}
                    </strong>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {lang === 'bn' ? 'ট্যাপ করে অন/অফ করুন' : 'Tap preset to toggle'}
                    </span>
                  </div>

                  {/* 1-Tap Presets */}
                  <div className="seller-gram-presets">
                    {COMMON_GRAM_PRESETS.map((preset) => {
                      const isActive = (form.gramOptions || []).includes(preset.val)
                      return (
                        <button
                          key={preset.val}
                          type="button"
                          className={`seller-preset-chip ${isActive ? 'active' : ''}`}
                          onClick={() => toggleGramPreset(preset.val)}
                        >
                          {isActive ? '✓' : '+'} {preset.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Active Selected Tags */}
                  {(form.gramOptions || []).length > 0 && (
                    <div style={{ marginTop: '2px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        {lang === 'bn' ? 'বর্তমানে সক্রিয় প্যাকেট সাইজ:' : 'Active packet options on store:'}
                      </span>
                      <div className="seller-active-tags">
                        {(form.gramOptions || []).map((val) => (
                          <span key={val} className="seller-active-tag">
                            {val < 1000 ? `${val}g` : `${val / 1000} kg (${val}g)`}
                            <button
                              type="button"
                              onClick={() => removeGram(val)}
                              title={lang === 'bn' ? 'মুছুন' : 'Remove size'}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom Gram Adder */}
                  <div style={{ marginTop: '4px', borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}>
                    <div className="seller-custom-gram-row">
                      <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                        {lang === 'bn' ? 'কাস্টম সাইজ (গ্রাম):' : 'Add custom size (grams):'}
                      </span>
                      <input
                        type="number"
                        min={10}
                        step={10}
                        placeholder="e.g. 750"
                        value={customGramInput}
                        onChange={(e) => setCustomGramInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addCustomGram()
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => addCustomGram()}
                        style={{ padding: '5px 12px', fontSize: '0.82rem' }}
                      >
                        + {lang === 'bn' ? 'যোগ' : 'Add'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : form.unit !== 'kg' && (form.soldAs === 'packet' || form.soldAs === 'both') ? (
                <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#64748b' }}>
                  ℹ️ {lang === 'bn' ? 'প্যাকেট গ্রাম অপশন শুধুমাত্র kg ইউনিটের ক্ষেত্রে প্রযোজ্য।' : 'Packet gram sizes are tailored for kg units.'}
                </div>
              ) : null}

              {/* Stock Status (IN / OUT rule only) */}
              <div style={{ marginTop: '0.25rem' }}>
                <span style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                  ⚡ {lang === 'bn' ? 'স্টক স্ট্যাটাস (ইন / আউট):' : 'Stock Availability (IN / OUT):'}
                </span>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, inStock: true, stockQty: 100 })}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '8px',
                      border: '2px solid',
                      borderColor: form.inStock ? '#15803d' : '#cbd5e1',
                      background: form.inStock ? '#dcfce7' : '#ffffff',
                      color: form.inStock ? '#15803d' : '#64748b',
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                      boxShadow: form.inStock ? '0 2px 8px rgba(21, 128, 61, 0.2)' : 'none',
                    }}
                  >
                    🟢 {lang === 'bn' ? 'IN (স্টকে আছে / আজ বিক্রি হবে)' : 'IN (In Stock / Selling Today)'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, inStock: false, stockQty: 0 })}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '8px',
                      border: '2px solid',
                      borderColor: !form.inStock ? '#dc2626' : '#cbd5e1',
                      background: !form.inStock ? '#fee2e2' : '#ffffff',
                      color: !form.inStock ? '#dc2626' : '#64748b',
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                      boxShadow: !form.inStock ? '0 2px 8px rgba(220, 38, 38, 0.2)' : 'none',
                    }}
                  >
                    🔴 {lang === 'bn' ? 'OUT (স্টক নেই / বিক্রি বন্ধ)' : 'OUT (Out of Stock)'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: 💰 Pricing & Quality Grades */}
          <div className="seller-card">
            <div className="seller-card-head">
              <span className="seller-card-icon">💰</span>
              <div>
                <h3>{lang === 'bn' ? '৩. মূল্য ও কোয়ালিটি গ্রেড' : '3. Pricing & Quality Grades'}</h3>
                <p>{lang === 'bn' ? 'সক্রিয় গ্রেড নির্বাচন, গ্রেডের দাম ও MRP' : 'Select active grades, set prices & MRP'}</p>
              </div>
            </div>

            <div className="seller-card-body">
              {/* Quality Grades Toggle Grid */}
              <div>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, display: 'block', marginBottom: '8px', color: '#1e293b' }}>
                  🔘 {lang === 'bn' ? 'কোন কোন গ্রেড ক্রেতাদের দেখাবেন?' : 'Which Grades to offer customers?'}
                </span>
                <div className="seller-grade-grid">
                  {(['A', 'B', 'C'] as Grade[]).map((g) => {
                    const isChecked = form.availableGrades?.includes(g) ?? true
                    const label = g === 'A'
                      ? (lang === 'bn' ? 'Grade A (প্রিমিয়াম)' : 'Grade A (Premium)')
                      : g === 'B'
                        ? (lang === 'bn' ? 'Grade B (স্ট্যান্ডার্ড)' : 'Grade B (Standard)')
                        : (lang === 'bn' ? 'Grade C (সাশ্রয়ী)' : 'Grade C (Economy)')
                    return (
                      <label
                        key={g}
                        className={`seller-grade-card ${isChecked ? 'active' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleGrade(g)}
                        />
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: isChecked ? '#166534' : '#64748b' }}>
                          {label}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Dynamic Prices for ACTIVE Grades Only */}
              <div className="seller-field-grid">
                {(form.availableGrades?.includes('A') ?? true) && (
                  <label>
                    {lang === 'bn' ? 'Grade A বিক্রয় মূল্য (₹)' : 'Grade A Price (₹)'}
                    <input
                      type="number"
                      min={0}
                      value={form.pA || ''}
                      placeholder="e.g. 40"
                      onChange={(e) => setForm({ ...form, pA: Number(e.target.value) || 0 })}
                    />
                  </label>
                )}

                {(form.availableGrades?.includes('B') ?? true) && (
                  <label>
                    {lang === 'bn' ? 'Grade B বিক্রয় মূল্য (₹)' : 'Grade B Price (₹)'}
                    <input
                      type="number"
                      min={0}
                      value={form.pB || ''}
                      placeholder="e.g. 32"
                      onChange={(e) => setForm({ ...form, pB: Number(e.target.value) || 0 })}
                    />
                  </label>
                )}

                {(form.availableGrades?.includes('C') ?? true) && (
                  <label>
                    {lang === 'bn' ? 'Grade C বিক্রয় মূল্য (₹)' : 'Grade C Price (₹)'}
                    <input
                      type="number"
                      min={0}
                      value={form.pC || ''}
                      placeholder="e.g. 25"
                      onChange={(e) => setForm({ ...form, pC: Number(e.target.value) || 0 })}
                    />
                  </label>
                )}
              </div>

              {/* Market MRP & Live Discount Preview */}
              <div>
                <label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span>{lang === 'bn' ? 'বাজারের MRP (কাটা দাম ₹)' : 'Market MRP (Strikethrough ₹)'}</span>
                    <button
                      type="button"
                      onClick={handleAutoMrp}
                      style={{
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      title="Automatically calculate market MRP (+20% markup)"
                    >
                      ⚡ {lang === 'bn' ? 'অটো MRP (+20%)' : 'Auto MRP (+20%)'}
                    </button>
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={form.mrp || ''}
                    placeholder={lang === 'bn' ? 'ফাঁকা রাখলে স্বয়ংক্রিয় হিসাব হবে' : 'Auto calculated if left blank'}
                    onChange={(e) => setForm({ ...form, mrp: Number(e.target.value) || 0 })}
                  />
                </label>

                {effectiveBasePrice > 0 && (
                  <div className="seller-discount-preview">
                    <span>✨ {lang === 'bn' ? 'স্টোরে ডিসকাউন্ট দেখাবে:' : 'Storefront preview:'}</span>
                    <span className="seller-discount-pill">
                      {computeDiscountPercent(form.mrp || computeMarketMrp(effectiveBasePrice, undefined, form.name || 'preview'), effectiveBasePrice)}% OFF
                    </span>
                    <span style={{ color: '#475569' }}>
                      (MRP: <del>₹{form.mrp || computeMarketMrp(effectiveBasePrice, undefined, form.name || 'preview')}</del> · {lang === 'bn' ? 'আপনার বিক্রয়:' : 'You sell:'} <strong>₹{effectiveBasePrice}</strong>)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions Footer */}
        <div className="seller-form-footer">
          {editing && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={cancelEdit}
            >
              {t(lang, 'cancel')}
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={photoBusy}
            style={{
              padding: '0.65rem 1.5rem',
              fontSize: '0.95rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
              boxShadow: '0 2px 8px rgba(22, 101, 52, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {editing
              ? lang === 'bn'
                ? '💾 পরিবর্তন সেভ করুন'
                : '💾 Save Changes'
              : lang === 'bn'
                ? '✨ প্রোডাক্ট যোগ করুন'
                : '✨ Add Product'}
          </button>
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

      {isMandiOpen && <MandiBulkPriceModal onClose={() => setIsMandiOpen(false)} />}
    </div>
  )
}
