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

function formatDateTime(isoOrDate: string | Date | undefined): string {
  if (!isoOrDate) return ''
  try {
    const d = new Date(isoOrDate)
    return d.toLocaleString('en-IN', {
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

// ── Multi-Layer Bulletproof Print Executor ─────────────────────────────
/**
 * Triggers native print dialog without getting blocked by browser popup blockers.
 * 1. Primary: Hidden sandboxed iframe (no popups, no new tabs, 100% reliable).
 * 2. Secondary: Popup window fallback (WITHOUT noopener, ensuring window handle is preserved).
 * 3. Tertiary: Blob URL direct navigation/download.
 */
export function executePrint(html: string, documentTitle = 'Invoice'): boolean {
  if (typeof window === 'undefined') return false

  // 1. Primary: Hidden iframe print engine
  try {
    const frameId = `gv-print-frame-${Date.now()}`
    let iframe = document.getElementById(frameId) as HTMLIFrameElement | null
    if (!iframe) {
      iframe = document.createElement('iframe')
      iframe.id = frameId
      iframe.title = documentTitle
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.style.opacity = '0'
      iframe.style.pointerEvents = 'none'
      iframe.setAttribute('aria-hidden', 'true')
      document.body.appendChild(iframe)
    }

    const frameDoc = iframe.contentWindow?.document || iframe.contentDocument
    if (frameDoc && iframe.contentWindow) {
      frameDoc.open()
      frameDoc.write(html)
      frameDoc.close()

      const triggerPrint = () => {
        try {
          iframe?.contentWindow?.focus()
          iframe?.contentWindow?.print()
        } catch (err) {
          console.warn('Iframe print error, falling back to window:', err)
          fallbackPrintWindow(html, documentTitle)
        } finally {
          setTimeout(() => {
            try {
              iframe?.remove()
            } catch {}
          }, 45000)
        }
      }

      if (frameDoc.readyState === 'complete') {
        setTimeout(triggerPrint, 250)
      } else {
        iframe.onload = () => setTimeout(triggerPrint, 250)
        setTimeout(triggerPrint, 600)
      }
      return true
    }
  } catch (iframeErr) {
    console.warn('Iframe print failed, attempting window fallback:', iframeErr)
  }

  // 2. Secondary Fallback: Popup window (WITHOUT noopener so window handle is valid)
  return fallbackPrintWindow(html, documentTitle)
}

function fallbackPrintWindow(html: string, documentTitle: string): boolean {
  try {
    const printWin = window.open(
      '',
      '_blank',
      'width=850,height=950,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'
    )
    if (printWin) {
      printWin.document.title = documentTitle
      printWin.document.open()
      printWin.document.write(html)
      printWin.document.close()

      setTimeout(() => {
        try {
          printWin.focus()
          printWin.print()
        } catch {}
      }, 350)
      return true
    }
  } catch (winErr) {
    console.warn('Popup window fallback failed:', winErr)
  }

  // 3. Tertiary Fallback: Blob URL download/open
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.target = '_blank'
    a.download = `${documentTitle.replace(/[^a-z0-9_-]/gi, '_')}.html`
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      a.remove()
      URL.revokeObjectURL(blobUrl)
    }, 20000)
    return true
  } catch (blobErr) {
    console.error('All printing mechanisms exhausted:', blobErr)
    return false
  }
}

// ── 1. A4 Professional Tax Invoice HTML Generator ──────────────────────
export function generateInvoiceHtml(order: Order, lang: 'en' | 'bn' = 'bn'): string {
  const isBn = lang === 'bn'
  const balanceDue = Math.max(0, Number(order.total) - Number(order.advanceAmount))
  const formattedDate = formatDateTime(order.createdAt)

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
            <div style="font-weight:700;color:#0f172a">${escapeHtml(it.emoji)} ${escapeHtml(it.name)}</div>
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

  return `<!DOCTYPE html>
<html lang="${isBn ? 'bn' : 'en'}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Invoice #${escapeHtml(order.id)} - MS Vegetable Center</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Hind Siliguri', 'Noto Sans Bengali', sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 20px;
      font-size: 13px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .invoice-container {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
    }
    .no-print-bar {
      position: sticky;
      top: 0;
      z-index: 1000;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0f172a;
      color: #ffffff;
      padding: 10px 18px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .btn-action {
      background: #10b981;
      color: #ffffff;
      border: none;
      padding: 7px 16px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-action:hover { background: #059669; }
    .btn-secondary {
      background: #334155;
      color: #f8fafc;
      border: 1px solid #475569;
      padding: 7px 14px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .btn-secondary:hover { background: #475569; }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0 !important; }
      .invoice-container { max-width: 100% !important; margin: 0 !important; }
    }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; border-bottom: 2px solid #047857; padding-bottom: 14px; }
    .store-title { font-size: 24px; font-weight: 800; color: #047857; margin: 0 0 2px 0; }
    .store-subtitle { font-size: 12px; color: #475569; margin: 0; }
    .inv-badge { font-size: 20px; font-weight: 800; color: #0f172a; text-align: right; }
    .inv-sub { font-size: 12px; color: #64748b; text-align: right; }
    .address-grid {
      display: table;
      width: 100%;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 18px;
      background: #f8fafc;
    }
    .address-col {
      display: table-cell;
      width: 50%;
      padding: 12px 16px;
      vertical-align: top;
    }
    .address-col:first-child { border-right: 1px solid #e2e8f0; }
    .box-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; color: #64748b; margin-bottom: 6px; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    .items-table th {
      background: #f1f5f9;
      color: #334155;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 9px 10px;
      border-top: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      text-align: left;
    }
    .items-table td {
      padding: 9px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 12.5px;
      vertical-align: middle;
    }
    .summary-grid {
      display: table;
      width: 100%;
      margin-bottom: 20px;
    }
    .summary-notes {
      display: table-cell;
      width: 55%;
      padding-right: 20px;
      vertical-align: top;
    }
    .summary-totals {
      display: table-cell;
      width: 45%;
      vertical-align: top;
    }
    .totals-table { width: 100%; border-collapse: collapse; }
    .totals-table td { padding: 6px 8px; font-size: 13px; }
    .totals-table .label { color: #64748b; }
    .totals-table .val { text-align: right; font-weight: 600; color: #0f172a; }
    .total-row td {
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      padding: 8px 8px;
    }
    .balance-box {
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      text-align: right;
      ${balanceDue > 0 ? 'background: #fef2f2; border: 2px solid #ef4444;' : 'background: #f0fdf4; border: 2px solid #10b981;'}
    }
    .footer-terms {
      border-top: 1px dashed #cbd5e1;
      padding-top: 12px;
      margin-top: 16px;
      font-size: 11px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .barcode-sim {
      font-family: 'Courier New', monospace;
      font-weight: 800;
      letter-spacing: 3px;
      font-size: 14px;
      color: #334155;
      text-align: center;
      margin-top: 6px;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="no-print no-print-bar">
      <div style="font-size:13px;font-weight:700">
        📄 ${isBn ? 'অফিসিয়াল ইনভয়েস প্রিভিউ' : 'Official Tax Invoice Preview'} · #${escapeHtml(order.id)}
      </div>
      <div style="display:flex;gap:8px">
        <button type="button" class="btn-action" onclick="window.focus();window.print();">
          🖨️ ${isBn ? 'প্রিন্ট / PDF সেভ করুন' : 'Print / Save as PDF'}
        </button>
        <button type="button" class="btn-secondary" onclick="window.close();">
          ✕ ${isBn ? 'বন্ধ করুন' : 'Close'}
        </button>
      </div>
    </div>

    <table class="header-table">
      <tr>
        <td style="vertical-align:top">
          <div class="store-title">🌿 MS VEGETABLE CENTER</div>
          <p class="store-subtitle">
            ${isBn ? 'ফার্ম-ফ্রেশ শাকসবজি ও নিত্যপ্রয়োজনীয় বাজার' : 'Farm-Fresh Vegetables, Daily Groceries & Essentials'}<br/>
            📍 Purba Medinipur, West Bengal - 721632<br/>
            📞 Helpline: +91 8170859653 · Web: <strong>greenvest.shop</strong>
          </p>
        </td>
        <td style="vertical-align:top;text-align:right">
          <div class="inv-badge">${isBn ? 'ট্যাক্স ইনভয়েস' : 'TAX INVOICE'}</div>
          <div class="inv-sub">#${escapeHtml(order.id)}</div>
          <div style="margin-top:4px;font-size:12px;font-weight:600;color:#334155">${formattedDate}</div>
          <div style="margin-top:6px">${paymentBadge}</div>
        </td>
      </tr>
    </table>

    <div class="address-grid">
      <div class="address-col">
        <div class="box-title">👤 ${isBn ? 'গ্রাহক বিবরণ (বিল টু)' : 'Customer Details (Bill To)'}</div>
        <div style="font-size:14px;font-weight:700;color:#0f172a">${escapeHtml(order.userName)}</div>
        <div style="font-size:13px;color:#334155;margin-top:2px">📞 ${escapeHtml(order.phone)}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px">
          ${isBn ? 'অর্ডার ধরন:' : 'Order Channel:'} Online Direct Web
        </div>
      </div>
      <div class="address-col">
        <div class="box-title">📍 ${isBn ? 'ডেলিভারি ঠিকানা ও সময়সূচী' : 'Delivery Destination & Slot'}</div>
        <div style="font-size:13px;font-weight:600;color:#0f172a">${escapeHtml(order.address)}</div>
        ${order.deliveryNotes ? `<div style="font-size:12px;color:#854d0e;margin-top:3px;font-weight:600">🏛️ ${isBn ? 'ল্যান্ডমার্ক:' : 'Landmark:'} ${escapeHtml(order.deliveryNotes)}</div>` : ''}
        <div style="font-size:12px;color:#334155;margin-top:3px">
          PIN: <strong>${escapeHtml(order.pin)}</strong> · 📅 ${deliveryScheduleText}
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width:36px;text-align:center">#</th>
          <th>${isBn ? 'পণ্যের বিবরণ' : 'Item Description'}</th>
          <th style="width:85px;text-align:center">${isBn ? 'গ্রেড' : 'Grade'}</th>
          <th style="width:110px;text-align:center">${isBn ? 'ওজন / প্যাক' : 'Weight / Pack'}</th>
          <th style="width:85px;text-align:right">${isBn ? 'দর (₹)' : 'Rate (₹)'}</th>
          <th style="width:50px;text-align:center">${isBn ? 'পরিমাণ' : 'Qty'}</th>
          <th style="width:100px;text-align:right">${isBn ? 'মোট (₹)' : 'Total (₹)'}</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div class="summary-grid">
      <div class="summary-notes">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:12px">
          <div style="font-weight:700;color:#0f172a;margin-bottom:4px">💳 ${isBn ? 'পেমেন্ট ও ডেলিভারি নির্দেশিকা' : 'Payment & Delivery Instructions'}</div>
          <div style="color:#475569;margin-bottom:6px">
            ${isBn
              ? 'ডেলিভারি পার্টনারের কাছে সরাসরি ক্যাশ অথবা UPI (PhonePe / Google Pay / Paytm) স্ক্যান করে বাকি টাকা পরিশোধ করতে পারবেন।'
              : 'Pay remaining balance to delivery partner via Cash or direct UPI scan at doorstep.'}
          </div>
          ${order.deliveryOtp ? `
            <div style="background:#eff6ff;border:1px dashed #3b82f6;padding:6px 10px;border-radius:6px;font-weight:700;color:#1d4ed8">
              🔑 ${isBn ? 'ডেলিভারি হ্যান্ডওভার OTP:' : 'Handover Delivery OTP:'} <span style="font-size:14px;letter-spacing:2px">${escapeHtml(order.deliveryOtp)}</span>
            </div>
          ` : ''}
        </div>
        <div class="barcode-sim">||| | |||| || ||||| | ||||| |||</div>
        <div style="text-align:center;font-size:11px;color:#94a3b8;margin-top:2px">ORDER ID: ${escapeHtml(order.id)}</div>
      </div>

      <div class="summary-totals">
        <table class="totals-table">
          <tr>
            <td class="label">${isBn ? 'পণ্যগুলির মোট মূল্য (Subtotal):' : 'Items Subtotal:'}</td>
            <td class="val">₹${formatPrice(order.subtotal)}</td>
          </tr>
          <tr>
            <td class="label">${isBn ? 'ডেলিভারি চার্জ (Delivery Fee):' : 'Delivery Fee:'}</td>
            <td class="val">${Number(order.deliveryFee) === 0 ? `<span style="color:#16a34a;font-weight:700">FREE</span>` : `₹${formatPrice(order.deliveryFee)}`}</td>
          </tr>
          ${Number(order.discountAmount) > 0 ? `
          <tr>
            <td class="label" style="color:#16a34a;font-weight:600">${isBn ? 'ডিসকাউন্ট / কুপন সেভিংস:' : 'Coupon / Discount Savings:'}</td>
            <td class="val" style="color:#16a34a;font-weight:700">-₹${formatPrice(order.discountAmount)}</td>
          </tr>
          ` : ''}
          <tr class="total-row">
            <td>${isBn ? 'সর্বমোট প্রদেয় বিল (Grand Total):' : 'Net Grand Total:'}</td>
            <td class="val">₹${formatPrice(order.total)}</td>
          </tr>
          <tr>
            <td class="label">${isBn ? 'পরিশোধিত অগ্রিম টাকা (Advance Paid):' : 'Advance Paid:'}</td>
            <td class="val" style="color:#16a34a">₹${formatPrice(order.advanceAmount)}</td>
          </tr>
        </table>

        <div class="balance-box">
          ${balanceDue > 0 ? `
            <div style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px">
              ${isBn ? 'ডেলিভারির সময় বাকি প্রদেয় টাকা' : 'Balance Payable on Delivery'}
            </div>
            <div style="font-size:20px;font-weight:900;color:#b91c1c;margin-top:2px">
              ₹${formatPrice(balanceDue)}
            </div>
            <div style="font-size:11px;color:#991b1b;margin-top:2px">
              ${isBn ? '(নগদ বা UPI দ্বারা প্রদেয়)' : '(Cash or UPI on Delivery)'}
            </div>
          ` : `
            <div style="font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.5px">
              ${isBn ? 'সম্পূর্ণ মূল্য পরিশোধিত' : 'Fully Paid in Advance'}
            </div>
            <div style="font-size:18px;font-weight:900;color:#15803d;margin-top:2px">
              ₹0 · ZERO BALANCE
            </div>
          `}
        </div>
      </div>
    </div>

    <div class="footer-terms">
      <div style="max-width:60%">
        <div><strong>MS Vegetable Center</strong> · 100% Fresh Farm Quality Guaranteed</div>
        <div>${isBn ? 'পণ্য হস্তান্তরের সময় যাচাই করে নিন। যেকোনো প্রয়োজনে greenvest.shop এ যোগাযোগ করুন।' : 'Goods verified at handover. For support, visit greenvest.shop or contact helpline.'}</div>
      </div>
      <div style="text-align:right">
        <div style="margin-bottom:28px;color:#94a3b8;font-size:10px">E. & O.E. · Computer Generated Invoice</div>
        <div style="border-top:1px solid #94a3b8;padding-top:4px;font-size:11px;font-weight:600;color:#334155">
          ${isBn ? 'অনুমোদিত স্বাক্ষরকারী' : 'Authorized Signatory'}
        </div>
      </div>
    </div>
  </div>

  <script>
    function doPrint() {
      try {
        window.focus();
        window.print();
      } catch(e){}
    }
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(doPrint, 350);
    });
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(doPrint, 350);
    }
  </script>
</body>
</html>`
}

// ── 2. Thermal Receipt (58mm / 80mm Bluetooth POS) HTML Generator ──────
export function generateThermalReceiptHtml(order: Order, lang: 'en' | 'bn' = 'bn'): string {
  const isBn = lang === 'bn'
  const balanceDue = Math.max(0, Number(order.total) - Number(order.advanceAmount))
  const formattedDate = formatDateTime(order.createdAt)

  const itemsRows = order.items
    .map((it: OrderItem) => {
      const mult = it.weightMultiplier || 1
      const totalKg = Number((it.qty * mult).toFixed(2))
      const totalWeightText = totalKg < 1 ? `${Math.round(totalKg * 1000)}g` : `${totalKg}kg`
      const weightDetail = it.qty > 1 ? `[${totalWeightText}]` : it.weightLabel ? `[${it.weightLabel}]` : ''
      const lineTotal = Number(it.unitPrice) * Number(it.qty)

      return `
        <div class="item-line">
          <span class="item-name">${escapeHtml(it.name.slice(0, 16))} (G${escapeHtml(it.grade)}) ${escapeHtml(weightDetail)}</span>
          <span class="item-qty">x${Number(it.qty)}</span>
          <span class="item-val">₹${formatPrice(lineTotal)}</span>
        </div>
      `
    })
    .join('')

  const slotStr = order.deliveryDate && order.deliveryDate !== 'standard'
    ? escapeHtml(order.deliveryDate)
    : 'Standard (12-24h)'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>POS Receipt #${escapeHtml(order.id)}</title>
  <style>
    @page {
      size: 58mm auto;
      margin: 0;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace, 'Noto Sans Bengali', monospace;
      width: 58mm;
      max-width: 58mm;
      margin: 0 auto;
      padding: 6px 4px;
      font-size: 11px;
      line-height: 1.35;
      color: #000000;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .c { text-align: center; }
    .r { text-align: right; }
    .b { font-weight: bold; }
    .d-line { border-bottom: 1px dashed #000000; margin: 4px 0; }
    .s-line { border-bottom: 1px solid #000000; margin: 4px 0; }
    .item-line {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
      font-size: 10.5px;
    }
    .item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 4px; }
    .item-qty { width: 28px; text-align: center; }
    .item-val { width: 44px; text-align: right; font-weight: bold; }
    .tot-row { display: flex; justify-content: space-between; margin: 2px 0; }
    .bal-banner {
      border: 2px solid #000;
      padding: 4px;
      text-align: center;
      font-size: 12px;
      font-weight: bold;
      margin: 4px 0;
    }
    .no-print {
      margin-bottom: 8px;
      padding: 4px;
      background: #000;
      color: #fff;
      text-align: center;
      border-radius: 4px;
      font-family: sans-serif;
      font-size: 11px;
    }
    .no-print button {
      background: #10b981;
      color: #fff;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: bold;
      cursor: pointer;
      margin-top: 2px;
    }
    @media print {
      .no-print { display: none !important; }
      body { padding: 2px 0 !important; width: 100% !important; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <div>POS Thermal Slip (${order.id})</div>
    <button onclick="window.focus();window.print();">🖨️ Print Receipt</button>
  </div>

  <div class="c b" style="font-size:13px">MS VEGETABLE CENTER</div>
  <div class="c" style="font-size:9.5px">${isBn ? 'টাটকা সবজি ও নিত্যপ্রয়োজনীয়' : 'Fresh Veg & Daily Essentials'}</div>
  <div class="c" style="font-size:9px">Purba Medinipur, WB · Mob: 8170859653</div>
  <div class="d-line"></div>

  <div>ORDER: <span class="b">${escapeHtml(order.id)}</span></div>
  <div>DATE : ${formattedDate}</div>
  <div>CUST : ${escapeHtml(order.userName.slice(0, 18))}</div>
  <div>TEL  : ${escapeHtml(order.phone)}</div>
  <div>ADDR : ${escapeHtml(order.address.slice(0, 32))}</div>
  ${order.deliveryNotes ? `<div>NOTE : ${escapeHtml(order.deliveryNotes.slice(0, 28))}</div>` : ''}
  <div>PIN  : ${escapeHtml(order.pin)} · ${slotStr}</div>
  <div class="s-line"></div>

  <div style="font-size:9.5px;font-weight:bold;display:flex;justify-content:space-between">
    <span>ITEM</span>
    <span>QTY</span>
    <span>AMT</span>
  </div>
  <div class="d-line"></div>

  ${itemsRows}

  <div class="d-line"></div>
  <div class="tot-row"><span>Subtotal:</span><span>₹${formatPrice(order.subtotal)}</span></div>
  <div class="tot-row"><span>Delivery:</span><span>${Number(order.deliveryFee) === 0 ? 'FREE' : `₹${formatPrice(order.deliveryFee)}`}</span></div>
  ${Number(order.discountAmount) > 0 ? `<div class="tot-row"><span>Discount:</span><span>-₹${formatPrice(order.discountAmount)}</span></div>` : ''}
  <div class="s-line"></div>
  <div class="tot-row b" style="font-size:12px"><span>NET TOTAL:</span><span>₹${formatPrice(order.total)}</span></div>
  <div class="tot-row"><span>Paid Advance:</span><span>₹${formatPrice(order.advanceAmount)}</span></div>
  
  <div class="bal-banner">
    ${balanceDue > 0
      ? `>>> DUE: ₹${formatPrice(balanceDue)} <<<<br/><span style="font-size:9.5px;font-weight:normal">Collect Cash or Scan UPI</span>`
      : `*** FULLY PAID ***`
    }
  </div>

  <div>MODE: ${order.paymentType === 'full' ? '100% PREPAID' : '10% ADV (COD)'}</div>
  ${order.deliveryOtp ? `<div class="b">HANDOVER OTP: ${escapeHtml(order.deliveryOtp)}</div>` : ''}
  <div class="d-line"></div>
  <div class="c" style="font-size:9.5px">Thank You For Shopping!</div>
  <div class="c" style="font-size:8.5px">greenvest.shop · Quality Assured</div>
  <div style="height:12px"></div>

  <script>
    function doPrint() {
      try {
        window.focus();
        window.print();
      } catch(e){}
    }
    window.addEventListener('DOMContentLoaded', () => { setTimeout(doPrint, 350); });
    if (document.readyState === 'complete') { setTimeout(doPrint, 350); }
  </script>
</body>
</html>`
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

// ── 5. Public Exported Trigger Functions ────────────────────────────────
export function printOrderInvoice(order: Order, lang: 'en' | 'bn' = 'bn'): boolean {
  const html = generateInvoiceHtml(order, lang)
  return executePrint(html, `Invoice-${order.id}`)
}

export function printThermalReceipt(order: Order, lang: 'en' | 'bn' = 'bn'): boolean {
  const html = generateThermalReceiptHtml(order, lang)
  return executePrint(html, `Thermal-Receipt-${order.id}`)
}

export function printPackingList(orders: Order[], lang: 'en' | 'bn' = 'en'): boolean {
  const html = generatePackingListHtml(orders, lang)
  return executePrint(html, 'Packing-List')
}

export function printRiderManifest(orders: Order[], lang: 'en' | 'bn' = 'en'): boolean {
  const html = generateRiderManifestHtml(orders, lang)
  return executePrint(html, 'Rider-Manifest')
}

export function downloadInvoiceHtml(order: Order, lang: 'en' | 'bn' = 'bn'): void {
  if (typeof window === 'undefined') return
  const html = generateInvoiceHtml(order, lang)
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
