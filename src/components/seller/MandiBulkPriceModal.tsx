import { useState, useMemo, useCallback, useEffect } from 'react'
import { useStore } from '../../context/useStore'
import { showToast } from '../../lib/toast'
import { resolveProductImage } from '../../lib/productImages'
import { computeMarketMrp, computeDiscountPercent } from '../../lib/business'
import type { Product } from '../../types'

interface MandiBulkPriceModalProps {
  onClose: () => void
}

interface ItemDraft {
  pA: number
  pB: number
  pC: number
  mrp: number
  inStock: boolean
}

export default function MandiBulkPriceModal({ onClose }: MandiBulkPriceModalProps) {
  const { products, bulkUpdateProducts, lang } = useStore()

  // Initialize draft state with only active (non-archived) products
  const activeProducts = useMemo(() => products.filter((p) => !p.archived), [products])

  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>(() => {
    const init: Record<string, ItemDraft> = {}
    activeProducts.forEach((p) => {
      init[p.id] = {
        pA: p.pA || 0,
        pB: p.pB || 0,
        pC: p.pC || 0,
        mrp: p.mrp || 0,
        inStock: p.inStock ?? true,
      }
    })
    return init
  })

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [showOnlyModified, setShowOnlyModified] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null)

  // Keep drafts synchronized if new active products arrive
  useEffect(() => {
    setDrafts((prev) => {
      let changed = false
      const next = { ...prev }
      activeProducts.forEach((p) => {
        if (!next[p.id]) {
          next[p.id] = {
            pA: p.pA || 0,
            pB: p.pB || 0,
            pC: p.pC || 0,
            mrp: p.mrp || 0,
            inStock: p.inStock ?? true,
          }
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [activeProducts])

  // Helper to check if an individual item has changed
  const isItemModified = useCallback(
    (p: Product) => {
      const d = drafts[p.id]
      if (!d) return false
      return (
        d.pA !== (p.pA || 0) ||
        d.pB !== (p.pB || 0) ||
        d.pC !== (p.pC || 0) ||
        (d.mrp || 0) !== (p.mrp || 0) ||
        d.inStock !== (p.inStock ?? true)
      )
    },
    [drafts],
  )

  // List of all modified products
  const modifiedProducts = useMemo(() => {
    return activeProducts.filter(isItemModified)
  }, [activeProducts, isItemModified])

  // Filtered view
  const displayList = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activeProducts.filter((p) => {
      if (catFilter !== 'all' && p.category !== catFilter) return false
      if (showOnlyModified && !isItemModified(p)) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.bnName && p.bnName.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q)
      )
    })
  }, [activeProducts, catFilter, showOnlyModified, search, isItemModified])

  // Handler for single field changes
  const updateField = (id: string, field: keyof ItemDraft, val: number | boolean) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { pA: 0, pB: 0, pC: 0, mrp: 0, inStock: true }),
        [field]: val,
      },
    }))
  }

  // Bulk rate adjustment for currently filtered items
  const applyBulkAdjustment = (type: 'flat' | 'percent', val: number) => {
    if (val === 0) return
    setDrafts((prev) => {
      const next = { ...prev }
      displayList.forEach((p) => {
        const cur = next[p.id] || { pA: p.pA, pB: p.pB, pC: p.pC, mrp: p.mrp || 0, inStock: p.inStock }
        let newA = cur.pA
        let newB = cur.pB
        let newC = cur.pC

        if (type === 'flat') {
          newA = Math.max(1, Math.round(cur.pA + val))
          newB = cur.pB > 0 ? Math.max(1, Math.round(cur.pB + val)) : 0
          newC = cur.pC > 0 ? Math.max(1, Math.round(cur.pC + val)) : 0
        } else {
          newA = Math.max(1, Math.round(cur.pA * (1 + val / 100)))
          newB = cur.pB > 0 ? Math.max(1, Math.round(cur.pB * (1 + val / 100))) : 0
          newC = cur.pC > 0 ? Math.max(1, Math.round(cur.pC * (1 + val / 100))) : 0
        }

        next[p.id] = {
          ...cur,
          pA: newA,
          pB: newB,
          pC: newC,
        }
      })
      return next
    })

    const desc = type === 'flat' ? `${val > 0 ? '+' : ''}₹${val}` : `${val > 0 ? '+' : ''}${val}%`
    showToast(
      lang === 'bn'
        ? `⚡ ${displayList.length}টি পণ্যের উপর ${desc} সমন্বয় প্রয়োগ করা হয়েছে!`
        : `⚡ Applied ${desc} adjustment to ${displayList.length} items!`,
      '⚡',
    )
  }

  // Quick reset for all drafts
  const handleDiscardAll = () => {
    if (modifiedProducts.length === 0) {
      onClose()
      return
    }
    const confirmDiscard = window.confirm(
      lang === 'bn'
        ? 'আপনি কি পরিবর্তনগুলো বাতিল করতে চান?'
        : 'Do you want to discard all unsaved price changes?',
    )
    if (!confirmDiscard) return

    const reset: Record<string, ItemDraft> = {}
    activeProducts.forEach((p) => {
      reset[p.id] = {
        pA: p.pA || 0,
        pB: p.pB || 0,
        pC: p.pC || 0,
        mrp: p.mrp || 0,
        inStock: p.inStock ?? true,
      }
    })
    setDrafts(reset)
    showToast(lang === 'bn' ? 'সকল পরিবর্তন বাতিল করা হয়েছে' : 'All changes discarded', '↩️')
  }

  // Save all modified items to Supabase
  const handleSaveAll = async () => {
    if (modifiedProducts.length === 0) {
      showToast(lang === 'bn' ? 'কোনো পরিবর্তন নেই' : 'No changes to save', 'ℹ️')
      onClose()
      return
    }

    setIsSaving(true)
    setProgress({ completed: 0, total: modifiedProducts.length })

    const productsToUpdate: Product[] = modifiedProducts.map((p) => {
      const d = drafts[p.id]
      return {
        ...p,
        pA: d.pA,
        pB: d.pB,
        pC: d.pC,
        mrp: d.mrp > 0 ? d.mrp : undefined,
        inStock: d.inStock,
      }
    })

    try {
      const res = await bulkUpdateProducts(productsToUpdate, (completed, total) => {
        setProgress({ completed, total })
      })

      if (res.success) {
        showToast(
          lang === 'bn'
            ? `🎉 সফল! ${res.count}টি পণ্যের মান্ডি রেট লাইভ সেভ হয়েছে!`
            : `🎉 Success! ${res.count} products updated with new morning rates!`,
          '✅',
        )
        onClose()
      } else {
        showToast(res.error || 'Failed to save some products', 'error')
      }
    } catch (err: any) {
      showToast(err?.message || 'Error updating morning rates', 'error')
    } finally {
      setIsSaving(false)
      setProgress(null)
    }
  }

  return (
    <div className="glass-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="glass-modal-container glass-mono-panel"
        style={{ maxWidth: '980px', width: '96%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="glass-modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
          <div className="glass-header-left">
            <span className="glass-modal-icon" style={{ fontSize: '1.75rem' }}>⚡</span>
            <div>
              <div className="glass-title-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 className="glass-modal-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                  {lang === 'bn' ? 'দৈনিক মান্ডি রেট / দ্রুত দাম আপডেট' : 'Morning Mandi Bulk Rates'}
                </h2>
                <span
                  style={{
                    background: '#ecfdf5',
                    color: '#059669',
                    border: '1px solid #a7f3d0',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  ⚡ LIVE MANDI SYNC
                </span>
              </div>
              <p className="glass-modal-subtitle" style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                {lang === 'bn'
                  ? 'সকালের বাজার দর এক ক্লিকে আপডেট করুন — সেভ করলে সব কাস্টমার ও রাইডারের স্ক্রিনে সঙ্গে সঙ্গে আপডেট হবে।'
                  : 'Quickly set morning market rates in a spreadsheet view — saves live to all customers instantly.'}
              </p>
            </div>
          </div>
          <button type="button" className="glass-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Action Toolbar & Filters */}
        <div
          style={{
            padding: '12px 18px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Search and Category Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', flex: 1, minWidth: '280px' }}>
            <input
              type="text"
              placeholder={lang === 'bn' ? '🔍 পণ্য খুঁজুন (আলু, পেঁয়াজ, টমেটো)...' : '🔍 Search item...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.84rem',
                minWidth: '200px',
              }}
            />

            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: lang === 'bn' ? 'সব' : 'All' },
                { id: 'Vegetables', label: lang === 'bn' ? 'সবজি' : 'Vegetables' },
                { id: 'Leafy', label: lang === 'bn' ? 'শাক' : 'Greens' },
                { id: 'Spices', label: lang === 'bn' ? 'মশলা' : 'Spices' },
                { id: 'Fruits', label: lang === 'bn' ? 'ফল' : 'Fruits' },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCatFilter(c.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    border: '1px solid',
                    cursor: 'pointer',
                    background: catFilter === c.id ? '#166534' : '#ffffff',
                    color: catFilter === c.id ? '#ffffff' : '#475569',
                    borderColor: catFilter === c.id ? '#166534' : '#cbd5e1',
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, color: '#334155', cursor: 'pointer', marginLeft: '4px' }}>
              <input
                type="checkbox"
                checked={showOnlyModified}
                onChange={(e) => setShowOnlyModified(e.target.checked)}
              />
              {lang === 'bn' ? 'কেবল পরিবর্তিত পণ্য' : 'Only modified'} ({modifiedProducts.length})
            </label>
          </div>

          {/* Quick Bulk Adjust Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b' }}>
              {lang === 'bn' ? 'একযোগে সমন্বয়:' : 'Bulk adjust:'}
            </span>
            <button
              type="button"
              onClick={() => applyBulkAdjustment('flat', 2)}
              style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontWeight: 600 }}
              title="Add ₹2 to all displayed items"
            >
              +₹2
            </button>
            <button
              type="button"
              onClick={() => applyBulkAdjustment('flat', -2)}
              style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontWeight: 600 }}
              title="Minus ₹2 from all displayed items"
            >
              -₹2
            </button>
            <button
              type="button"
              onClick={() => applyBulkAdjustment('flat', 5)}
              style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontWeight: 600 }}
              title="Add ₹5 to all displayed items"
            >
              +₹5
            </button>
            <button
              type="button"
              onClick={() => applyBulkAdjustment('flat', -5)}
              style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontWeight: 600 }}
              title="Minus ₹5 from all displayed items"
            >
              -₹5
            </button>
            <button
              type="button"
              onClick={() => applyBulkAdjustment('percent', 5)}
              style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontWeight: 600 }}
              title="Increase 5% on all displayed items"
            >
              +5%
            </button>
            <button
              type="button"
              onClick={() => applyBulkAdjustment('percent', -5)}
              style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontWeight: 600 }}
              title="Decrease 5% on all displayed items"
            >
              -5%
            </button>
          </div>
        </div>

        {/* Spreadsheet Data Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#475569', position: 'sticky', top: 0, zIndex: 10, borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px' }}>{lang === 'bn' ? 'পণ্য' : 'Item'}</th>
                <th style={{ padding: '10px 10px', textAlign: 'center' }}>{lang === 'bn' ? 'স্টক' : 'Stock'}</th>
                <th style={{ padding: '10px 10px' }}>Grade A (₹)</th>
                <th style={{ padding: '10px 10px' }}>Grade B (₹)</th>
                <th style={{ padding: '10px 10px' }}>Grade C (₹)</th>
                <th style={{ padding: '10px 10px' }}>MRP (₹)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>{lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {displayList.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    {lang === 'bn' ? 'কোনো পণ্য খুঁজে পাওয়া যায়নি।' : 'No products found.'}
                  </td>
                </tr>
              ) : (
                displayList.map((p) => {
                  const d = drafts[p.id] || { pA: p.pA, pB: p.pB, pC: p.pC, mrp: p.mrp || 0, inStock: p.inStock }
                  const modified = isItemModified(p)
                  const hasGradeC = p.availableGrades?.includes('C') || p.pC > 0
                  const hasGradeB = p.availableGrades?.includes('B') || p.pB > 0
                  const autoMrp = d.mrp || computeMarketMrp(d.pA, undefined, p.name)
                  const discountPct = computeDiscountPercent(autoMrp, d.pA)

                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: modified ? '#fffbeb' : '#ffffff',
                        transition: 'background 0.2s',
                      }}
                    >
                      {/* Product details */}
                      <td style={{ padding: '8px 14px', minWidth: '180px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <img
                            src={resolveProductImage(p.id, p.imageUrl, `${p.name} ${p.bnName}`)}
                            alt=""
                            style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover', border: '1px solid #e2e8f0' }}
                          />
                          <div>
                            <div style={{ fontWeight: 700, color: '#1e293b' }}>
                              {lang === 'bn' ? p.bnName || p.name : p.name}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                              {lang === 'bn' ? p.name : p.bnName || ''} · <span style={{ fontWeight: 600 }}>{p.unit}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Stock toggle */}
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => updateField(p.id, 'inStock', !d.inStock)}
                          style={{
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            border: '1px solid',
                            cursor: 'pointer',
                            background: d.inStock ? '#dcfce7' : '#fee2e2',
                            color: d.inStock ? '#166534' : '#991b1b',
                            borderColor: d.inStock ? '#86efac' : '#fca5a5',
                          }}
                        >
                          {d.inStock ? 'IN' : 'OUT'}
                        </button>
                      </td>

                      {/* Grade A Input */}
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>₹</span>
                          <input
                            type="number"
                            min={0}
                            value={d.pA}
                            onChange={(e) => updateField(p.id, 'pA', Math.max(0, Number(e.target.value) || 0))}
                            style={{
                              width: '70px',
                              padding: '5px 8px',
                              borderRadius: '4px',
                              border: modified && d.pA !== p.pA ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                              fontWeight: 700,
                              fontSize: '0.9rem',
                            }}
                          />
                        </div>
                      </td>

                      {/* Grade B Input */}
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>₹</span>
                          <input
                            type="number"
                            min={0}
                            value={d.pB}
                            disabled={!hasGradeB}
                            onChange={(e) => updateField(p.id, 'pB', Math.max(0, Number(e.target.value) || 0))}
                            style={{
                              width: '70px',
                              padding: '5px 8px',
                              borderRadius: '4px',
                              border: modified && d.pB !== p.pB ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                              fontWeight: 700,
                              fontSize: '0.9rem',
                              background: !hasGradeB ? '#f1f5f9' : '#ffffff',
                              color: !hasGradeB ? '#94a3b8' : '#0f172a',
                            }}
                          />
                        </div>
                      </td>

                      {/* Grade C Input */}
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>₹</span>
                          <input
                            type="number"
                            min={0}
                            value={d.pC}
                            disabled={!hasGradeC}
                            onChange={(e) => updateField(p.id, 'pC', Math.max(0, Number(e.target.value) || 0))}
                            style={{
                              width: '70px',
                              padding: '5px 8px',
                              borderRadius: '4px',
                              border: modified && d.pC !== p.pC ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                              fontWeight: 700,
                              fontSize: '0.9rem',
                              background: !hasGradeC ? '#f1f5f9' : '#ffffff',
                              color: !hasGradeC ? '#94a3b8' : '#0f172a',
                            }}
                          />
                        </div>
                      </td>

                      {/* Market MRP & Discount Preview */}
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>₹</span>
                          <input
                            type="number"
                            min={0}
                            placeholder={String(autoMrp)}
                            value={d.mrp || ''}
                            onChange={(e) => updateField(p.id, 'mrp', Math.max(0, Number(e.target.value) || 0))}
                            style={{
                              width: '70px',
                              padding: '5px 8px',
                              borderRadius: '4px',
                              border: modified && d.mrp !== (p.mrp || 0) ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                              fontSize: '0.86rem',
                            }}
                          />
                          {discountPct > 0 && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                color: '#16a34a',
                                fontWeight: 700,
                                background: '#dcfce7',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {discountPct}% OFF
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Row status indicator */}
                      <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                        {modified ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#b45309',
                              background: '#fef3c7',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: '1px solid #fde68a',
                            }}
                          >
                            ✏️ {lang === 'bn' ? 'নতুন দর' : 'Changed'}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                            {lang === 'bn' ? 'অপরিবর্তিত' : 'Unchanged'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Sticky Footer Actions */}
        <div
          style={{
            padding: '12px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.86rem', color: '#475569', fontWeight: 600 }}>
              {modifiedProducts.length > 0 ? (
                <strong style={{ color: '#b45309' }}>
                  ✏️ {modifiedProducts.length} {lang === 'bn' ? 'টি পণ্যের দাম পরিবর্তিত হয়েছে' : 'items modified'}
                </strong>
              ) : (
                <span style={{ color: '#64748b' }}>
                  ✓ {lang === 'bn' ? 'সব পণ্য বর্তমান রেটে আছে' : 'All items match current prices'}
                </span>
              )}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleDiscardAll}
              disabled={isSaving}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontWeight: 600,
                fontSize: '0.86rem',
                cursor: 'pointer',
              }}
            >
              {modifiedProducts.length > 0
                ? lang === 'bn'
                  ? 'পরিবর্তন বাতিল করুন'
                  : 'Discard Changes'
                : lang === 'bn'
                  ? 'বন্ধ করুন'
                  : 'Close'}
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving || modifiedProducts.length === 0}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                border: 'none',
                background: modifiedProducts.length > 0 ? '#166534' : '#94a3b8',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: modifiedProducts.length > 0 && !isSaving ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: modifiedProducts.length > 0 ? '0 2px 6px rgba(22, 101, 52, 0.25)' : 'none',
              }}
            >
              {isSaving ? (
                <>
                  <span className="spinner" style={{ width: '14px', height: '14px', border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  {progress
                    ? `${lang === 'bn' ? 'সেভ হচ্ছে' : 'Saving'} ${progress.completed}/${progress.total}...`
                    : lang === 'bn'
                      ? 'সেভ হচ্ছে...'
                      : 'Saving...'}
                </>
              ) : (
                <>
                  💾 {lang === 'bn' ? `সব সেভ করুন (${modifiedProducts.length})` : `Save All Rates (${modifiedProducts.length})`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
