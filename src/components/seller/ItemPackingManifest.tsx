import { useState, useMemo, useEffect } from 'react'
import type { Order, Product, Lang, Grade, DeliverySlot } from '../../types'
import { showToast } from '../../lib/toast'

interface ItemPackingManifestProps {
  orders: Order[]
  products: Product[]
  lang: Lang
  onSelectOrder?: (orderId: string) => void
}

export interface ManifestOrderItem {
  orderId: string
  userName: string
  phone: string
  address: string
  pin: string
  slot?: DeliverySlot
  deliveryDate?: string
  qty: number
  unitPrice: number
  weightMultiplier?: number
  weightLabel?: string
  status: string
  itemKey: string // unique order-level key for packing checkbox
}

export interface AggregatedItem {
  id: string
  productId: string
  name: string
  bnName: string
  emoji: string
  grade: Grade
  category: string
  unitType: 'kg' | 'pc' | 'packet' | 'bundle'
  totalQty: number // numeric total (kg or count)
  displayTotal: string
  orderLines: ManifestOrderItem[]
  ordersCount: number
}

function escapeHtml(str: unknown): string {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const CATEGORY_NAMES: Record<string, { en: string; bn: string; icon: string }> = {
  vegetables: { en: 'Fresh Vegetables', bn: 'তাজা শাক-সবজি', icon: '🥬' },
  vegetable: { en: 'Fresh Vegetables', bn: 'তাজা শাক-সবজি', icon: '🥬' },
  fish: { en: 'Fish & Seafood', bn: 'মাছ ও সামুদ্রিক খাদ্য', icon: '🐟' },
  meat: { en: 'Meat & Poultry', bn: 'মাংস ও মুরগি', icon: '🍗' },
  eggs: { en: 'Eggs & Dairy', bn: 'ডিম ও দুগ্ধজাত সামগ্রী', icon: '🥚' },
  dairy: { en: 'Eggs & Dairy', bn: 'ডিম ও দুগ্ধজাত সামগ্রী', icon: '🥛' },
  fruits: { en: 'Fresh Fruits', bn: 'তাজা ফলমূল', icon: '🍎' },
  fruit: { en: 'Fresh Fruits', bn: 'তাজা ফলমূল', icon: '🍎' },
  grocery: { en: 'Groceries & Staples', bn: 'মুদি ও নিত্যপ্রয়োজনীয়', icon: '🌾' },
  other: { en: 'Other Essentials', bn: 'অন্যান্য প্রয়োজনীয় সামগ্রী', icon: '📦' },
}

const STORAGE_KEY = 'gv_packing_manifest_checks_v1'

export default function ItemPackingManifest({
  orders,
  products,
  lang,
  onSelectOrder,
}: ItemPackingManifestProps) {
  // Filter States
  const [slotFilter, setSlotFilter] = useState<'all' | 'morning' | 'evening'>('all')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'tomorrow'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [hidePacked, setHidePacked] = useState(false)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  // Packing Checklist Checkboxes State (persisted in localStorage)
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedMap))
    } catch {
      // ignore
    }
  }, [checkedMap])

  const toggleCheck = (key: string) => {
    setCheckedMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const toggleAllInItem = (item: AggregatedItem, markAs: boolean) => {
    setCheckedMap((prev) => {
      const next = { ...prev }
      item.orderLines.forEach((ol) => {
        next[ol.itemKey] = markAs
      })
      return next
    })
  }

  const handleResetChecks = () => {
    if (
      !confirm(
        lang === 'bn'
          ? 'সকল প্যাকিং চেকমার্ক রিসেট করতে চান?'
          : 'Reset all packing checkmarks?'
      )
    )
      return
    setCheckedMap({})
    showToast(lang === 'bn' ? 'চেকমার্ক রিসেট হয়েছে' : 'Checkmarks reset', '🔄')
  }

  // Active Orders Filter (Ignore cancelled and already delivered)
  const activeOrders = useMemo(() => {
    const todayIso = new Date().toISOString().split('T')[0]
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowIso = tomorrow.toISOString().split('T')[0]

    return orders.filter((o) => {
      if (o.status === 'cancelled' || o.status === 'delivered') return false

      // Slot filter
      if (slotFilter === 'morning' && o.deliverySlot !== 'morning' && o.deliverySlot) return false
      if (slotFilter === 'evening' && o.deliverySlot !== 'evening') return false

      // Date filter
      if (dateFilter === 'today') {
        const isTodayDate =
          o.deliveryDate === todayIso ||
          ((!o.deliveryDate || o.deliveryDate === 'standard') &&
            new Date(o.createdAt).toDateString() === new Date().toDateString())
        if (!isTodayDate) return false
      }
      if (dateFilter === 'tomorrow') {
        const isTomorrowDate = o.deliveryDate === tomorrowIso
        if (!isTomorrowDate) return false
      }

      return true
    })
  }, [orders, slotFilter, dateFilter])

  // Aggregation Engine: calculate kg vs pcs vs packets
  const aggregatedItems = useMemo(() => {
    const itemMap = new Map<string, AggregatedItem>()

    activeOrders.forEach((order) => {
      order.items.forEach((it, itemIdx) => {
        const matchedProduct = products.find((p) => p.id === it.productId)
        const categoryKey = (matchedProduct?.category || 'other').toLowerCase()
        const grade = it.grade || 'A'
        const aggregateKey = `${it.productId || it.name}_${grade}`

        // Determine Unit Type
        let unitType: AggregatedItem['unitType'] = 'kg'
        const unitStr = (matchedProduct?.unit || '').toLowerCase()
        const nameLower = (it.name || '').toLowerCase()
        const weightLabelLower = (it.weightLabel || '').toLowerCase()

        if (
          unitStr.includes('pc') ||
          unitStr.includes('piece') ||
          unitStr.includes('পিস') ||
          unitStr.includes('egg') ||
          unitStr.includes('ডিম') ||
          nameLower.includes('egg') ||
          nameLower.includes('ডিম') ||
          weightLabelLower.includes('pc')
        ) {
          unitType = 'pc'
        } else if (
          unitStr.includes('bundle') ||
          nameLower.includes('শাক') ||
          weightLabelLower.includes('আঁটি')
        ) {
          unitType = 'bundle'
        } else if (unitStr.includes('pkt') || unitStr.includes('packet')) {
          unitType = 'packet'
        }

        // Calculate quantity
        let lineQty = 0
        if (unitType === 'pc' || unitType === 'packet' || unitType === 'bundle') {
          lineQty = Number(it.qty) || 1
        } else {
          // Weight based in KG
          const mult = Number(it.weightMultiplier)
          if (mult && !isNaN(mult)) {
            lineQty = it.qty * mult
          } else if (it.weightLabel) {
            // parse from weight label e.g. "500g", "250g", "1.5 kg"
            const label = it.weightLabel.toLowerCase()
            if (label.includes('g') && !label.includes('kg')) {
              const grams = parseFloat(label.replace(/[^\d.]/g, ''))
              lineQty = isNaN(grams) ? it.qty : (grams / 1000) * it.qty
            } else if (label.includes('kg')) {
              const kgVal = parseFloat(label.replace(/[^\d.]/g, ''))
              lineQty = isNaN(kgVal) ? it.qty : kgVal * it.qty
            } else {
              lineQty = it.qty
            }
          } else {
            lineQty = it.qty
          }
        }

        const orderLine: ManifestOrderItem = {
          orderId: order.id,
          userName: order.userName || 'Customer',
          phone: order.phone || '',
          address: order.address || '',
          pin: order.pin || '',
          slot: order.deliverySlot,
          deliveryDate: order.deliveryDate,
          qty: it.qty,
          unitPrice: it.unitPrice,
          weightMultiplier: it.weightMultiplier,
          weightLabel: it.weightLabel,
          status: order.status,
          itemKey: `${order.id}_${it.productId || it.name}_${itemIdx}`,
        }

        if (itemMap.has(aggregateKey)) {
          const existing = itemMap.get(aggregateKey)!
          existing.totalQty += lineQty
          existing.orderLines.push(orderLine)
          existing.ordersCount = new Set(existing.orderLines.map((l) => l.orderId)).size
        } else {
          itemMap.set(aggregateKey, {
            id: aggregateKey,
            productId: it.productId,
            name: it.name,
            bnName: matchedProduct?.bnName || '',
            emoji: it.emoji || matchedProduct?.emoji || '📦',
            grade,
            category: categoryKey,
            unitType,
            totalQty: lineQty,
            displayTotal: '',
            orderLines: [orderLine],
            ordersCount: 1,
          })
        }
      })
    })

    // Format display totals
    const result: AggregatedItem[] = Array.from(itemMap.values()).map((item) => {
      let display = ''
      if (item.unitType === 'kg') {
        const rounded = Math.round(item.totalQty * 100) / 100
        display = `${rounded.toFixed(rounded % 1 === 0 ? 0 : 2)} kg`
      } else if (item.unitType === 'pc') {
        const count = Math.round(item.totalQty)
        const dozens = count >= 12 ? ` (${(count / 12).toFixed(count % 12 === 0 ? 0 : 1)} doz)` : ''
        display = `${count} pcs${dozens}`
      } else if (item.unitType === 'bundle') {
        display = `${Math.round(item.totalQty)} আঁটি / Bundles`
      } else {
        display = `${Math.round(item.totalQty)} Packets`
      }

      return {
        ...item,
        displayTotal: display,
      }
    })

    // Sort by Category, then total quantity descending
    return result.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return b.totalQty - a.totalQty
    })
  }, [activeOrders, products])

  // Filtered Items (by category, search, hidePacked)
  const filteredItems = useMemo(() => {
    return aggregatedItems.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matches =
          item.name.toLowerCase().includes(q) ||
          item.bnName.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        if (!matches) return false
      }

      if (hidePacked) {
        const allPacked =
          item.orderLines.length > 0 &&
          item.orderLines.every((ol) => checkedMap[ol.itemKey])
        if (allPacked) return false
      }

      return true
    })
  }, [aggregatedItems, categoryFilter, searchQuery, hidePacked, checkedMap])

  // Group by Category
  const groupedByCategory = useMemo(() => {
    const map = new Map<string, AggregatedItem[]>()
    filteredItems.forEach((it) => {
      const cat = it.category || 'other'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(it)
    })
    return map
  }, [filteredItems])

  // Overall Metrics
  const metrics = useMemo(() => {
    let totalKg = 0
    let totalPcs = 0
    let totalOrderLinesCount = 0
    let packedOrderLinesCount = 0

    aggregatedItems.forEach((item) => {
      if (item.unitType === 'kg') {
        totalKg += item.totalQty
      } else {
        totalPcs += item.totalQty
      }
      item.orderLines.forEach((ol) => {
        totalOrderLinesCount++
        if (checkedMap[ol.itemKey]) packedOrderLinesCount++
      })
    })

    const percent =
      totalOrderLinesCount > 0
        ? Math.round((packedOrderLinesCount / totalOrderLinesCount) * 100)
        : 0

    return {
      distinctItems: aggregatedItems.length,
      totalKg: Math.round(totalKg * 10) / 10,
      totalPcs: Math.round(totalPcs),
      totalLines: totalOrderLinesCount,
      packedLines: packedOrderLinesCount,
      percent,
    }
  }, [aggregatedItems, checkedMap])

  // 🖨️ Print Dedicated Mandi & Packing Sourcing Sheet
  const handlePrintSheet = () => {
    const dateStr = new Date().toLocaleDateString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

    let tableRowsHtml = ''
    for (const [catKey, items] of groupedByCategory.entries()) {
      const catMeta = CATEGORY_NAMES[catKey] || {
        en: catKey.toUpperCase(),
        bn: catKey,
        icon: '📦',
      }
      tableRowsHtml += `
        <tr style="background:#f0fdf4;font-weight:bold;color:#166534">
          <td colspan="5" style="padding:8px 10px;font-size:14px;border-top:2px solid #86efac">
            ${catMeta.icon} ${escapeHtml(catMeta.en)} (${escapeHtml(catMeta.bn)}) — ${items.length} Items
          </td>
        </tr>
      `
      items.forEach((it, idx) => {
        const bnText = it.bnName ? ` / ${escapeHtml(it.bnName)}` : ''
        const gradeText = it.grade ? ` [G${it.grade}]` : ''
        tableRowsHtml += `
          <tr>
            <td style="text-align:center;width:35px">${idx + 1}</td>
            <td style="font-weight:600">
              ${escapeHtml(it.emoji)} ${escapeHtml(it.name)}${bnText} <span style="font-size:11px;color:#0369a1">${gradeText}</span>
            </td>
            <td style="text-align:center;font-weight:bold;font-size:14px;color:#15803d">
              ${escapeHtml(it.displayTotal)}
            </td>
            <td style="text-align:center;color:#6b7280;font-size:12px">
              ${it.ordersCount} orders
            </td>
            <td style="text-align:center;font-size:16px;width:60px">
              [ &nbsp; ]
            </td>
          </tr>
        `
      })
    }

    const title =
      lang === 'bn'
        ? 'গ্রিনভেস্ট মণ্ডি সোর্সিং ও আইটেম প্যাকিং শিট'
        : 'GreenVest Mandi Sourcing & Item Packing Sheet'

    const html = `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: 'Hind Siliguri', 'Noto Sans Bengali', system-ui, -apple-system, sans-serif; padding: 20px; color: #111; font-size: 13px; }
      h1 { margin: 0 0 4px; font-size: 22px; color: #166534; display: flex; align-items: center; gap: 8px; }
      .meta-box { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #166534; padding-bottom: 10px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #d1d5db; padding: 7px 10px; text-align: left; }
      th { background: #f9fafb; font-size: 11px; text-transform: uppercase; color: #374151; }
      .summary-pills { display: flex; gap: 12px; margin-bottom: 12px; }
      .pill { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 12px; font-weight: bold; font-size: 13px; }
      .sig-area { margin-top: 30px; display: flex; justify-content: space-between; padding-top: 15px; border-top: 1px dashed #ccc; font-size: 12px; }
    </style></head><body>
      <div class="meta-box">
        <div>
          <h1>🌿 ${escapeHtml(title)}</h1>
          <div style="color:#4b5563;font-size:12px">Date: ${escapeHtml(dateStr)} · Delivery Window: 12–24h · Active Orders: ${activeOrders.length}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:bold;color:#15803d">Total Sourcing: ${metrics.totalKg} kg | ${metrics.totalPcs} pcs</div>
        </div>
      </div>

      <div class="summary-pills">
        <div class="pill">📦 Total Items: ${metrics.distinctItems}</div>
        <div class="pill">⚖️ Total Weight: ${metrics.totalKg} kg</div>
        <div class="pill">🥚 Pieces/Packets: ${metrics.totalPcs}</div>
        <div class="pill">📋 Total Customer Orders: ${activeOrders.length}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:35px">#</th>
            <th>Item Name (আইটেমের নাম)</th>
            <th style="text-align:center;width:140px">Required Total (মোট পরিমাণ)</th>
            <th style="text-align:center;width:90px">Orders</th>
            <th style="text-align:center;width:60px">Bought / Packed</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <div class="sig-area">
        <div>Procured / Sourced By: __________________________</div>
        <div>Weighed & Packed By: __________________________</div>
        <div>Store Manager Approval: __________________________</div>
      </div>
      <script>window.onload = () => window.print()</script>
    </body></html>`

    const w = window.open('', '_blank', 'width=850,height=1000,noopener,noreferrer')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  // 💬 1-Click WhatsApp Sourcing List
  const handleShareWhatsApp = () => {
    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })

    const lines: string[] = []
    lines.push(`🌿 *GreenVest Mandi Sourcing List* (${dateStr})`)
    lines.push(`📦 Active Orders: ${activeOrders.length} | 12–24h Delivery Batch`)
    lines.push(`⚖️ Total Weight: *${metrics.totalKg} kg* | Pieces: *${metrics.totalPcs}*`)
    lines.push(`-----------------------------------`)

    for (const [catKey, items] of groupedByCategory.entries()) {
      const catMeta = CATEGORY_NAMES[catKey] || {
        en: catKey.toUpperCase(),
        bn: catKey,
        icon: '📦',
      }
      lines.push(`\n*${catMeta.icon} ${catMeta.en.toUpperCase()} (${catMeta.bn}):*`)
      items.forEach((it) => {
        const bn = it.bnName ? ` (${it.bnName})` : ''
        const grade = it.grade ? ` [G${it.grade}]` : ''
        lines.push(`• ${it.emoji} ${it.name}${bn}${grade}: *${it.displayTotal}* (${it.ordersCount} orders)`)
      })
    }

    lines.push(`\n-----------------------------------`)
    lines.push(`✅ Please verify quality & fresh farm cuts before packing.`)

    const fullMsg = lines.join('\n')
    const waUrl = `https://wa.me/?text=${encodeURIComponent(fullMsg)}`
    window.open(waUrl, '_blank')
  }

  // 📋 Copy text to clipboard
  const handleCopyText = async () => {
    const lines: string[] = []
    lines.push(`GreenVest Sourcing List - ${new Date().toLocaleDateString('en-IN')}`)
    lines.push(`Orders: ${activeOrders.length} | Total: ${metrics.totalKg} kg`)
    lines.push(`---------------------------------`)

    for (const [catKey, items] of groupedByCategory.entries()) {
      const catMeta = CATEGORY_NAMES[catKey] || { en: catKey, bn: catKey, icon: '📦' }
      lines.push(`\n[${catMeta.icon} ${catMeta.en}]`)
      items.forEach((it) => {
        lines.push(`• ${it.name}: ${it.displayTotal} (${it.ordersCount} orders)`)
      })
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      showToast(lang === 'bn' ? '📋 লিস্ট কপি করা হয়েছে!' : '📋 Sourcing list copied to clipboard!', '✨')
    } catch {
      showToast(lang === 'bn' ? 'কপি করতে ব্যর্থ' : 'Copy failed', '⚠️', 'error')
    }
  }

  const cs: React.CSSProperties = {
    background: 'var(--white, #fff)',
    borderRadius: '12px',
    border: '1px solid var(--line, #e5e7eb)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* ── 1. Top Metrics & Progress Bar Card ── */}
      <div
        style={{
          ...cs,
          padding: '1rem',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
          border: '1.5px solid #86efac',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '0.75rem',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '1.1rem',
                margin: 0,
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              📊 {lang === 'bn' ? 'আইটেম সোর্সিং ও প্যাকিং শিট' : 'Item Sourcing & Packing Manifest'}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#4b5563' }}>
              {lang === 'bn'
                ? '১২-২৪ ঘণ্টার ডেলিভারির জন্য মোট মালামালের পরিমাণ (কেজি ও পিস ভিত্তিক হিসেব)'
                : 'Aggregated procurement & packing manifest for 12–24h delivery window'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handlePrintSheet}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: '#ffffff',
                border: '1.5px solid #16a34a',
                color: '#15803d',
                padding: '0.4rem 0.75rem',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
              title="Print Mandi Sourcing Sheet"
            >
              🖨️ {lang === 'bn' ? 'প্রিন্ট শিট' : 'Print Sheet'}
            </button>
            <button
              type="button"
              onClick={handleShareWhatsApp}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: '#25d366',
                border: 'none',
                color: '#ffffff',
                padding: '0.4rem 0.75rem',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
              title="Send item list via WhatsApp to sourcing staff"
            >
              💬 {lang === 'bn' ? 'হোয়াটসঅ্যাপে শেয়ার' : 'WhatsApp'}
            </button>
            <button
              type="button"
              onClick={handleCopyText}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#475569',
                padding: '0.4rem 0.65rem',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
              title="Copy to clipboard"
            >
              📋
            </button>
          </div>
        </div>

        {/* 4 Stat Boxes */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.5rem',
            textAlign: 'center',
            marginBottom: '0.85rem',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              padding: '0.5rem 0.25rem',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#166534' }}>
              {metrics.totalKg} <span style={{ fontSize: '0.8rem' }}>kg</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
              {lang === 'bn' ? 'মোট ওজন' : 'Total Weight'}
            </div>
          </div>
          <div
            style={{
              background: '#ffffff',
              padding: '0.5rem 0.25rem',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0284c7' }}>
              {metrics.totalPcs} <span style={{ fontSize: '0.8rem' }}>pcs</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
              {lang === 'bn' ? 'ডিম / পিস' : 'Pieces/Pkts'}
            </div>
          </div>
          <div
            style={{
              background: '#ffffff',
              padding: '0.5rem 0.25rem',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>
              {metrics.distinctItems}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
              {lang === 'bn' ? 'মোট আইটেম' : 'Distinct Items'}
            </div>
          </div>
          <div
            style={{
              background: '#ffffff',
              padding: '0.5rem 0.25rem',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed' }}>
              {activeOrders.length}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
              {lang === 'bn' ? 'সক্রিয় অর্ডার' : 'Active Orders'}
            </div>
          </div>
        </div>

        {/* Live Packing Progress Bar */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '4px',
            }}
          >
            <span>
              📦 {lang === 'bn' ? 'প্যাকিং অগ্রগতি:' : 'Packing Progress:'}{' '}
              <b>
                {metrics.packedLines} / {metrics.totalLines}
              </b>{' '}
              ({metrics.percent}%)
            </span>
            {metrics.packedLines > 0 && (
              <button
                type="button"
                onClick={handleResetChecks}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#dc2626',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                {lang === 'bn' ? 'চেক রিসেট করুন' : 'Reset Checks'}
              </button>
            )}
          </div>
          <div
            style={{
              width: '100%',
              height: '8px',
              background: '#e5e7eb',
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${metrics.percent}%`,
                height: '100%',
                background: metrics.percent === 100 ? '#16a34a' : '#22c55e',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── 2. Filters & Search Bar ── */}
      <div style={{ ...cs, padding: '0.75rem 1rem' }}>
        {/* Row 1: Slot / Time Filters & Search */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: '0.65rem',
          }}
        >
          {/* Slot Tabs */}
          <div
            style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              padding: '2px',
              borderRadius: '8px',
            }}
          >
            <button
              type="button"
              onClick={() => setSlotFilter('all')}
              style={{
                padding: '4px 10px',
                fontSize: '0.76rem',
                fontWeight: slotFilter === 'all' ? 700 : 500,
                background: slotFilter === 'all' ? '#ffffff' : 'transparent',
                color: slotFilter === 'all' ? '#0f172a' : '#64748b',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                boxShadow: slotFilter === 'all' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              {lang === 'bn' ? 'সব স্লট' : 'All Slots'}
            </button>
            <button
              type="button"
              onClick={() => setSlotFilter('morning')}
              style={{
                padding: '4px 10px',
                fontSize: '0.76rem',
                fontWeight: slotFilter === 'morning' ? 700 : 500,
                background: slotFilter === 'morning' ? '#ffffff' : 'transparent',
                color: slotFilter === 'morning' ? '#d97706' : '#64748b',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                boxShadow: slotFilter === 'morning' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              🌅 {lang === 'bn' ? 'সকাল' : 'Morning'}
            </button>
            <button
              type="button"
              onClick={() => setSlotFilter('evening')}
              style={{
                padding: '4px 10px',
                fontSize: '0.76rem',
                fontWeight: slotFilter === 'evening' ? 700 : 500,
                background: slotFilter === 'evening' ? '#ffffff' : 'transparent',
                color: slotFilter === 'evening' ? '#4338ca' : '#64748b',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                boxShadow: slotFilter === 'evening' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              🌆 {lang === 'bn' ? 'সন্ধ্যা' : 'Evening'}
            </button>
          </div>

          {/* Date Selector */}
          <div
            style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              padding: '2px',
              borderRadius: '8px',
            }}
          >
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              style={{
                padding: '4px 9px',
                fontSize: '0.76rem',
                fontWeight: dateFilter === 'all' ? 700 : 500,
                background: dateFilter === 'all' ? '#ffffff' : 'transparent',
                color: dateFilter === 'all' ? '#0f172a' : '#64748b',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              12–24h
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('today')}
              style={{
                padding: '4px 9px',
                fontSize: '0.76rem',
                fontWeight: dateFilter === 'today' ? 700 : 500,
                background: dateFilter === 'today' ? '#ffffff' : 'transparent',
                color: dateFilter === 'today' ? '#15803d' : '#64748b',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              📅 {lang === 'bn' ? 'আজ' : 'Today'}
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('tomorrow')}
              style={{
                padding: '4px 9px',
                fontSize: '0.76rem',
                fontWeight: dateFilter === 'tomorrow' ? 700 : 500,
                background: dateFilter === 'tomorrow' ? '#ffffff' : 'transparent',
                color: dateFilter === 'tomorrow' ? '#1d4ed8' : '#64748b',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              🗓️ {lang === 'bn' ? 'আগামীকাল' : 'Tomorrow'}
            </button>
          </div>

          {/* Hide Packed Toggle */}
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '0.76rem',
              fontWeight: 600,
              color: '#374151',
              cursor: 'pointer',
              marginLeft: 'auto',
            }}
          >
            <input
              type="checkbox"
              checked={hidePacked}
              onChange={(e) => setHidePacked(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            {lang === 'bn' ? 'প্যাক করা আইটেম লুকান' : 'Hide fully packed'}
          </label>
        </div>

        {/* Row 2: Search Box */}
        <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
          <input
            type="text"
            placeholder={
              lang === 'bn'
                ? '🔍 আইটেমের নাম দিয়ে সার্চ করুন (যেমন: আলু, রুই, ডিম)...'
                : '🔍 Search items by name (e.g. Potato, Rohu, Egg)...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.45rem 0.75rem',
              fontSize: '0.85rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Row 3: Category Pills */}
        <div
          style={{
            display: 'flex',
            gap: '0.35rem',
            overflowX: 'auto',
            paddingBottom: '2px',
          }}
        >
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            style={{
              padding: '3px 9px',
              fontSize: '0.74rem',
              fontWeight: categoryFilter === 'all' ? 700 : 500,
              background: categoryFilter === 'all' ? '#166534' : '#f3f4f6',
              color: categoryFilter === 'all' ? '#ffffff' : '#374151',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {lang === 'bn' ? 'সকল ক্যাটেগরি' : 'All Categories'} ({aggregatedItems.length})
          </button>
          {Array.from(
            new Set(aggregatedItems.map((it) => it.category))
          ).map((cat) => {
            const meta = CATEGORY_NAMES[cat] || { en: cat, bn: cat, icon: '📦' }
            const count = aggregatedItems.filter((it) => it.category === cat).length
            const isSelected = categoryFilter === cat
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '3px 9px',
                  fontSize: '0.74rem',
                  fontWeight: isSelected ? 700 : 500,
                  background: isSelected ? '#166534' : '#f3f4f6',
                  color: isSelected ? '#ffffff' : '#374151',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {meta.icon} {lang === 'bn' ? meta.bn : meta.en} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 3. Categorized Items List ── */}
      {filteredItems.length === 0 ? (
        <div
          style={{
            ...cs,
            padding: '2.5rem 1rem',
            textAlign: 'center',
            color: '#6b7280',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🍃</div>
          <strong style={{ fontSize: '1rem', color: '#374151' }}>
            {lang === 'bn'
              ? 'এই ফিল্টারে কোনো আইটেম পাওয়া যায়নি'
              : 'No items match your active filters'}
          </strong>
          <p style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>
            {lang === 'bn'
              ? 'অন্য কোনো স্লট বা ক্যাটেগরি বেছে নিন অথবা ফিল্টার রিসেট করুন।'
              : 'Try clearing your search query or switching delivery slot.'}
          </p>
        </div>
      ) : (
        Array.from(groupedByCategory.entries()).map(([categoryKey, items]) => {
          const catMeta = CATEGORY_NAMES[categoryKey] || {
            en: categoryKey.toUpperCase(),
            bn: categoryKey,
            icon: '📦',
          }

          // Category subtotal weight or pcs
          const catKg = items
            .filter((i) => i.unitType === 'kg')
            .reduce((s, i) => s + i.totalQty, 0)
          const catPcs = items
            .filter((i) => i.unitType !== 'kg')
            .reduce((s, i) => s + i.totalQty, 0)

          return (
            <div key={categoryKey} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {/* Category Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.35rem 0.65rem',
                  background: '#f8fafc',
                  borderLeft: '4px solid #16a34a',
                  borderRadius: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: '#1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {catMeta.icon} {lang === 'bn' ? catMeta.bn : catMeta.en}{' '}
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>
                    ({items.length} {items.length === 1 ? 'item' : 'items'})
                  </span>
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d' }}>
                  {catKg > 0 ? `${catKg.toFixed(catKg % 1 === 0 ? 0 : 2)} kg ` : ''}
                  {catPcs > 0 ? `${catPcs} pcs` : ''}
                </span>
              </div>

              {/* Items in this Category */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {items.map((item) => {
                  const isExpanded = expandedItemId === item.id
                  const packedCount = item.orderLines.filter(
                    (ol) => checkedMap[ol.itemKey]
                  ).length
                  const isFullyPacked =
                    item.orderLines.length > 0 &&
                    packedCount === item.orderLines.length

                  return (
                    <div
                      key={item.id}
                      style={{
                        ...cs,
                        padding: '0.75rem 1rem',
                        border: isFullyPacked
                          ? '1.5px solid #86efac'
                          : '1px solid var(--line, #e5e7eb)',
                        background: isFullyPacked ? '#f0fdf4' : '#ffffff',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {/* Main Item Row */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* Left: Emoji, Name, Bengali, Grade */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            flex: 1,
                            minWidth: '220px',
                          }}
                        >
                          <span style={{ fontSize: '1.4rem' }}>{item.emoji}</span>
                          <div>
                            <div
                              style={{
                                fontSize: '0.92rem',
                                fontWeight: 700,
                                color: '#0f172a',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <span>{item.name}</span>
                              {item.bnName && (
                                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 400 }}>
                                  ({item.bnName})
                                </span>
                              )}
                              {item.grade && (
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    background: '#e0f2fe',
                                    color: '#0369a1',
                                  }}
                                >
                                  G{item.grade}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '1px' }}>
                              {lang === 'bn'
                                ? `${item.ordersCount}টি অর্ডার থেকে`
                                : `Across ${item.ordersCount} ${item.ordersCount === 1 ? 'order' : 'orders'}`}
                            </div>
                          </div>
                        </div>

                        {/* Right: Total Quantity Badge & Packing Check */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.65rem',
                          }}
                        >
                          {/* Vibrant Total Badge */}
                          <div
                            style={{
                              textAlign: 'right',
                              padding: '0.35rem 0.75rem',
                              borderRadius: '8px',
                              background:
                                item.unitType === 'kg'
                                  ? '#dcfce7'
                                  : item.unitType === 'pc'
                                  ? '#e0f2fe'
                                  : '#f3e8ff',
                              border: `1.5px solid ${
                                item.unitType === 'kg'
                                  ? '#86efac'
                                  : item.unitType === 'pc'
                                  ? '#7dd3fc'
                                  : '#d8b4fe'
                              }`,
                            }}
                          >
                            <div
                              style={{
                                fontSize: '1.05rem',
                                fontWeight: 800,
                                color:
                                  item.unitType === 'kg'
                                    ? '#15803d'
                                    : item.unitType === 'pc'
                                    ? '#0369a1'
                                    : '#7e22ce',
                              }}
                            >
                              {item.displayTotal}
                            </div>
                            <div
                              style={{
                                fontSize: '0.66rem',
                                fontWeight: 700,
                                color: isFullyPacked ? '#166534' : '#b45309',
                              }}
                            >
                              {isFullyPacked
                                ? '✓ ' + (lang === 'bn' ? 'সম্পূর্ণ প্যাকড' : 'All Packed')
                                : `${packedCount}/${item.orderLines.length} ` +
                                  (lang === 'bn' ? 'প্যাকড' : 'Packed')}
                            </div>
                          </div>

                          {/* Quick 1-Click Toggle for entire item */}
                          <button
                            type="button"
                            onClick={() => toggleAllInItem(item, !isFullyPacked)}
                            style={{
                              padding: '0.4rem 0.65rem',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: isFullyPacked ? '#15803d' : '#f8fafc',
                              color: isFullyPacked ? '#ffffff' : '#334155',
                              border: `1.5px solid ${isFullyPacked ? '#15803d' : '#cbd5e1'}`,
                              borderRadius: '8px',
                              cursor: 'pointer',
                            }}
                            title={isFullyPacked ? 'Mark as unpacked' : 'Mark all orders packed'}
                          >
                            {isFullyPacked ? '✓' : 'Mark ✓'}
                          </button>

                          {/* Expand/Collapse Arrow */}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedItemId(isExpanded ? null : item.id)
                            }
                            style={{
                              background: '#f1f5f9',
                              border: 'none',
                              color: '#475569',
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                            }}
                            title="View customer breakdown"
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Order-Level Breakdown */}
                      {isExpanded && (
                        <div
                          style={{
                            marginTop: '0.75rem',
                            paddingTop: '0.65rem',
                            borderTop: '1px dashed #e2e8f0',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#64748b',
                              textTransform: 'uppercase',
                              marginBottom: '0.4rem',
                            }}
                          >
                            {lang === 'bn'
                              ? 'কাস্টমার ভিত্তিক প্যাকিং তালিকা (Customer Breakdown):'
                              : 'Customer Packing Breakdown:'}
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.35rem',
                            }}
                          >
                            {item.orderLines.map((line) => {
                              const isChecked = Boolean(checkedMap[line.itemKey])
                              const weightText = line.weightLabel ? ` [${line.weightLabel}]` : ''

                              return (
                                <div
                                  key={line.itemKey}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.45rem 0.65rem',
                                    background: isChecked ? '#f0fdf4' : '#f8fafc',
                                    borderRadius: '6px',
                                    border: `1px solid ${isChecked ? '#bbf7d0' : '#e2e8f0'}`,
                                    fontSize: '0.78rem',
                                  }}
                                >
                                  {/* Left: Customer info & Order link */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleCheck(line.itemKey)}
                                      style={{
                                        cursor: 'pointer',
                                        width: '16px',
                                        height: '16px',
                                        accentColor: '#16a34a',
                                      }}
                                    />
                                    <div>
                                      <div
                                        style={{
                                          fontWeight: 600,
                                          color: isChecked ? '#166534' : '#1e293b',
                                          textDecoration: isChecked ? 'line-through' : 'none',
                                        }}
                                      >
                                        👤 {line.userName}{' '}
                                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>
                                          ({line.phone})
                                        </span>
                                      </div>
                                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                        📍 {line.address}{line.pin ? ` · ${line.pin}` : ''}{' '}
                                        {line.slot && (
                                          <span
                                            style={{
                                              padding: '1px 5px',
                                              borderRadius: '4px',
                                              background:
                                                line.slot === 'morning' ? '#fef3c7' : '#e0e7ff',
                                              color:
                                                line.slot === 'morning' ? '#92400e' : '#3730a3',
                                              fontWeight: 600,
                                            }}
                                          >
                                            {line.slot === 'morning' ? '🌅 Morning' : '🌆 Evening'}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right: Quantity & Order jump */}
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.65rem',
                                    }}
                                  >
                                    <div style={{ textAlign: 'right' }}>
                                      <div
                                        style={{
                                          fontWeight: 700,
                                          color: isChecked ? '#166534' : '#0f172a',
                                        }}
                                      >
                                        ×{line.qty}{weightText}
                                      </div>
                                      <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                                        ₹{line.unitPrice * line.qty}
                                      </div>
                                    </div>

                                    {onSelectOrder && (
                                      <button
                                        type="button"
                                        onClick={() => onSelectOrder(line.orderId)}
                                        style={{
                                          padding: '2px 6px',
                                          fontSize: '0.68rem',
                                          background: '#ffffff',
                                          border: '1px solid #cbd5e1',
                                          borderRadius: '4px',
                                          color: '#334155',
                                          cursor: 'pointer',
                                        }}
                                        title="Jump to order"
                                      >
                                        #{line.orderId.slice(0, 6)} ↗
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
