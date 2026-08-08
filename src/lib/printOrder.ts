import type { Order } from '../types'
import { DELIVERY_SLOTS } from './business'

export function printOrderInvoice(order: Order) {
  const rows = order.items
    .map(
      (it) =>
        `<tr><td>${it.emoji} ${it.name} (G${it.grade})</td><td>${it.qty}</td><td>৳${it.unitPrice}</td><td>৳${it.unitPrice * it.qty}</td></tr>`,
    )
    .join('')

  const slotLabel = order.deliverySlot
    ? DELIVERY_SLOTS[order.deliverySlot].en
    : '—'

  const html = `<!DOCTYPE html><html><head><title>Invoice ${order.id}</title>
  <style>
    body{font-family:'Hind Siliguri','Noto Sans Bengali','Nirmala UI',system-ui,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 4px} .muted{color:#666;font-size:14px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
    th{font-size:12px;text-transform:uppercase;color:#555}
    .tot{margin-top:16px;font-size:16px}
  </style></head><body>
  <h1>GreenVest Invoice</h1>
  <p class="muted">${order.id} · ${new Date(order.createdAt).toLocaleString()}</p>
  <p><strong>${order.userName}</strong><br/>${order.phone}<br/>${order.address}<br/>PIN ${order.pin}<br/>Slot: ${slotLabel}</p>
  <table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="tot">
    <div>Subtotal: ৳${order.subtotal}</div>
    <div>Delivery: ৳${order.deliveryFee}</div>
    <div><strong>Total: ৳${order.total}</strong></div>
    <div>Advance (50%): ৳${order.advanceAmount}</div>
    <div>UTR: ${order.utr} ${order.utrVerified ? '(verified)' : '(pending)'}</div>
  </div>
  <script>window.onload=()=>window.print()</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=720,height=900')
  if (!w) return
  w.document.write(html)
  w.document.close()
}

/** Print receipt formatted for 58mm/80mm Bluetooth thermal receipt printers. */
export function printThermalReceipt(order: Order) {
  const rows = order.items
    .map(
      (it) =>
        `<div>${it.name.slice(0, 14)} (G${it.grade}) x${it.qty} = ৳${it.unitPrice * it.qty}</div>`,
    )
    .join('')

  const slot = order.deliverySlot
    ? DELIVERY_SLOTS[order.deliverySlot].en
    : 'Standard'

  const html = `<!DOCTYPE html><html><head><title>Thermal Receipt ${order.id}</title>
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
  <div>ID: ${order.id}</div>
  <div>Date: ${new Date(order.createdAt).toLocaleDateString()}</div>
  <div>Cust: ${order.userName.slice(0, 16)}</div>
  <div>Ph: ${order.phone}</div>
  <div>Slot: ${slot}</div>
  <div class="hr"></div>
  ${rows}
  <div class="hr"></div>
  <div>Subtotal: ৳${order.subtotal}</div>
  <div>Delivery: ৳${order.deliveryFee}</div>
  <div class="b">Total: ৳${order.total}</div>
  <div>Advance: ৳${order.advanceAmount}</div>
  <div>UTR: ${order.utr}</div>
  <div class="hr"></div>
  <div class="c">Thank You!</div>
  <script>window.onload=()=>window.print()</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=320,height=600')
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
      return `<h2>${title}</h2><p class="muted">${lang === 'bn' ? 'কোনো অর্ডার নেই' : 'No orders'}</p>`
    }
    const blocks = list
      .map((o) => {
        const items = o.items
          .map((it) => `<li>${it.emoji} ${it.name} (G${it.grade}) × ${it.qty}</li>`)
          .join('')
        return `<div class="block">
          <strong>${o.id}</strong> · ${o.userName} · ${o.phone}
          <div class="muted">${o.address}${o.pin ? ` · PIN ${o.pin}` : ''}</div>
          <ul>${items}</ul>
        </div>`
      })
      .join('')
    return `<h2>${title} (${list.length})</h2>${blocks}`
  }

  const title = lang === 'bn' ? 'ডেলিভারি প্যাকিং লিস্ট' : 'Delivery packing list'
  const html = `<!DOCTYPE html><html><head><title>${title}</title>
  <style>
    body{font-family:'Hind Siliguri','Noto Sans Bengali','Nirmala UI',system-ui,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 8px} h2{margin:24px 0 8px;border-bottom:2px solid #166534;padding-bottom:4px}
    .muted{color:#666;font-size:14px} .block{margin:12px 0;padding:10px 0;border-bottom:1px solid #eee}
    ul{margin:6px 0 0;padding-left:18px}
  </style></head><body>
  <h1>${title}</h1>
  <p class="muted">${new Date().toLocaleString()}</p>
  ${section(lang === 'bn' ? 'সকাল' : 'Morning (8 AM – 12 PM)', morning)}
  ${section(lang === 'bn' ? 'সন্ধ্যা' : 'Evening (4 PM – 8 PM)', evening)}
  <script>window.onload=()=>window.print()</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=800,height=1000')
  if (!w) return
  w.document.write(html)
  w.document.close()
}
