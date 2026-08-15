import { useState, useMemo, useEffect } from 'react'
import type { Grade, Lang, Product } from '../types'
import { resolveProductImage } from '../lib/productImages'
import { showToast } from './Toast'

interface UsualStapleConfig {
  id: string
  defaultQty: number
  portionLabelEn: string
  portionLabelBn: string
}

const DEFAULT_STAPLES: UsualStapleConfig[] = [
  { id: 'p2', defaultQty: 1, portionLabelEn: '1 kg', portionLabelBn: '১ কেজি' }, // Potato
  { id: 'p3', defaultQty: 1, portionLabelEn: '1 kg', portionLabelBn: '১ কেজি' }, // Onion
  { id: 'p1', defaultQty: 1, portionLabelEn: '1 kg', portionLabelBn: '১ কেজি' }, // Tomato
  { id: 'p7', defaultQty: 1, portionLabelEn: '250g', portionLabelBn: '২৫০ গ্রাম' }, // Green Chili
  { id: 'p13', defaultQty: 1, portionLabelEn: '250g', portionLabelBn: '২৫০ গ্রাম' }, // Ginger
  { id: 'p12', defaultQty: 1, portionLabelEn: '250g', portionLabelBn: '২৫০ গ্রাম' }, // Garlic
  { id: 'p16', defaultQty: 1, portionLabelEn: '1 bunch', portionLabelBn: '১ আঁটি' }, // Coriander
  { id: 'p17', defaultQty: 1, portionLabelEn: '500g', portionLabelBn: '৫০০ গ্রাম' }, // Lemon
]

interface MyUsualBasketModalProps {
  isOpen: boolean
  onClose: () => void
  products: Product[]
  lang: Lang
  onAddBulk: (items: { product: Product; grade: Grade; qty: number }[]) => void
}

export default function MyUsualBasketModal({
  isOpen,
  onClose,
  products,
  lang,
  onAddBulk,
}: MyUsualBasketModalProps) {
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('gv_usual_basket_selection')
      if (saved) return JSON.parse(saved)
    } catch {
      // fallback
    }
    const init: Record<string, boolean> = {}
    DEFAULT_STAPLES.forEach((s) => {
      init[s.id] = true
    })
    return init
  })

  // Save changes to selection
  useEffect(() => {
    try {
      localStorage.setItem('gv_usual_basket_selection', JSON.stringify(selectedMap))
    } catch {
      // ignore
    }
  }, [selectedMap])

  // Resolve available staple products
  const stapleItems = useMemo(() => {
    return DEFAULT_STAPLES.map((cfg) => {
      const p = products.find((x) => x.id === cfg.id && !x.archived)
      return {
        cfg,
        product: p,
        available: Boolean(p && p.inStock),
      }
    }).filter((item) => item.product != null)
  }, [products])

  const toggleSelect = (productId: string) => {
    setSelectedMap((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }))
  }

  const selectAll = () => {
    const next: Record<string, boolean> = {}
    stapleItems.forEach((item) => {
      if (item.available) next[item.cfg.id] = true
    })
    setSelectedMap(next)
  }

  const deselectAll = () => {
    setSelectedMap({})
  }

  const { selectedCount, totalEstimate, itemsToAdd } = useMemo(() => {
    let count = 0
    let sum = 0
    const list: { product: Product; grade: Grade; qty: number }[] = []

    stapleItems.forEach(({ cfg, product, available }) => {
      if (product && available && selectedMap[cfg.id]) {
        count++
        const price = product.pB || product.pA || 0
        sum += price * cfg.defaultQty
        list.push({
          product,
          grade: 'B',
          qty: cfg.defaultQty,
        })
      }
    })

    return { selectedCount: count, totalEstimate: sum, itemsToAdd: list }
  }, [stapleItems, selectedMap])

  const handleAddAll = () => {
    if (itemsToAdd.length === 0) {
      showToast(
        lang === 'bn' ? 'অন্তত একটি সামগ্রী বাছুন' : 'Select at least 1 item',
        '⚠️',
        'error'
      )
      return
    }
    onAddBulk(itemsToAdd)
    onClose()
    showToast(
      lang === 'bn'
        ? `🎉 ${itemsToAdd.length} টি সামগ্রী কার্টে যোগ হয়েছে!`
        : `🎉 ${itemsToAdd.length} items added to your cart!`,
      '🧺',
      'success'
    )
  }

  if (!isOpen) return null

  return (
    <div className="glass-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="glass-modal-container glass-mono-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="glass-modal-header">
          <div className="glass-header-left">
            <span className="glass-modal-icon">🧺</span>
            <div>
              <div className="glass-title-row">
                <h2 className="glass-modal-title">
                  {lang === 'bn' ? 'আমার পছন্দের ফর্দ' : 'My Usual Basket'}
                </h2>
                <span className="glass-mono-badge">1-TAP EXPRESS</span>
              </div>
              <p className="glass-modal-subtitle">
                {lang === 'bn'
                  ? 'নিত্যপ্রয়োজনীয় রান্না সামগ্রী — ১-ট্যাপে কার্টে যোগ করুন'
                  : 'Daily Bengali kitchen essentials — 1-tap instant add'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="glass-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Quick select sub-bar */}
        <div className="glass-subbar">
          <span className="glass-mono-count">
            {selectedCount} / {stapleItems.filter((s) => s.available).length} SELECTED
          </span>
          <div className="glass-action-btns">
            <button type="button" onClick={selectAll} className="glass-text-btn">
              {lang === 'bn' ? 'সব বাছুন' : 'Select All'}
            </button>
            <span className="glass-divider">|</span>
            <button type="button" onClick={deselectAll} className="glass-text-btn">
              {lang === 'bn' ? 'মুছুন' : 'Clear'}
            </button>
          </div>
        </div>

        {/* Compact Glass Grid */}
        <div className="glass-modal-scroll">
          <div className="glass-items-compact-grid">
            {stapleItems.map(({ cfg, product, available }) => {
              if (!product) return null
              const isChecked = Boolean(selectedMap[cfg.id] && available)
              const img = resolveProductImage(
                product.id,
                product.imageUrl,
                `${product.name} ${product.bnName}`
              )
              const price = (product.pB || product.pA) * cfg.defaultQty

              return (
                <div
                  key={product.id}
                  className={`glass-item-row ${isChecked ? 'active' : ''} ${!available ? 'disabled' : ''}`}
                  onClick={() => available && toggleSelect(product.id)}
                >
                  <div className="glass-checkbox-wrapper">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!available}
                      onChange={() => toggleSelect(product.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="glass-checkbox"
                      aria-label={product.name}
                    />
                  </div>

                  <img
                    src={img}
                    alt={product.name}
                    className="glass-item-img"
                    loading="lazy"
                    onError={(e) => {
                      const el = e.currentTarget
                      const fallback = resolveProductImage(product.id, undefined, product.name)
                      if (!el.src.endsWith(fallback)) el.src = fallback
                    }}
                  />

                  <div className="glass-item-details">
                    <div className="glass-item-names">
                      <strong className="glass-bn-name">{product.bnName}</strong>
                      <span className="glass-en-name">{product.name}</span>
                    </div>
                    <span className="glass-mono-portion">
                      {lang === 'bn' ? cfg.portionLabelBn : cfg.portionLabelEn}
                    </span>
                  </div>

                  <div className="glass-item-price-col">
                    {available ? (
                      <span className="glass-mono-price">₹{price}</span>
                    ) : (
                      <span className="glass-out-badge">OUT</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Modal Footer with Live Mono Total & CTA */}
        <div className="glass-modal-footer">
          <div className="glass-total-block">
            <span className="glass-mono-label">ESTIMATED TOTAL</span>
            <span className="glass-mono-total">₹{totalEstimate}</span>
          </div>

          <button
            type="button"
            className="glass-cta-btn"
            onClick={handleAddAll}
            disabled={itemsToAdd.length === 0}
          >
            <span>🧺</span>
            <span>
              {lang === 'bn'
                ? `কার্টে যোগ করুন (${selectedCount})`
                : `Add All to Cart (${selectedCount})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
