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
