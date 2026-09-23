import type { Order, OrderItem } from '../types'

function escapeHtml(str: unknown): string {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatPrice(val: number | string | undefined | null): string {
  const num = Number(val) || 0
  return num.toLocaleString('en-IN')
}

function formatDateTime(isoOrDate: string | Date | undefined, lang: 'en' | 'bn' = 'en'): string {
  if (!isoOrDate) return ''
  try {
    const d = new Date(isoOrDate)
    const locale = lang === 'bn' ? 'bn-IN' : 'en-IN'
    return d.toLocaleString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return String(isoOrDate)
  }
}

// ── Multi-Layer Bulletproof Print Executor (Blob URL Engine) ────────────
/**
 * Triggers native print dialog via secure Object Blob URLs.
 * 1. Primary: Direct window.open(blobUrl) — 100% immune to about:blank blocking.
 * 2. Secondary: Invisible DOM anchor dispatch (if popup blocked by user browser).
 * 3. Tertiary: Blob download trigger.
 */
export function executePrint(html: string, documentTitle = 'Invoice'): boolean {
  if (typeof window === 'undefined') return false

  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)

    // Open directly using the Blob URL without noopener/noreferrer to retain script control
    const printWin = window.open(
      blobUrl,
      '_blank',
      'width=920,height=960,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'
    )

    if (printWin) {
      try {
        printWin.document.title = documentTitle
      } catch {}
      printWin.focus()
      // Revoke the blob URL after 2 minutes
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl)
        } catch {}
      }, 120000)
      return true
    }

    // Secondary fallback: User browser blocked popup window, trigger anchor open/click
    const a = document.createElement('a')
    a.href = blobUrl
    a.target = '_blank'
    a.download = `${documentTitle.replace(/[^a-z0-9_-]/gi, '_')}.html`
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      a.remove()
      URL.revokeObjectURL(blobUrl)
    }, 120000)
    return true
  } catch (err) {
    console.error('executePrint failed, falling back to download:', err)
    return false
  }
}

// ── Internal Helpers for Premium A4 Invoice HTML ───────────────────────
function renderA4Body(order: Order, isBn: boolean): string {
  const balanceDue = Math.max(0, Number(order.total) - Number(order.advanceAmount))
  const formattedDate = formatDateTime(order.createdAt, isBn ? 'bn' : 'en')

  const itemsRows = order.items
    .map((it: OrderItem, idx: number) => {
      const mult = it.weightMultiplier || 1
      const totalKg = Number((it.qty * mult).toFixed(2))
      const totalWeightText = totalKg < 1 ? `${Math.round(totalKg * 1000)}g` : `${totalKg} kg`
      const weightDetail = it.qty > 1
        ? `${totalWeightText} (${it.weightLabel || `${mult}kg`} × ${it.qty})`
        : it.weightLabel || `${mult}kg`

      const rate = Number(it.unitPrice)
      const lineTotal = rate * Number(it.qty)

      return `
        <tr>
          <td style="text-align:center;color:#64748b;font-weight:600">${idx + 1}</td>
          <td>
            <div style="font-weight:700;color:#0f172a;font-size:13.5px">${escapeHtml(it.emoji)} ${escapeHtml(it.name)}</div>
            <div style="font-size:11px;color:#64748b">${isBn ? 'প্যাক সাইজ:' : 'Pack Size:'} ${escapeHtml(weightDetail)}</div>
          </td>
          <td style="text-align:center">
            <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0">
              Grade ${escapeHtml(it.grade)}
            </span>
          </td>
          <td style="text-align:center;font-weight:600">${escapeHtml(weightDetail)}</td>
          <td style="text-align:right;font-weight:600">₹${formatPrice(rate)}</td>
          <td style="text-align:center;font-weight:700">${Number(it.qty)}</td>
          <td style="text-align:right;font-weight:700;color:#0f172a">₹${formatPrice(lineTotal)}</td>
        </tr>
      `
    })
    .join('')

  const deliveryScheduleText =
    order.deliveryDate && order.deliveryDate !== 'standard'
      ? `${escapeHtml(order.deliveryDate)} (${order.deliverySlot === 'morning' ? (isBn ? 'সকাল ৮টা – ১২টা' : 'Morning 8am–12pm') : order.deliverySlot === 'evening' ? (isBn ? 'সন্ধ্যা ৪টা – ৮টা' : 'Evening 4pm–8pm') : (isBn ? 'স্ট্যান্ডার্ড' : 'Standard')})`
      : isBn ? 'স্ট্যান্ডার্ড সুপারফাস্ট (১২–২৪ ঘণ্টা)' : 'Standard Superfast (12–24h)'

  const paymentBadge = order.paymentType === 'full'
    ? `<span style="display:inline-block;padding:4px 10px;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;border-radius:6px;font-size:11px;font-weight:700">✓ ${isBn ? '১০০% অনলাইন পেইড (প্রিপেইড)' : '100% PAID (PREPAID)'}</span>`
    : `<span style="display:inline-block;padding:4px 10px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:6px;font-size:11px;font-weight:700">⚡ ${isBn ? `১০% অগ্রিম পেইড (বাকি ক্যাশ/UPI)` : '10% ADVANCE PAID (COD/UPI)'}</span>`

  return `
    <table class="header-table">
      <tr>
        <td style="vertical-align:top">
          <div class="store-title">🌿 MS VEGETABLE CENTER</div>
          <div style="font-size:14px;font-weight:700;color:#047857;margin-bottom:4px">
            ${isBn ? 'এমএস ভেজিটেবল সেন্টার' : 'Farm-Fresh Daily Produce'}
          </div>
          <p class="store-subtitle">
            ${isBn ? 'ফার্ম-ফ্রেশ শাকসবজি, ফল ও নিত্যপ্রয়োজনীয় বাজার' : 'Farm-Fresh Vegetables, Daily Groceries & Fresh Essentials'}<br/>
            📍 Purba Medinipur, West Bengal - 721632<br/>
            📞 Helpline: +91 8170859653 · Web: <strong>greenvest.shop</strong>
          </p>
        </td>
        <td style="vertical-align:top;text-align:right">
          <div class="inv-badge">${isBn ? 'ট্যাক্স ইনভয়েস' : 'TAX INVOICE'}</div>
          <div class="inv-sub">#${escapeHtml(order.id)}</div>
          <div style="margin-top:6px;font-size:12px;color:#475569">
            <strong>${isBn ? 'তারিখ' : 'Date'}:</strong> ${formattedDate}
          </div>
          <div style="margin-top:4px">
            ${paymentBadge}
          </div>
        </td>
      </tr>
    </table>

    <div class="address-grid">
      <div class="address-col">
        <div class="box-title">${isBn ? 'গ্রাহকের বিবরণ (BILLED TO)' : 'CUSTOMER DETAILS (BILLED TO)'}</div>
        <div style="font-size:14px;font-weight:700;color:#0f172a">${escapeHtml(order.userName)}</div>
        <div style="font-size:12px;color:#475569;margin-top:2px">📞 ${escapeHtml(order.phone)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px">
          ${isBn ? 'গ্রাহক আইডি:' : 'Customer ID:'} ${escapeHtml(order.userId || 'Guest')}
        </div>
      </div>
      <div class="address-col">
        <div class="box-title">${isBn ? 'ডেলিভারি গন্তব্য (SHIP TO)' : 'DELIVERY DESTINATION (SHIP TO)'}</div>
        <div style="font-size:13px;font-weight:600;color:#0f172a">${escapeHtml(order.address)}</div>
        ${order.deliveryNotes ? `<div style="font-size:12px;color:#b45309;margin-top:3px;font-weight:500">📍 ${isBn ? 'ল্যান্ডমার্ক/নির্দেশনা:' : 'Landmark/Notes:'} ${escapeHtml(order.deliveryNotes)}</div>` : ''}
        <div style="font-size:12px;color:#475569;margin-top:3px">
          <strong>PIN:</strong> ${escapeHtml(order.pin || '721632')} · <strong>${isBn ? 'স্লট:' : 'Slot:'}</strong> ${deliveryScheduleText}
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width:36px;text-align:center">#</th>
          <th>${isBn ? 'আইটেম ও বিবরণ' : 'Item Description'}</th>
          <th style="width:75px;text-align:center">${isBn ? 'গ্রেড' : 'Grade'}</th>
          <th style="width:110px;text-align:center">${isBn ? 'প্যাক সাইজ' : 'Pack Size'}</th>
          <th style="width:90px;text-align:right">${isBn ? 'দর (₹)' : 'Rate (₹)'}</th>
          <th style="width:50px;text-align:center">${isBn ? 'পরিমাণ' : 'Qty'}</th>
          <th style="width:95px;text-align:right">${isBn ? 'মোট (₹)' : 'Amount (₹)'}</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div class="summary-grid">
      <div class="summary-notes">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">
            ${isBn ? 'পেমেন্ট ও ডেলিভারি বিবরণ' : 'PAYMENT & HANDOVER INFO'}
          </div>
          <div style="font-size:12px;color:#334155;line-height:1.6">
            • <strong>${isBn ? 'পেমেন্ট পদ্ধতি:' : 'Payment Type:'}</strong> ${order.paymentType === 'full' ? (isBn ? '১০০% অনলাইন ফুল পেমেন্ট' : '100% Online Full Payment') : (isBn ? '১০% অনলাইন অগ্রিম + ৯০% ক্যাশ অন ডেলিভারি' : '10% Online Advance + 90% Cash on Delivery')}<br/>
            • <strong>${isBn ? 'ডেলিভারি মোড:' : 'Delivery Mode:'}</strong> ${deliveryScheduleText}<br/>
            • <strong>${isBn ? 'অর্ডার স্থিতি:' : 'Order Status:'}</strong> <span style="text-transform:capitalize;font-weight:700;color:#047857">${escapeHtml(order.status)}</span>
          </div>

          ${order.deliveryOtp ? `
            <div style="margin-top:10px;padding:8px 12px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:6px;display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:11.5px;font-weight:600;color:#065f46">🔐 ${isBn ? 'ডেলিভারি হ্যান্ডওভার ওটিপি:' : 'Delivery Handover OTP:'}</span>
              <span style="font-family:'Courier New', monospace;font-size:16px;font-weight:800;letter-spacing:2px;color:#047857">${escapeHtml(order.deliveryOtp)}</span>
            </div>
          ` : ''}

          <div class="barcode-sim">||| | |||| || ||||| | ||| |||| ||</div>
          <div style="text-align:center;font-size:10px;color:#64748b;letter-spacing:1px">${escapeHtml(order.id)}</div>
        </div>
      </div>

      <div class="summary-totals">
        <table class="totals-table">
          <tr>
            <td class="label">${isBn ? 'পণ্যের মোট মূল্য (Subtotal)' : 'Items Subtotal'}</td>
            <td class="val">₹${formatPrice(order.subtotal)}</td>
          </tr>
          <tr>
            <td class="label">${isBn ? 'ডেলিভারি চার্জ' : 'Delivery Charges'}</td>
            <td class="val">${Number(order.deliveryFee) === 0 ? `<span style="color:#047857;font-weight:700">${isBn ? 'বিনামূল্যে' : 'FREE'}</span>` : `₹${formatPrice(order.deliveryFee)}`}</td>
          </tr>
          ${Number(order.discountAmount) > 0 ? `
            <tr>
              <td class="label" style="color:#16a34a">${isBn ? 'বিশেষ ছাড় / কুপন' : 'Coupon Discount'}</td>
              <td class="val" style="color:#16a34a">-₹${formatPrice(order.discountAmount)}</td>
            </tr>
          ` : ''}
          <tr class="total-row">
            <td>${isBn ? 'সর্বমোট প্রদেয় মূল্য' : 'Net Payable Total'}</td>
            <td class="val">₹${formatPrice(order.total)}</td>
          </tr>
          <tr>
            <td class="label" style="padding-top:8px">${isBn ? 'অনলাইনে প্রদত্ত অগ্রিম' : 'Online Advance Paid'}</td>
            <td class="val" style="padding-top:8px;color:#047857">₹${formatPrice(order.advanceAmount)}</td>
          </tr>
        </table>

        <div class="balance-box">
          ${balanceDue > 0 ? `
            <div style="font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px">
              ${isBn ? 'দরজায় ক্যাশ বা UPI বাকি' : 'DOORSTEP BALANCE DUE (CASH/UPI)'}
            </div>
            <div style="font-size:22px;font-weight:900;color:#dc2626;margin-top:2px">
              ₹${formatPrice(balanceDue)}
            </div>
            <div style="font-size:10.5px;color:#7f1d1d;margin-top:2px">
              ${isBn ? 'ডেলিভারির সময় রাইডারকে ক্যাশ দিন বা কিউআর স্ক্যান করুন' : 'Collect cash or scan UPI upon doorstep delivery'}
            </div>
          ` : `
            <div style="font-size:13px;font-weight:800;color:#166534">
              ✓ ${isBn ? 'সম্পূর্ণ মূল্য পরিশোধিত (১০০% পেইড)' : 'FULLY PAID ONLINE (ZERO DUE)'}
            </div>
            <div style="font-size:11px;color:#15803d;margin-top:2px">
              ${isBn ? 'দরজায় কোনো অতিরিক্ত টাকা দিতে হবে না' : 'No doorstep collection required'}
            </div>
          `}
        </div>
      </div>
    </div>

    <div class="footer-terms">
      <div style="max-width:65%">
        <strong>${isBn ? 'শর্তাবলী ও গুণমান নিশ্চয়তা:' : 'Terms & Quality Guarantee:'}</strong><br/>
        1. ${isBn ? 'ফার্ম-ফ্রেশ পণ্য ডেলিভারির সময় যাচাই করে নিন।' : 'Fresh produce is quality inspected. Please inspect at the time of delivery.'}<br/>
        2. ${isBn ? 'কোনো আইটেমে সমস্যা থাকলে ডেলিভারির ২ ঘণ্টার মধ্যে যোগাযোগ করুন (+91 8170859653)।' : 'For any produce issues, notify customer support within 2 hours of delivery.'}<br/>
        3. ${isBn ? 'এটি একটি কম্পিউটার-জেনারেটেড ট্যাক্স ইনভয়েস, কোনো শারীরিক স্বাক্ষরের প্রয়োজন নেই।' : 'Computer generated tax invoice. Subject to West Bengal jurisdiction.'}
      </div>
      <div style="text-align:center;width:150px">
        <div style="height:32px;border-bottom:1px solid #94a3b8;margin-bottom:4px"></div>
        <div style="font-size:11px;font-weight:700;color:#334155">
          ${isBn ? 'অনুমোদিত স্বাক্ষরকারী' : 'Authorized Signatory'}
        </div>
        <div style="font-size:9.5px;color:#64748b">MS Vegetable Center</div>
      </div>
    </div>
  `
}

// ── Internal Helpers for Premium Thermal POS Slip ───────────────────────
function renderThermalBody(order: Order, isBn: boolean, width: '58mm' | '80mm' = '58mm'): string {
  const balanceDue = Math.max(0, Number(order.total) - Number(order.advanceAmount))
  const formattedDate = formatDateTime(order.createdAt, isBn ? 'bn' : 'en')
  const is80 = width === '80mm'

  const itemsRows = order.items
    .map((it: OrderItem) => {
      const mult = it.weightMultiplier || 1
      const totalKg = Number((it.qty * mult).toFixed(2))
      const totalWeightText = totalKg < 1 ? `${Math.round(totalKg * 1000)}g` : `${totalKg}kg`
      const weightDetail = it.qty > 1 ? `[${totalWeightText}]` : it.weightLabel ? `[${it.weightLabel}]` : ''
      const lineTotal = Number(it.unitPrice) * Number(it.qty)
      const nameLimit = is80 ? 24 : 16

      return `
        <div class="pos-item-line">
          <span class="pos-item-name">${escapeHtml(it.name.slice(0, nameLimit))} (G${escapeHtml(it.grade)}) ${escapeHtml(weightDetail)}</span>
          <span class="pos-item-qty">x${Number(it.qty)}</span>
          <span class="pos-item-val">₹${formatPrice(lineTotal)}</span>
        </div>
      `
    })
    .join('')

  const slotStr = order.deliveryDate && order.deliveryDate !== 'standard'
    ? escapeHtml(order.deliveryDate)
    : isBn ? 'স্ট্যান্ডার্ড (১২-২৪ ঘণ্টা)' : 'Standard (12-24h)'

  return `
    <div class="pos-receipt ${is80 ? 'pos-80' : 'pos-58'}">
      <div class="pos-center pos-bold" style="font-size:14px;letter-spacing:0.5px">🌿 MS VEGETABLE CENTER</div>
      <div class="pos-center" style="font-size:10px">${isBn ? 'এমএস ভেজিটেবল সেন্টার' : 'Farm-Fresh Daily Essentials'}</div>
      <div class="pos-center" style="font-size:9.5px">Purba Medinipur, WB · Mob: 8170859653</div>
      <div class="pos-center" style="font-size:9px">Web: greenvest.shop</div>
      <div class="pos-dashed"></div>

      <div style="font-size:10px;line-height:1.4">
        <div><strong>${isBn ? 'অর্ডার নং' : 'ORDER'}:</strong> #${escapeHtml(order.id)}</div>
        <div><strong>${isBn ? 'তারিখ' : 'DATE'}:</strong> ${formattedDate}</div>
        <div><strong>${isBn ? 'ক্রেতা' : 'CUST'}:</strong> ${escapeHtml(order.userName.slice(0, is80 ? 28 : 18))}</div>
        <div><strong>${isBn ? 'ফোন' : 'TEL'}:</strong> ${escapeHtml(order.phone)}</div>
        <div><strong>${isBn ? 'ঠিকানা' : 'ADDR'}:</strong> ${escapeHtml(order.address.slice(0, is80 ? 45 : 30))}</div>
        ${order.deliveryNotes ? `<div><strong>${isBn ? 'নোট' : 'NOTE'}:</strong> ${escapeHtml(order.deliveryNotes.slice(0, is80 ? 40 : 25))}</div>` : ''}
        <div><strong>${isBn ? 'স্লট' : 'SLOT'}:</strong> PIN ${escapeHtml(order.pin || '721632')} · ${slotStr}</div>
      </div>
      <div class="pos-solid"></div>

      <div style="font-size:10px;font-weight:bold;display:flex;justify-content:space-between;margin-bottom:3px">
        <span>${isBn ? 'আইটেম' : 'ITEM'}</span>
        <span>${isBn ? 'পরিমাণ' : 'QTY'}</span>
        <span>${isBn ? 'মূল্য' : 'AMOUNT'}</span>
      </div>
      <div class="pos-dashed"></div>

      ${itemsRows}

      <div class="pos-dashed"></div>
      <div class="pos-row"><span>${isBn ? 'পণ্যের মোট (Subtotal):' : 'Subtotal:'}</span><span>₹${formatPrice(order.subtotal)}</span></div>
      <div class="pos-row"><span>${isBn ? 'ডেলিভারি চার্জ:' : 'Delivery Fee:'}</span><span>${Number(order.deliveryFee) === 0 ? (isBn ? 'বিনামূল্যে' : 'FREE') : `₹${formatPrice(order.deliveryFee)}`}</span></div>
      ${Number(order.discountAmount) > 0 ? `<div class="pos-row"><span>${isBn ? 'ছাড়:' : 'Discount:'}</span><span>-₹${formatPrice(order.discountAmount)}</span></div>` : ''}
      <div class="pos-solid"></div>
      <div class="pos-row pos-bold" style="font-size:12.5px"><span>${isBn ? 'সর্বমোট মূল্য:' : 'NET TOTAL:'}</span><span>₹${formatPrice(order.total)}</span></div>
      <div class="pos-row"><span>${isBn ? 'অনলাইন অগ্রিম:' : 'Paid Online:'}</span><span>₹${formatPrice(order.advanceAmount)}</span></div>

      <div class="pos-bal-banner ${balanceDue > 0 ? 'pos-due' : 'pos-paid'}">
        ${balanceDue > 0
          ? `>>> ${isBn ? 'দরজায় বাকি' : 'DUE ON DOORSTEP'}: ₹${formatPrice(balanceDue)} <<<<br/><span style="font-size:9.5px;font-weight:normal">${isBn ? 'ক্যাশ বা UPI স্ক্যান করে সংগ্রহ করুন' : 'Collect Cash or Scan UPI'}</span>`
          : `*** ${isBn ? '১০০% পরিশোধিত (পেইড)' : 'FULLY PAID (ZERO DUE)'} ***`
        }
      </div>

      <div style="font-size:10px;line-height:1.4">
        <div><strong>${isBn ? 'পেমেন্ট মোড' : 'MODE'}:</strong> ${order.paymentType === 'full' ? (isBn ? '১০০% ফুল পেইড' : '100% PREPAID') : (isBn ? '১০% অগ্রিম (সিওডি)' : '10% ADV (COD)')}</div>
        ${order.deliveryOtp ? `<div class="pos-bold" style="font-size:11px;margin-top:2px">🔐 ${isBn ? 'ডেলিভারি ওটিপি' : 'DELIVERY OTP'}: ${escapeHtml(order.deliveryOtp)}</div>` : ''}
      </div>

      <div class="pos-dashed"></div>
      <div class="pos-center" style="font-size:10px;font-weight:bold">${isBn ? 'কেনাকাটার জন্য ধন্যবাদ!' : 'Thank You For Shopping!'}</div>
      <div class="pos-center" style="font-size:8.5px;color:#475569">greenvest.shop · 100% Fresh & Authentic</div>
      <div style="height:14px"></div>
    </div>
  `
}

// ── Master Interactive Document Generator ──────────────────────────────
/**
 * Assembles a self-contained, ultra-premium document with live format & language switcher.
 * Floating toolbar allows instant switching between:
 * - Language: বাংলা (Bengali) ↔ English
 * - Format: A4 Tax Invoice ↔ Thermal POS Slip (58mm) ↔ Thermal POS Slip (80mm)
 * - Actions: Print / PDF ↔ Save HTML ↔ Close
 */
export function generateUnifiedPrintHtml(
  order: Order,
  defaultFormat: 'a4' | 'pos58' | 'pos80' = 'a4',
  defaultLang: 'en' | 'bn' = 'bn'
): string {
  const a4Bn = renderA4Body(order, true)
  const a4En = renderA4Body(order, false)
  const pos58Bn = renderThermalBody(order, true, '58mm')
  const pos58En = renderThermalBody(order, false, '58mm')
  const pos80Bn = renderThermalBody(order, true, '80mm')
  const pos80En = renderThermalBody(order, false, '80mm')

  return `<!DOCTYPE html>
<html lang="${defaultLang}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Invoice #${escapeHtml(order.id)} - MS Vegetable Center</title>
  
  <style id="dynamic-page-style">
    @page { size: A4 portrait; margin: 12mm 14mm; }
  </style>

  <style>
    *, *::before, *::after { box-sizing: border-box; }
    
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Hind Siliguri', 'Noto Sans Bengali', sans-serif;
      color: #0f172a;
      background: #f1f5f9;
      margin: 0;
      padding: 20px;
      font-size: 13px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Floating Ultra-Premium Toolbar (Hidden on physical print / PDF) */
    .no-print-bar {
      position: sticky;
      top: 12px;
      z-index: 99999;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      max-width: 860px;
      margin: 0 auto 24px auto;
      background: #0f172a;
      color: #ffffff;
      padding: 10px 16px;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
      border: 1px solid #334155;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .toolbar-badge {
      background: #047857;
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .toolbar-center {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .seg-group {
      display: inline-flex;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 3px;
      gap: 2px;
    }

    .seg-btn {
      background: transparent;
      color: #94a3b8;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .seg-btn:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.05);
    }

    .seg-btn.active {
      background: #10b981;
      color: #ffffff;
      font-weight: 700;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-print {
      background: #10b981;
      color: #ffffff;
      border: none;
      padding: 7px 18px;
      border-radius: 7px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s;
    }
    .btn-print:hover { background: #059669; }

    .btn-close {
      background: #334155;
      color: #f1f5f9;
      border: 1px solid #475569;
      padding: 7px 12px;
      border-radius: 7px;
      font-weight: 600;
      font-size: 12.5px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-close:hover { background: #475569; }

    /* Container Card for A4 View */
    .a4-sheet {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px 36px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      border: 1px solid #e2e8f0;
    }

    /* Styles for A4 Layout */
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border-bottom: 2px solid #047857; padding-bottom: 16px; }
    .store-title { font-size: 24px; font-weight: 800; color: #047857; margin: 0 0 2px 0; letter-spacing: -0.3px; }
    .store-subtitle { font-size: 12px; color: #475569; margin: 0; line-height: 1.5; }
    .inv-badge { font-size: 22px; font-weight: 800; color: #0f172a; text-align: right; letter-spacing: 0.5px; }
    .inv-sub { font-size: 13px; font-weight: 700; color: #64748b; text-align: right; }
    
    .address-grid {
      display: table;
      width: 100%;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 20px;
      background: #f8fafc;
    }
    .address-col {
      display: table-cell;
      width: 50%;
      padding: 14px 18px;
      vertical-align: top;
    }
    .address-col:first-child { border-right: 1px solid #e2e8f0; }
    .box-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; color: #64748b; margin-bottom: 6px; }
    
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .items-table th {
      background: #f1f5f9;
      color: #334155;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 12px;
      border-top: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      text-align: left;
    }
    .items-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 13px;
      vertical-align: middle;
    }
    
    .summary-grid {
      display: table;
      width: 100%;
      margin-bottom: 20px;
    }
    .summary-notes {
      display: table-cell;
      width: 52%;
      padding-right: 20px;
      vertical-align: top;
    }
    .summary-totals {
      display: table-cell;
      width: 48%;
      vertical-align: top;
    }
    
    .totals-table { width: 100%; border-collapse: collapse; }
    .totals-table td { padding: 6px 10px; font-size: 13px; }
    .totals-table .label { color: #64748b; }
    .totals-table .val { text-align: right; font-weight: 600; color: #0f172a; }
    .total-row td {
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      padding: 10px 10px;
    }
    .balance-box {
      margin-top: 12px;
      padding: 12px 14px;
      border-radius: 8px;
      text-align: right;
      background: #fef2f2;
      border: 2px solid #ef4444;
    }
    
    .footer-terms {
      border-top: 1px dashed #cbd5e1;
      padding-top: 14px;
      margin-top: 18px;
      font-size: 11px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .barcode-sim {
      font-family: 'Courier New', monospace;
      font-weight: 800;
      letter-spacing: 4px;
      font-size: 14px;
      color: #334155;
      text-align: center;
      margin-top: 8px;
    }

    /* Styles for POS Thermal Slip */
    .pos-sheet-wrapper {
      display: flex;
      justify-content: center;
      padding: 10px 0;
    }
    .pos-receipt {
      background: #ffffff;
      color: #000000;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
      border: 1px solid #cbd5e1;
      padding: 14px 10px;
      font-family: 'Courier New', Courier, monospace, 'Noto Sans Bengali', monospace;
    }
    .pos-58 {
      width: 58mm;
      max-width: 58mm;
      font-size: 10.5px;
    }
    .pos-80 {
      width: 80mm;
      max-width: 80mm;
      font-size: 11.5px;
      padding: 16px 14px;
    }
    .pos-center { text-align: center; }
    .pos-bold { font-weight: bold; }
    .pos-dashed { border-bottom: 1px dashed #000000; margin: 6px 0; }
    .pos-solid { border-bottom: 1px solid #000000; margin: 6px 0; }
    .pos-item-line {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      font-size: 10.5px;
    }
    .pos-item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 6px; }
    .pos-item-qty { width: 32px; text-align: center; }
    .pos-item-val { width: 48px; text-align: right; font-weight: bold; }
    .pos-row { display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px; }
    .pos-bal-banner {
      border: 2px solid #000;
      padding: 6px;
      text-align: center;
      font-size: 11.5px;
      font-weight: bold;
      margin: 6px 0;
    }
    .pos-due { background: #fef2f2; }
    .pos-paid { background: #f0fdf4; }

    /* Print-Only Pure Geometry */
    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
      }
      .no-print-bar {
        display: none !important;
      }
      .a4-sheet {
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;
        max-width: 100% !important;
        margin: 0 !important;
      }
      .pos-sheet-wrapper {
        padding: 0 !important;
      }
      .pos-receipt {
        box-shadow: none !important;
        border: none !important;
        padding: 4px 0 !important;
      }
    }
  </style>
</head>
<body>

  <!-- Floating Responsive Top Bar (Hidden When Printed) -->
  <div class="no-print-bar">
    <div class="toolbar-left">
      <span class="toolbar-badge">📄 #${escapeHtml(order.id)}</span>
      <span style="font-size:12px;color:#cbd5e1;font-weight:500" id="label-active-view">A4 Tax Invoice (বাংলা)</span>
    </div>

    <div class="toolbar-center">
      <!-- Format Switcher -->
      <div class="seg-group">
        <button type="button" id="btn-fmt-a4" class="seg-btn ${defaultFormat === 'a4' ? 'active' : ''}" onclick="setView('a4', window.currentLang)">
          📄 A4 Invoice
        </button>
        <button type="button" id="btn-fmt-pos58" class="seg-btn ${defaultFormat === 'pos58' ? 'active' : ''}" onclick="setView('pos58', window.currentLang)">
          🧾 Slip (58mm)
        </button>
        <button type="button" id="btn-fmt-pos80" class="seg-btn ${defaultFormat === 'pos80' ? 'active' : ''}" onclick="setView('pos80', window.currentLang)">
          🧾 Slip (80mm)
        </button>
      </div>

      <!-- Language Switcher -->
      <div class="seg-group">
        <button type="button" id="btn-lang-bn" class="seg-btn ${defaultLang === 'bn' ? 'active' : ''}" onclick="setView(window.currentFormat, 'bn')">
          🌐 বাংলা
        </button>
        <button type="button" id="btn-lang-en" class="seg-btn ${defaultLang === 'en' ? 'active' : ''}" onclick="setView(window.currentFormat, 'en')">
          🌐 English
        </button>
      </div>
    </div>

    <div class="toolbar-right">
      <button type="button" class="btn-print" onclick="window.focus();window.print();">
        🖨️ Print / প্রিন্ট
      </button>
      <button type="button" class="btn-close" onclick="window.close();">
        ✕ Close
      </button>
    </div>
  </div>

  <!-- 1. A4 Tax Invoice (Bengali) -->
  <div id="doc-a4-bn" class="doc-view" style="display:none">
    <div class="a4-sheet">${a4Bn}</div>
  </div>

  <!-- 2. A4 Tax Invoice (English) -->
  <div id="doc-a4-en" class="doc-view" style="display:none">
    <div class="a4-sheet">${a4En}</div>
  </div>

  <!-- 3. Thermal Slip 58mm (Bengali) -->
  <div id="doc-pos58-bn" class="doc-view pos-sheet-wrapper" style="display:none">
    ${pos58Bn}
  </div>

  <!-- 4. Thermal Slip 58mm (English) -->
  <div id="doc-pos58-en" class="doc-view pos-sheet-wrapper" style="display:none">
    ${pos58En}
  </div>

  <!-- 5. Thermal Slip 80mm (Bengali) -->
  <div id="doc-pos80-bn" class="doc-view pos-sheet-wrapper" style="display:none">
    ${pos80Bn}
  </div>

  <!-- 6. Thermal Slip 80mm (English) -->
  <div id="doc-pos80-en" class="doc-view pos-sheet-wrapper" style="display:none">
    ${pos80En}
  </div>

  <script>
    window.currentFormat = '${defaultFormat}';
    window.currentLang = '${defaultLang}';

    function setView(format, lang) {
      window.currentFormat = format;
      window.currentLang = lang;

      // Hide all doc views
      document.querySelectorAll('.doc-view').forEach(function(el) {
        el.style.display = 'none';
      });

      // Show target doc view
      var targetId = 'doc-' + format + '-' + lang;
      var targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.style.display = (format === 'a4') ? 'block' : 'flex';
      }

      // Update @page CSS dynamically
      var styleEl = document.getElementById('dynamic-page-style');
      if (styleEl) {
        if (format === 'a4') {
          styleEl.innerHTML = '@page { size: A4 portrait; margin: 12mm 14mm; }';
        } else if (format === 'pos80') {
          styleEl.innerHTML = '@page { size: 80mm auto; margin: 0; }';
        } else {
          styleEl.innerHTML = '@page { size: 58mm auto; margin: 0; }';
        }
      }

      // Update buttons active state
      ['a4', 'pos58', 'pos80'].forEach(function(f) {
        var btn = document.getElementById('btn-fmt-' + f);
        if (btn) btn.classList.toggle('active', f === format);
      });
      ['bn', 'en'].forEach(function(l) {
        var btn = document.getElementById('btn-lang-' + l);
        if (btn) btn.classList.toggle('active', l === lang);
      });

      // Update toolbar label
      var labelEl = document.getElementById('label-active-view');
      if (labelEl) {
        var fmtName = format === 'a4' ? 'A4 Tax Invoice' : (format === 'pos58' ? 'Slip (58mm)' : 'Slip (80mm)');
        var langName = lang === 'bn' ? 'বাংলা' : 'English';
        labelEl.textContent = fmtName + ' (' + langName + ')';
      }
    }

    // Initialize initial view
    setView('${defaultFormat}', '${defaultLang}');

    // Automatic smooth print trigger after initial layout render
    window.addEventListener('DOMContentLoaded', function() {
      setTimeout(function() {
        try {
          window.focus();
          window.print();
        } catch(e) {}
      }, 400);
    });
  </script>
</body>
</html>`
}

// ── Public Exported Trigger Functions ──────────────────────────────────
export function generateInvoiceHtml(order: Order, lang: 'en' | 'bn' = 'bn'): string {
  return generateUnifiedPrintHtml(order, 'a4', lang)
}

export function generateThermalReceiptHtml(order: Order, lang: 'en' | 'bn' = 'bn'): string {
  return generateUnifiedPrintHtml(order, 'pos58', lang)
}

export function printOrderInvoice(order: Order, lang: 'en' | 'bn' = 'bn'): boolean {
  const html = generateUnifiedPrintHtml(order, 'a4', lang)
  return executePrint(html, `Invoice-${order.id}`)
}

export function printThermalReceipt(order: Order, lang: 'en' | 'bn' = 'bn'): boolean {
  const html = generateUnifiedPrintHtml(order, 'pos58', lang)
  return executePrint(html, `Thermal-Receipt-${order.id}`)
}

export function downloadInvoiceHtml(order: Order, lang: 'en' | 'bn' = 'bn'): void {
  if (typeof window === 'undefined') return
  const html = generateUnifiedPrintHtml(order, 'a4', lang)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = `Invoice-${order.id}.html`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(blobUrl)
  }, 15000)
}

// ── 3. Packing List Generator ──────────────────────────────────────────
export function generatePackingListHtml(orders: Order[], lang: 'en' | 'bn' = 'en'): string {
  const isBn = lang === 'bn'
  const active = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'delivered')
  const morning = active.filter((o) => o.deliverySlot === 'morning' || !o.deliverySlot)
  const evening = active.filter((o) => o.deliverySlot === 'evening')

  const renderSection = (title: string, list: Order[]) => {
    if (list.length === 0) {
      return `<h2>${escapeHtml(title)}</h2><p style="color:#64748b">${isBn ? 'কোনো অর্ডার নেই' : 'No orders in this slot'}</p>`
    }
    const blocks = list
      .map((o) => {
        const items = o.items
          .map((it) => {
            const mult = it.weightMultiplier || 1
            const totalKg = Number((it.qty * mult).toFixed(2))
            const weightStr = totalKg < 1 ? `${Math.round(totalKg * 1000)}g` : `${totalKg}kg`
            return `<li><b>${escapeHtml(it.name)}</b> (Grade ${escapeHtml(it.grade)}) [${weightStr}] × <b>${Number(it.qty)}</b></li>`
          })
          .join('')

        return `
          <div style="border-bottom:1px solid #e2e8f0;padding:8px 0;margin:6px 0">
            <div style="display:flex;justify-content:space-between">
              <strong>${escapeHtml(o.id)}</strong> · <span>${escapeHtml(o.userName)}</span> · <span>📞 ${escapeHtml(o.phone)}</span>
              <span style="font-weight:700">₹${formatPrice(o.total)}</span>
            </div>
            <div style="font-size:12px;color:#475569">${escapeHtml(o.address)} ${o.pin ? `· PIN ${escapeHtml(o.pin)}` : ''}</div>
            <ul style="margin:4px 0 0 18px;font-size:12.5px">${items}</ul>
          </div>
        `
      })
      .join('')

    return `<h2 style="color:#047857;border-bottom:2px solid #047857;padding-bottom:4px;margin-top:20px">${escapeHtml(title)} (${list.length})</h2>${blocks}`
  }

  const title = isBn ? 'ডেলিভারি প্যাকিং লিস্ট' : 'Delivery Packing Manifest'
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: system-ui, sans-serif; padding: 20px; color: #0f172a; font-size: 13px; line-height: 1.4; }
    @media print { .no-print { display: none !important; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px">
    <button onclick="window.focus();window.print();" style="background:#047857;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:bold;cursor:pointer">
      🖨️ ${isBn ? 'প্যাকিং লিস্ট প্রিন্ট করুন' : 'Print Packing List'}
    </button>
  </div>
  <h1 style="color:#047857;margin:0 0 4px">${escapeHtml(title)}</h1>
  <div style="color:#64748b;font-size:12px">${new Date().toLocaleString()} · Total Active Orders: ${active.length}</div>
  ${renderSection(isBn ? '🌅 সকাল (সকাল ৮টা – ১২টা)' : '🌅 Morning Slot (8 AM – 12 PM)', morning)}
  ${renderSection(isBn ? '🌆 সন্ধ্যা (সন্ধ্যা ৪টা – ৮টা)' : '🌆 Evening Slot (4 PM – 8 PM)', evening)}
  <script>window.addEventListener('DOMContentLoaded', () => setTimeout(() => window.print(), 350));</script>
</body>
</html>`
}

// ── 4. Rider Manifest HTML Generator ───────────────────────────────────
export function generateRiderManifestHtml(orders: Order[], lang: 'en' | 'bn' = 'en'): string {
  const isBn = lang === 'bn'
  const active = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'delivered')
  if (active.length === 0) {
    return `<!DOCTYPE html><html><body><p>No active orders for delivery.</p></body></html>`
  }

  const pinGroups = new Map<string, Order[]>()
  active.forEach((o) => {
    const pin = o.pin || 'General'
    if (!pinGroups.has(pin)) pinGroups.set(pin, [])
    pinGroups.get(pin)!.push(o)
  })

  let totalBalanceToCollect = 0
  let bodyHtml = ''

  for (const [pin, list] of pinGroups.entries()) {
    const rows = list
      .map((o, idx) => {
        const balance = Math.max(0, Number(o.total) - Number(o.advanceAmount))
        totalBalanceToCollect += balance
        const itemsStr = o.items
          .map((it) => `${escapeHtml(it.emoji)} ${escapeHtml(it.name)} ×${Number(it.qty)}`)
          .join(', ')
        const slot = o.deliverySlot === 'morning' ? '🌅 Morning' : o.deliverySlot === 'evening' ? '🌆 Evening' : 'Standard'

        return `
          <tr>
            <td style="text-align:center">${idx + 1}</td>
            <td>
              <strong>${escapeHtml(o.userName)}</strong><br/>
              <span style="color:#64748b">${escapeHtml(o.phone)}</span>
            </td>
            <td>
              ${escapeHtml(o.address)}<br/>
              <span style="display:inline-block;padding:2px 6px;background:#e0f2fe;color:#0369a1;border-radius:4px;font-size:10px">${escapeHtml(slot)}</span>
            </td>
            <td><small>${itemsStr}</small></td>
            <td style="text-align:right">₹${formatPrice(o.total)}</td>
            <td style="text-align:right">₹${formatPrice(o.advanceAmount)}</td>
            <td style="text-align:right;font-weight:700;color:${balance > 0 ? '#dc2626' : '#16a34a'}">₹${formatPrice(balance)}</td>
            <td style="text-align:center;font-weight:bold">[ &nbsp; ]</td>
          </tr>
        `
      })
      .join('')

    bodyHtml += `
      <div style="font-size:14px;font-weight:bold;margin:16px 0 8px;background:#f0fdf4;padding:6px 10px;border-left:4px solid #166534;border-radius:4px">
        📍 PIN Zone: ${escapeHtml(pin)} (${list.length} orders)
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:12px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="border:1px solid #d1d5db;padding:6px;width:30px">#</th>
            <th style="border:1px solid #d1d5db;padding:6px">Customer</th>
            <th style="border:1px solid #d1d5db;padding:6px">Address & Slot</th>
            <th style="border:1px solid #d1d5db;padding:6px">Items</th>
            <th style="border:1px solid #d1d5db;padding:6px;text-align:right">Total</th>
            <th style="border:1px solid #d1d5db;padding:6px;text-align:right">Advance</th>
            <th style="border:1px solid #d1d5db;padding:6px;text-align:right">Collect</th>
            <th style="border:1px solid #d1d5db;padding:6px;width:55px">Done</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `
  }

  const title = isBn ? 'রাইডার ডেলিভারি ও ক্যাশ কালেকশন শিট' : 'Rider Delivery & Cash Collection Manifest'
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: system-ui, sans-serif; padding: 15px; color: #111; font-size: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 6px; vertical-align: top; }
    @media print { .no-print { display: none !important; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:12px">
    <button onclick="window.focus();window.print();" style="background:#166534;color:#fff;border:none;padding:7px 14px;border-radius:6px;font-weight:bold;cursor:pointer">
      🖨️ ${isBn ? 'রাইডার শিট প্রিন্ট করুন' : 'Print Rider Manifest'}
    </button>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #166534;padding-bottom:8px">
    <div>
      <h1 style="margin:0;font-size:18px;color:#166534">🌿 MS Vegetable Center ${escapeHtml(title)}</h1>
      <div style="color:#64748b;font-size:11px">${new Date().toLocaleDateString()} · Active Delivery Orders: ${active.length}</div>
    </div>
    <div style="font-size:16px;font-weight:800;color:#dc2626">
      Total Cash/UPI to Collect: ₹${formatPrice(totalBalanceToCollect)}
    </div>
  </div>
  ${bodyHtml}
  <div style="margin-top:16px;padding:10px;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;display:flex;justify-content:space-between;font-weight:bold;color:#991b1b">
    <span>Total Delivery Stops: ${active.length}</span>
    <span>Total Cash/UPI Balance to Collect: ₹${formatPrice(totalBalanceToCollect)}</span>
  </div>
  <script>window.addEventListener('DOMContentLoaded', () => setTimeout(() => window.print(), 350));</script>
</body>
</html>`
}

export function printPackingList(orders: Order[], lang: 'en' | 'bn' = 'en'): boolean {
  const html = generatePackingListHtml(orders, lang)
  return executePrint(html, 'Packing-List')
}

export function printRiderManifest(orders: Order[], lang: 'en' | 'bn' = 'en'): boolean {
  const html = generateRiderManifestHtml(orders, lang)
  return executePrint(html, 'Rider-Manifest')
}
