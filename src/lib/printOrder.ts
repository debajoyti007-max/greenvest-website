import type { Order } from '../types'


function escapeHtml(str: unknown): string {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function printOrderInvoice(order: Order) {
  const rows = order.items
    .map(
      (it) => {
        const weightText = it.weightLabel ? ` [${escapeHtml(it.weightLabel)}]` : ''
        return `<tr><td>${escapeHtml(it.emoji)} ${escapeHtml(it.name)}${weightText} (G${escapeHtml(it.grade)})</td><td>${Number(it.qty)}</td><td>₹${Number(it.unitPrice)}</td><td>₹${Number(it.unitPrice) * Number(it.qty)}</td></tr>`
      }
    )
    .join('')

  const html = `<!DOCTYPE html><html><head><title>Invoice ${escapeHtml(order.id)}</title>
  <style>
    body{font-family:'Hind Siliguri','Noto Sans Bengali','Nirmala UI',system-ui,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 4px} .muted{color:#666;font-size:14px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
    th{font-size:12px;text-transform:uppercase;color:#555}
    .tot{margin-top:16px;font-size:16px}
  </style></head><body>
  <h1>GreenVest Invoice</h1>
  <p class="muted">${escapeHtml(order.id)} · ${new Date(order.createdAt).toLocaleString()}</p>
  <p><strong>${escapeHtml(order.userName)}</strong><br/>${escapeHtml(order.phone)}<br/>${escapeHtml(order.address)}<br/>PIN ${escapeHtml(order.pin)}<br/>Delivery: <b>${order.deliveryDate && order.deliveryDate !== 'standard' ? escapeHtml(order.deliveryDate) : 'Standard 12–24h'}</b></p>
  <table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="tot">
    <div>Subtotal: ₹${Number(order.subtotal)}</div>
    <div>Delivery: ₹${Number(order.deliveryFee)}</div>
    ${order.discountAmount ? `<div style="color:#16a34a">Discount: -₹${Number(order.discountAmount)}</div>` : ''}
    <div><strong>Total: ₹${Number(order.total)}</strong></div>
    <div>Paid Amount: ₹${Number(order.advanceAmount)} (${order.paymentType === 'full' ? '100% Full' : '50% Advance'})</div>
    <div>Balance Due: ₹${Math.max(0, Number(order.total) - Number(order.advanceAmount))}</div>
    <div>UTR: ${escapeHtml(order.utr)} ${order.utrVerified ? '(verified)' : '(pending)'}</div>
  </div>
  <script>window.onload=()=>window.print()</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=720,height=900,noopener,noreferrer')
  if (!w) return
  w.document.write(html)
  w.document.close()
}

/** Print receipt formatted for 58mm/80mm Bluetooth thermal receipt printers. */
export function printThermalReceipt(order: Order) {
  const rows = order.items
    .map(
      (it) => {
        const weightText = it.weightLabel ? ` [${escapeHtml(it.weightLabel)}]` : ''
        return `<div>${escapeHtml(it.name.slice(0, 14))}${weightText} (G${escapeHtml(it.grade)}) x${Number(it.qty)} = ₹${Number(it.unitPrice) * Number(it.qty)}</div>`
      }
    )
    .join('')

  const html = `<!DOCTYPE html><html><head><title>Thermal Receipt ${escapeHtml(order.id)}</title>
  <style>
    @page { size: 58mm auto; margin: 0; }
    body { font-family: monospace; width: 58mm; padding: 4px; margin: 0; font-size: 11px; color: #000; }
    .c { text-align: center; }
    .b { font-weight: bold; }
    .hr { border-bottom: 1px dashed #000; margin: 4px 0; }
  </style></head><body>
  <div class="c b">GREENVEST</div>
  <div class="c">Fresh Vegetables</div>
  <div class="hr"></div>
  <div>ID: ${escapeHtml(order.id)}</div>
  <div>Date: ${new Date(order.createdAt).toLocaleDateString()}</div>
  <div>Cust: ${escapeHtml(order.userName.slice(0, 16))}</div>
  <div>Ph: ${escapeHtml(order.phone)}</div>
  <div>Delivery: ${order.deliveryDate && order.deliveryDate !== 'standard' ? escapeHtml(order.deliveryDate) : '12–24h'}</div>
  <div class="hr"></div>
  ${rows}
  <div class="hr"></div>
  <div>Subtotal: ₹${Number(order.subtotal)}</div>
  <div>Delivery: ₹${Number(order.deliveryFee)}</div>
  ${order.discountAmount ? `<div>Discount: -₹${Number(order.discountAmount)}</div>` : ''}
  <div class="b">Total: ₹${Number(order.total)}</div>
  <div>Paid: ₹${Number(order.advanceAmount)}</div>
  <div>Due: ₹${Math.max(0, Number(order.total) - Number(order.advanceAmount))}</div>
  <div>UTR: ${escapeHtml(order.utr)}</div>
  <div class="hr"></div>
  <div class="c">Thank You!</div>
  <script>window.onload=()=>window.print()</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=320,height=600,noopener,noreferrer')
  if (!w) return
  w.document.write(html)
  w.document.close()
}

/** Print packing / delivery list grouped by morning & evening slots. */
export function printPackingList(orders: Order[], lang: 'en' | 'bn' = 'en') {
  const active = orders.filter(
    (o) => o.status !== 'cancelled' && o.status !== 'delivered',
  )
  const morning = active.filter((o) => o.deliverySlot === 'morning' || !o.deliverySlot)
  const evening = active.filter((o) => o.deliverySlot === 'evening')

  const section = (title: string, list: Order[]) => {
    if (list.length === 0) {
      return `<h2>${escapeHtml(title)}</h2><p class="muted">${lang === 'bn' ? 'কোনো অর্ডার নেই' : 'No orders'}</p>`
    }
    const blocks = list
      .map((o) => {
        const items = o.items
          .map((it) => {
            const weightText = it.weightLabel ? ` [${escapeHtml(it.weightLabel)}]` : ''
            return `<li>${escapeHtml(it.emoji)} ${escapeHtml(it.name)}${weightText} (G${escapeHtml(it.grade)}) × ${Number(it.qty)}</li>`
          })
          .join('')
        return `<div class="block">
          <strong>${escapeHtml(o.id)}</strong> · ${escapeHtml(o.userName)} · ${escapeHtml(o.phone)}
          <div class="muted">${escapeHtml(o.address)}${o.pin ? ` · PIN ${escapeHtml(o.pin)}` : ''}</div>
          <ul>${items}</ul>
        </div>`
      })
      .join('')
    return `<h2>${escapeHtml(title)} (${list.length})</h2>${blocks}`
  }

  const title = lang === 'bn' ? 'ডেলিভারি প্যাকিং লিস্ট' : 'Delivery packing list'
  const html = `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
  <style>
    body{font-family:'Hind Siliguri','Noto Sans Bengali','Nirmala UI',system-ui,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 8px} h2{margin:24px 0 8px;border-bottom:2px solid #166534;padding-bottom:4px}
    .muted{color:#666;font-size:14px} .block{margin:12px 0;padding:10px 0;border-bottom:1px solid #eee}
    ul{margin:6px 0 0;padding-left:18px}
  </style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted">${new Date().toLocaleString()}</p>
  ${section(lang === 'bn' ? 'সকাল' : 'Morning (8 AM – 12 PM)', morning)}
  ${section(lang === 'bn' ? 'সন্ধ্যা' : 'Evening (4 PM – 8 PM)', evening)}
  <script>window.onload=()=>window.print()</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=800,height=1000,noopener,noreferrer')
  if (!w) return
  w.document.write(html)
  w.document.close()
}

/** Print dedicated Delivery Rider Manifest Sheet with PIN grouping, item breakdown, and balance collection tracking. */
export function printRiderManifest(orders: Order[], lang: 'en' | 'bn' = 'en') {
  const active = orders.filter(
    (o) => o.status !== 'cancelled' && o.status !== 'delivered',
  )
  if (active.length === 0) {
    alert(lang === 'bn' ? 'ডেলিভারির জন্য কোনো সক্রিয় অর্ডার নেই।' : 'No active orders for delivery.')
    return
  }

  // Group by PIN
  const pinGroups = new Map<string, Order[]>()
  active.forEach((o) => {
    const pin = o.pin || 'Other'
    if (!pinGroups.has(pin)) pinGroups.set(pin, [])
    pinGroups.get(pin)!.push(o)
  })

  let totalBalanceToCollect = 0

  let bodyHtml = ''
  for (const [pin, list] of pinGroups.entries()) {
    const rows = list
      .map((o, idx) => {
        const balance = Math.max(0, o.total - o.advanceAmount)
        totalBalanceToCollect += balance
        const itemsStr = o.items
          .map((it) => {
            const weightText = it.weightLabel ? ` [${escapeHtml(it.weightLabel)}]` : ''
            return `${escapeHtml(it.emoji)} ${escapeHtml(it.name)}${weightText} (${escapeHtml(it.grade)}) ×${Number(it.qty)}`
          })
          .join(', ')
        const slot =
          o.deliverySlot === 'morning'
            ? '🌅 Morning'
            : o.deliverySlot === 'evening'
            ? '🌆 Evening'
            : 'Standard'
        return `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <strong>${escapeHtml(o.userName)}</strong><br/>
            <span class="muted">${escapeHtml(o.phone)}</span>
          </td>
          <td>
            ${escapeHtml(o.address)}<br/>
            <span class="badge">${escapeHtml(slot)}</span>
          </td>
          <td><small>${itemsStr}</small></td>
          <td>₹${Number(o.total)}</td>
          <td>₹${Number(o.advanceAmount)}</td>
          <td class="bal">₹${balance}</td>
          <td class="check">[ &nbsp; ]</td>
        </tr>
      `
      })
      .join('')

    bodyHtml += `
      <div class="zone-header">📍 PIN Zone: ${escapeHtml(pin)} (${list.length} orders)</div>
      <table>
        <thead>
          <tr>
            <th style="width:30px">#</th>
            <th>Customer</th>
            <th>Address & Slot</th>
            <th>Items</th>
            <th>Total</th>
            <th>Advance</th>
            <th>Collect</th>
            <th style="width:60px">Done</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `
  }

  const title = lang === 'bn' ? 'রাইডার ডেলিভারি শিট' : 'Rider Delivery Manifest'
  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const html = `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
  <style>
    body{font-family:'Hind Siliguri','Noto Sans Bengali',system-ui,sans-serif;padding:20px;color:#111;font-size:13px}
    h1{margin:0 0 4px;font-size:22px;color:#166534} .muted{color:#666;font-size:12px}
    .header-box{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #166534;padding-bottom:10px;margin-bottom:16px}
    .zone-header{font-size:15px;font-weight:bold;margin:16px 0 8px;background:#f0fdf4;padding:6px 10px;border-left:4px solid #166534;border-radius:4px}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}
    th,td{border:1px solid #d1d5db;padding:8px;text-align:left;vertical-align:top}
    th{background:#f9fafb;font-size:11px;text-transform:uppercase;color:#374151}
    .bal{font-weight:bold;color:#dc2626}
    .badge{display:inline-block;font-size:10px;padding:2px 6px;background:#e0f2fe;color:#0369a1;border-radius:4px;margin-top:2px}
    .check{text-align:center;font-weight:bold;font-size:14px}
    .summary-box{margin-top:20px;padding:12px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;display:flex;justify-content:space-between;font-size:14px;font-weight:bold;color:#991b1b}
    .sig-area{margin-top:30px;display:flex;justify-content:space-between;padding-top:20px;border-top:1px dashed #ccc}
  </style></head><body>
  <div class="header-box">
    <div>
      <h1>🌿 GreenVest ${escapeHtml(title)}</h1>
      <div class="muted">Date: ${escapeHtml(dateStr)} · Active Orders: ${active.length}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:16px;font-weight:bold;color:#dc2626">Total Cash to Collect: ₹${totalBalanceToCollect}</div>
    </div>
  </div>
  ${bodyHtml}
  <div class="summary-box">
    <span>Total Orders to Deliver: ${active.length}</span>
    <span>Total Cash/UPI Balance to Collect: ₹${totalBalanceToCollect}</span>
  </div>
  <div class="sig-area">
    <div>Rider Name & Signature: _______________________</div>
    <div>Seller Approval: _______________________</div>
  </div>
  <script>window.onload=()=>window.print()</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=900,height=1000,noopener,noreferrer')
  if (!w) return
  w.document.write(html)
  w.document.close()
}
