import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { useStore } from '../../context/useStore'
import { showToast } from '../../lib/toast'
import { DEAL_GRADIENTS, DEFAULT_PROMOTIONAL_DEALS, isDealExpired, formatDealTimeRemaining } from '../../lib/deals'
import type { PromotionalDeal } from '../../types'

const EMOJI_OPTIONS = ['🔥', '🥬', '🍅', '🥔', '🎁', '🎉', '⚡', '🏷️', '🌟', '🌾']

type ExpiryPreset = 'never' | 'today_midnight' | '24h' | '3d' | '7d' | 'custom'

function computeExpiryIso(preset: ExpiryPreset, customVal?: string): string | undefined {
  const now = new Date()
  if (preset === 'never') return undefined
  if (preset === 'today_midnight') {
    const d = new Date(now)
    d.setHours(23, 59, 59, 999)
    return d.toISOString()
  }
  if (preset === '24h') {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  }
  if (preset === '3d') {
    return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()
  }
  if (preset === '7d') {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  }
  if (preset === 'custom' && customVal) {
    const d = new Date(customVal)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  return undefined
}

export default function SellerDeals() {
  const { user } = useAuth()
  const {
    promotionalDeals,
    addPromotionalDeal,
    updatePromotionalDeal,
    deletePromotionalDeal,
    togglePromotionalDeal,
    lang,
  } = useStore()

  const [activeTab, setActiveTab] = useState<'active' | 'expired' | 'all'>('active')
  const [editingDeal, setEditingDeal] = useState<PromotionalDeal | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  // Form state
  const [formBadgeBn, setFormBadgeBn] = useState('নতুন অফার')
  const [formBadgeEn, setFormBadgeEn] = useState('New Offer')
  const [formTitleBn, setFormTitleBn] = useState('')
  const [formTitleEn, setFormTitleEn] = useState('')
  const [formSubtitleBn, setFormSubtitleBn] = useState('')
  const [formSubtitleEn, setFormSubtitleEn] = useState('')
  const [formCoupon, setFormCoupon] = useState('')
  const [formLink, setFormLink] = useState('')
  const [formBtnBn, setFormBtnBn] = useState('কপি কোড')
  const [formBtnEn, setFormBtnEn] = useState('Copy Code')
  const [formGradient, setFormGradient] = useState(DEAL_GRADIENTS[0].value)
  const [formEmoji, setFormEmoji] = useState('🔥')
  const [formActive, setFormActive] = useState(true)
  const [formExpiryPreset, setFormExpiryPreset] = useState<ExpiryPreset>('never')
  const [formCustomDate, setFormCustomDate] = useState('')
  const [formAutoRemove, setFormAutoRemove] = useState(true)

  const openAddModal = () => {
    setEditingDeal(null)
    setFormBadgeBn('স্পেশাল অফার')
    setFormBadgeEn('Special Offer')
    setFormTitleBn('')
    setFormTitleEn('')
    setFormSubtitleBn('')
    setFormSubtitleEn('')
    setFormCoupon('')
    setFormLink('')
    setFormBtnBn('কপি কোড')
    setFormBtnEn('Copy Code')
    setFormGradient(DEAL_GRADIENTS[0].value)
    setFormEmoji('🔥')
    setFormActive(true)
    setFormExpiryPreset('never')
    setFormCustomDate('')
    setFormAutoRemove(true)
    setShowAddModal(true)
  }

  const openEditModal = (deal: PromotionalDeal) => {
    setEditingDeal(deal)
    setFormBadgeBn(deal.badgeBn || '')
    setFormBadgeEn(deal.badgeEn || '')
    setFormTitleBn(deal.titleBn || '')
    setFormTitleEn(deal.titleEn || '')
    setFormSubtitleBn(deal.subtitleBn || '')
    setFormSubtitleEn(deal.subtitleEn || '')
    setFormCoupon(deal.couponCode || '')
    setFormLink(deal.linkUrl || '')
    setFormBtnBn(deal.buttonTextBn || 'কপি কোড')
    setFormBtnEn(deal.buttonTextEn || 'Copy Code')
    setFormGradient(deal.bgGradient || DEAL_GRADIENTS[0].value)
    setFormEmoji(deal.emoji || '🔥')
    setFormActive(deal.isActive !== false)
    if (deal.expiresAt) {
      setFormExpiryPreset('custom')
      setFormCustomDate(new Date(deal.expiresAt).toISOString().slice(0, 16))
    } else {
      setFormExpiryPreset('never')
      setFormCustomDate('')
    }
    setFormAutoRemove(deal.autoRemoveOnExpiry !== false)
    setShowAddModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitleBn.trim() && !formTitleEn.trim()) {
      showToast(lang === 'bn' ? 'অফারের শিরোনাম লিখুন' : 'Please enter an offer title', '⚠️', 'error')
      return
    }

    const calculatedExpiry = computeExpiryIso(formExpiryPreset, formCustomDate)

    try {
      if (editingDeal) {
        await updatePromotionalDeal({
          ...editingDeal,
          badgeBn: formBadgeBn.trim(),
          badgeEn: formBadgeEn.trim(),
          titleBn: formTitleBn.trim() || formTitleEn.trim(),
          titleEn: formTitleEn.trim() || formTitleBn.trim(),
          subtitleBn: formSubtitleBn.trim(),
          subtitleEn: formSubtitleEn.trim(),
          couponCode: formCoupon.trim().toUpperCase() || undefined,
          linkUrl: formLink.trim() || undefined,
          buttonTextBn: formBtnBn.trim() || 'কপি কোড',
          buttonTextEn: formBtnEn.trim() || 'Copy Code',
          bgGradient: formGradient,
          emoji: formEmoji,
          isActive: formActive,
          expiresAt: calculatedExpiry,
          autoRemoveOnExpiry: formAutoRemove,
        })
        showToast(lang === 'bn' ? '✅ অফার আপডেট সফল হয়েছে!' : '✅ Offer updated successfully!', '🎉')
      } else {
        await addPromotionalDeal({
          badgeBn: formBadgeBn.trim() || 'অফার',
          badgeEn: formBadgeEn.trim() || 'Offer',
          titleBn: formTitleBn.trim() || formTitleEn.trim(),
          titleEn: formTitleEn.trim() || formTitleBn.trim(),
          subtitleBn: formSubtitleBn.trim(),
          subtitleEn: formSubtitleEn.trim(),
          couponCode: formCoupon.trim().toUpperCase() || undefined,
          linkUrl: formLink.trim() || undefined,
          buttonTextBn: formBtnBn.trim() || 'কপি কোড',
          buttonTextEn: formBtnEn.trim() || 'Copy Code',
          bgGradient: formGradient,
          emoji: formEmoji,
          isActive: formActive,
          expiresAt: calculatedExpiry,
          autoRemoveOnExpiry: formAutoRemove,
        })
        showToast(lang === 'bn' ? '✅ নতুন অফার যোগ হয়েছে!' : '✅ New promotional offer created!', '🎉')
      }
      setShowAddModal(false)
    } catch (err: any) {
      showToast(err?.message || 'Failed to save offer', '❌', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm(lang === 'bn' ? 'এই অফারটি মুছে ফেলবেন?' : 'Are you sure you want to delete this offer?')) {
      return
    }
    await deletePromotionalDeal(id)
    showToast(lang === 'bn' ? 'অফার মুছে ফেলা হয়েছে' : 'Offer deleted', '🗑️')
  }

  const handleRenew24h = async (deal: PromotionalDeal) => {
    const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await updatePromotionalDeal({
      ...deal,
      isActive: true,
      expiresAt: newExpiry,
    })
    showToast(lang === 'bn' ? '⚡ অফারটি পরবর্তী ২৪ ঘণ্টার জন্য নবায়ন করা হয়েছে!' : '⚡ Offer renewed for next 24 hours!', '🎉')
  }

  const handleResetDefaults = async () => {
    if (!window.confirm(lang === 'bn' ? 'ডিফল্ট অফারগুলো পুনরায় লোড করবেন?' : 'Reset to default promotional offers?')) {
      return
    }
    for (const d of DEFAULT_PROMOTIONAL_DEALS) {
      if (!promotionalDeals.some((p) => p.id === d.id)) {
        await addPromotionalDeal(d)
      }
    }
    showToast(lang === 'bn' ? 'ডিফল্ট অফার রিস্টোর হয়েছে' : 'Default offers restored', '✅')
  }

  // Filter deals based on activeTab
  const filteredDeals = useMemo(() => {
    return promotionalDeals.filter((d) => {
      const expired = isDealExpired(d)
      if (activeTab === 'active') return d.isActive !== false && !expired
      if (activeTab === 'expired') return d.isActive === false || expired
      return true
    })
  }, [promotionalDeals, activeTab])

  const activeCount = promotionalDeals.filter((d) => d.isActive !== false && !isDealExpired(d)).length
  const expiredCount = promotionalDeals.length - activeCount

  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="page" style={{ maxWidth: '1000px', margin: '0 auto', padding: '1rem' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link to="/seller" style={{ textDecoration: 'none', color: '#64748b', fontSize: '0.9rem' }}>
              ← {lang === 'bn' ? 'সেলার ড্যাশবোর্ড' : 'Seller Dashboard'}
            </Link>
          </div>
          <h1 style={{ margin: '0.35rem 0 0', fontSize: '1.6rem', fontWeight: 800, color: '#14532d', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🎟️ {lang === 'bn' ? 'হোমপেজ অফার ও অটো-রিমুভ ব্যানার ম্যানেজার' : 'Promotional Offers & Auto-Remove Manager'}
          </h1>
          <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            {lang === 'bn'
              ? 'অফার তৈরি করুন ও সময়সীমা (Auto-Expiry) দিন। সময় পার হলে হোমপেজ থেকে স্বয়ংক্রিয়ভাবে মুছে যাবে।'
              : 'Create custom offers with auto-expiry. Expired banners auto-remove from storefront without manual effort.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleResetDefaults}>
            🔄 {lang === 'bn' ? 'ডিফল্ট অফার' : 'Reset Defaults'}
          </button>
          <button type="button" className="btn btn-primary" onClick={openAddModal}>
            ➕ {lang === 'bn' ? 'নতুন অফার যোগ করুন' : 'Add New Offer'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'active' ? '#166534' : '#f1f5f9',
            color: activeTab === 'active' ? 'white' : '#475569',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          🟢 {lang === 'bn' ? 'সক্রিয় অফার' : 'Active Offers'} ({activeCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('expired')}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'expired' ? '#166534' : '#f1f5f9',
            color: activeTab === 'expired' ? 'white' : '#475569',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          ⏰ {lang === 'bn' ? 'মেয়াদোত্তীর্ণ / আর্কাইভ' : 'Expired / Archived'} ({expiredCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'all' ? '#166534' : '#f1f5f9',
            color: activeTab === 'all' ? 'white' : '#475569',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          👥 {lang === 'bn' ? 'সবগুলো' : 'All'} ({promotionalDeals.length})
        </button>
      </div>

      {/* Offers Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredDeals.map((deal) => {
          const expired = isDealExpired(deal)
          const isLive = deal.isActive !== false && !expired
          const remainingText = deal.expiresAt ? formatDealTimeRemaining(deal.expiresAt, lang) : ''

          return (
            <div
              key={deal.id}
              style={{
                borderRadius: '14px',
                border: isLive ? '1.5px solid #86efac' : '1.5px dashed #cbd5e1',
                background: '#ffffff',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                opacity: isLive ? 1 : 0.75,
              }}
            >
              {/* Preview Banner Strip */}
              <div
                style={{
                  background: deal.bgGradient || 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                  padding: '1rem 1.25rem',
                  color: 'white',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.35rem' }}>
                    <span style={{ background: 'rgba(255,255,255,0.25)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                      {deal.emoji || '🔥'} {deal.badgeBn} / {deal.badgeEn}
                    </span>

                    {expired ? (
                      <span style={{ background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 800 }}>
                        🛑 EXPIRED / AUTO-REMOVED
                      </span>
                    ) : remainingText ? (
                      <span style={{ background: 'rgba(0,0,0,0.3)', color: '#fef08a', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 800 }}>
                        ⏳ {remainingText}
                      </span>
                    ) : (
                      <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '6px', fontSize: '0.7rem' }}>
                        ♾️ Always Active
                      </span>
                    )}
                  </div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                    {deal.titleBn} <span style={{ opacity: 0.85, fontWeight: 500, fontSize: '0.9rem' }}>({deal.titleEn})</span>
                  </h4>
                  {(deal.subtitleBn || deal.subtitleEn) && (
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', opacity: 0.9 }}>
                      {deal.subtitleBn} · {deal.subtitleEn}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {deal.couponCode ? (
                    <div style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: '8px', border: '1px dashed white', fontWeight: 800, letterSpacing: '1px' }}>
                      🎟️ {deal.couponCode}
                    </div>
                  ) : deal.linkUrl ? (
                    <div style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: '8px', fontSize: '0.78rem' }}>
                      🔗 {deal.linkUrl}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Action Toolbar */}
              <div style={{ padding: '0.75rem 1.25rem', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={deal.isActive !== false}
                      onChange={(e) => togglePromotionalDeal(deal.id, e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: '#16a34a', cursor: 'pointer' }}
                    />
                    <span>{isLive ? (lang === 'bn' ? '🟢 হোমপেজে দৃশ্যমান' : '🟢 Live on Storefront') : (lang === 'bn' ? '⚪ বন্ধ / হাইড করা' : '⚪ Hidden')}</span>
                  </label>

                  {deal.expiresAt && (
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      📅 {lang === 'bn' ? 'মেয়াদ শেষ:' : 'Expires:'} {new Date(deal.expiresAt).toLocaleString()}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {expired && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e', fontWeight: 700 }}
                      onClick={() => handleRenew24h(deal)}
                    >
                      ⚡ {lang === 'bn' ? '২৪ ঘণ্টার জন্য নবায়ন' : 'Renew 24h'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEditModal(deal)}
                  >
                    ✏️ {lang === 'bn' ? 'এডিট' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#dc2626' }}
                    onClick={() => handleDelete(deal.id)}
                  >
                    🗑️ {lang === 'bn' ? 'মুছুন' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {filteredDeals.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', background: '#f8fafc', borderRadius: '12px', border: '2px dashed #cbd5e1' }}>
            <p style={{ color: '#64748b', fontSize: '1rem', margin: '0 0 1rem' }}>
              {activeTab === 'expired'
                ? (lang === 'bn' ? 'কোনো মেয়াদোত্তীর্ণ অফার নেই।' : 'No expired offers found.')
                : (lang === 'bn' ? 'কোনো সক্রিয় অফার নেই। নতুন অফার যোগ করুন!' : 'No active promotional offers found. Add a new offer!')}
            </p>
            <button type="button" className="btn btn-primary" onClick={openAddModal}>
              ➕ {lang === 'bn' ? 'নতুন অফার যোগ করুন' : 'Add New Offer'}
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '620px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#166534' }}>
                {editingDeal ? (lang === 'bn' ? '✏️ অফার সম্পাদনা' : '✏️ Edit Promotional Offer') : (lang === 'bn' ? '➕ নতুন অফার তৈরি' : '➕ Create New Promotional Offer')}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '1.3rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Live Preview Inside Modal */}
            <div style={{ marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                👁️ Live Preview
              </span>
              <div
                style={{
                  background: formGradient,
                  borderRadius: '12px',
                  padding: '0.85rem 1rem',
                  color: 'white',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ background: 'rgba(255,255,255,0.25)', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700 }}>
                    {formEmoji} {formBadgeBn || 'অফার'}
                  </span>
                  {formExpiryPreset !== 'never' && (
                    <span style={{ background: 'rgba(0,0,0,0.3)', color: '#fef08a', padding: '2px 6px', borderRadius: '8px', fontSize: '0.68rem', fontWeight: 700 }}>
                      ⏳ Auto-Expires
                    </span>
                  )}
                </div>
                <h4 style={{ margin: '0.35rem 0 0.1rem', fontSize: '1rem', fontWeight: 800 }}>
                  {formTitleBn || 'অফারের শিরোনাম এখানে প্রদর্শিত হবে'}
                </h4>
                <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.9 }}>
                  {formSubtitleBn || 'অফারের বিবরণ ও নিয়মাবলী'}
                </p>
                {formCoupon && (
                  <div style={{ marginTop: '0.4rem', display: 'inline-block', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800 }}>
                    🎟️ {formCoupon}
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Titles */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '3px' }}>
                    শিরোনাম (বাংলা) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitleBn}
                    onChange={(e) => setFormTitleBn(e.target.value)}
                    placeholder="যেমন: আলু ও পটলে অতিরিক্ত ১০% ছাড়!"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '3px' }}>
                    Title (English)
                  </label>
                  <input
                    type="text"
                    value={formTitleEn}
                    onChange={(e) => setFormTitleEn(e.target.value)}
                    placeholder="e.g. Extra 10% OFF on Potato & Parwal!"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              {/* Subtitles */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '3px' }}>
                    বিবরণ / শর্ত (বাংলা)
                  </label>
                  <input
                    type="text"
                    value={formSubtitleBn}
                    onChange={(e) => setFormSubtitleBn(e.target.value)}
                    placeholder="যেমন: ন্যূনতম ৫০০ টাকার অর্ডারে প্রযোজ্য"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '3px' }}>
                    Subtitle / Terms (English)
                  </label>
                  <input
                    type="text"
                    value={formSubtitleEn}
                    onChange={(e) => setFormSubtitleEn(e.target.value)}
                    placeholder="e.g. Applicable on orders above ₹500"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              {/* ⏱️ Auto Smart Expiry Setting */}
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                  ⏱️ অফার অটো-রিমুভ সময়সীমা (Auto Smart Expiry)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  {[
                    { id: 'never', label: '♾️ স্থায়ী (No Expiry)' },
                    { id: 'today_midnight', label: '🌙 আজ রাত ১২টা পর্যন্ত' },
                    { id: '24h', label: '⚡ পরবর্তী ২৪ ঘণ্টা' },
                    { id: '3d', label: '📅 ৩ দিন (Weekend)' },
                    { id: '7d', label: '🗓️ ১ সপ্তাহ' },
                    { id: 'custom', label: '🕒 নিজের মতো সময়' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setFormExpiryPreset(preset.id as ExpiryPreset)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: formExpiryPreset === preset.id ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                        background: formExpiryPreset === preset.id ? '#f0fdf4' : '#ffffff',
                        color: formExpiryPreset === preset.id ? '#15803d' : '#475569',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {formExpiryPreset === 'custom' && (
                  <div style={{ marginTop: '0.4rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px', color: '#475569' }}>
                      নির্দিষ্ট তারিখ ও সময় নির্বাচন করুন:
                    </label>
                    <input
                      type="datetime-local"
                      value={formCustomDate}
                      onChange={(e) => setFormCustomDate(e.target.value)}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    />
                  </div>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '0.4rem', cursor: 'pointer', fontSize: '0.78rem', color: '#475569' }}>
                  <input
                    type="checkbox"
                    checked={formAutoRemove}
                    onChange={(e) => setFormAutoRemove(e.target.checked)}
                    style={{ accentColor: '#16a34a' }}
                  />
                  <span>সময় শেষ হলে হোমপেজ থেকে ব্যানার অটো-হাইড হবে (Auto-remove from homepage)</span>
                </label>
              </div>

              {/* Badges & Emoji */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '0.65rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '3px' }}>
                    ব্যাজ ট্যাগ (বাংলা)
                  </label>
                  <input
                    type="text"
                    value={formBadgeBn}
                    onChange={(e) => setFormBadgeBn(e.target.value)}
                    placeholder="যেমন: ধামাকা অফার"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '3px' }}>
                    Badge Tag (English)
                  </label>
                  <input
                    type="text"
                    value={formBadgeEn}
                    onChange={(e) => setFormBadgeEn(e.target.value)}
                    placeholder="e.g. Flash Deal"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '3px' }}>
                    Emoji
                  </label>
                  <select
                    value={formEmoji}
                    onChange={(e) => setFormEmoji(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1.1rem' }}
                  >
                    {EMOJI_OPTIONS.map((em) => (
                      <option key={em} value={em}>
                        {em}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Coupon code & Link */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '3px' }}>
                    কুপন কোড (ঐচ্ছিক)
                  </label>
                  <input
                    type="text"
                    value={formCoupon}
                    onChange={(e) => setFormCoupon(e.target.value.toUpperCase())}
                    placeholder="যেমন: FIRST50"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontFamily: 'monospace', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '3px' }}>
                    টার্গেট লিংক (ঐচ্ছিক)
                  </label>
                  <input
                    type="text"
                    value={formLink}
                    onChange={(e) => setFormLink(e.target.value)}
                    placeholder="যেমন: / বা /cart"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              {/* Theme Gradient Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                  ব্যানার কালার থিম (Banner Theme)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {DEAL_GRADIENTS.map((g) => (
                    <div
                      key={g.label}
                      onClick={() => setFormGradient(g.value)}
                      style={{
                        background: g.value,
                        padding: '0.5rem',
                        borderRadius: '8px',
                        color: 'white',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textAlign: 'center',
                        cursor: 'pointer',
                        border: formGradient === g.value ? '2.5px solid #000000' : '1px solid transparent',
                      }}
                    >
                      {g.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0.35rem 0', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#16a34a' }}
                />
                <span>{lang === 'bn' ? 'হোমপেজে সাথে সাথে দৃশ্যমান করুন' : 'Display immediately on Homepage'}</span>
              </label>

              {/* Form Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button type="submit" className="btn btn-primary">
                  {lang === 'bn' ? 'সংরক্ষণ করুন' : 'Save Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
