function e(e){return e==null?``:String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#039;`)}function t(t){let n=t.items.map(t=>{let n=t.weightLabel?` [${e(t.weightLabel)}]`:``;return`<tr><td>${e(t.emoji)} ${e(t.name)}${n} (G${e(t.grade)})</td><td>${Number(t.qty)}</td><td>₹${Number(t.unitPrice)}</td><td>₹${Number(t.unitPrice)*Number(t.qty)}</td></tr>`}).join(``),r=`<!DOCTYPE html><html><head><title>Invoice ${e(t.id)}</title>
  <style>
    body{font-family:'Hind Siliguri','Noto Sans Bengali','Nirmala UI',system-ui,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 4px} .muted{color:#666;font-size:14px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
    th{font-size:12px;text-transform:uppercase;color:#555}
    .tot{margin-top:16px;font-size:16px}
  </style></head><body>
  <h1>GreenVest Invoice</h1>
  <p class="muted">${e(t.id)} · ${new Date(t.createdAt).toLocaleString()}</p>
  <p><strong>${e(t.userName)}</strong><br/>${e(t.phone)}<br/>${e(t.address)}<br/>PIN ${e(t.pin)}<br/>Delivery: <b>${t.deliveryDate&&t.deliveryDate!==`standard`?e(t.deliveryDate):`Standard 12–24h`}</b></p>
  <table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
  <tbody>${n}</tbody></table>
  <div class="tot">
    <div>Subtotal: ₹${Number(t.subtotal)}</div>
    <div>Delivery: ₹${Number(t.deliveryFee)}</div>
    ${t.discountAmount?`<div style="color:#16a34a">Discount: -₹${Number(t.discountAmount)}</div>`:``}
    <div><strong>Total: ₹${Number(t.total)}</strong></div>
    <div>Paid Amount: ₹${Number(t.advanceAmount)} (${t.paymentType===`full`?`100% Full`:`50% Advance`})</div>
    <div>Balance Due: ₹${Math.max(0,Number(t.total)-Number(t.advanceAmount))}</div>
    <div>UTR: ${e(t.utr)} ${t.utrVerified?`(verified)`:`(pending)`}</div>
  </div>
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`,i=window.open(``,`_blank`,`width=720,height=900,noopener,noreferrer`);i&&(i.document.write(r),i.document.close())}function n(t){let n=t.items.map(t=>{let n=t.weightLabel?` [${e(t.weightLabel)}]`:``;return`<div>${e(t.name.slice(0,14))}${n} (G${e(t.grade)}) x${Number(t.qty)} = ₹${Number(t.unitPrice)*Number(t.qty)}</div>`}).join(``),r=`<!DOCTYPE html><html><head><title>Thermal Receipt ${e(t.id)}</title>
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
  <div>ID: ${e(t.id)}</div>
  <div>Date: ${new Date(t.createdAt).toLocaleDateString()}</div>
  <div>Cust: ${e(t.userName.slice(0,16))}</div>
  <div>Ph: ${e(t.phone)}</div>
  <div>Delivery: ${t.deliveryDate&&t.deliveryDate!==`standard`?e(t.deliveryDate):`12–24h`}</div>
  <div class="hr"></div>
  ${n}
  <div class="hr"></div>
  <div>Subtotal: ₹${Number(t.subtotal)}</div>
  <div>Delivery: ₹${Number(t.deliveryFee)}</div>
  ${t.discountAmount?`<div>Discount: -₹${Number(t.discountAmount)}</div>`:``}
  <div class="b">Total: ₹${Number(t.total)}</div>
  <div>Paid: ₹${Number(t.advanceAmount)}</div>
  <div>Due: ₹${Math.max(0,Number(t.total)-Number(t.advanceAmount))}</div>
  <div>UTR: ${e(t.utr)}</div>
  <div class="hr"></div>
  <div class="c">Thank You!</div>
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`,i=window.open(``,`_blank`,`width=320,height=600,noopener,noreferrer`);i&&(i.document.write(r),i.document.close())}function r(t,n=`en`){let r=t.filter(e=>e.status!==`cancelled`&&e.status!==`delivered`),i=r.filter(e=>e.deliverySlot===`morning`||!e.deliverySlot),a=r.filter(e=>e.deliverySlot===`evening`),o=(t,r)=>{if(r.length===0)return`<h2>${e(t)}</h2><p class="muted">${n===`bn`?`কোনো অর্ডার নেই`:`No orders`}</p>`;let i=r.map(t=>{let n=t.items.map(t=>{let n=t.weightLabel?` [${e(t.weightLabel)}]`:``;return`<li>${e(t.emoji)} ${e(t.name)}${n} (G${e(t.grade)}) × ${Number(t.qty)}</li>`}).join(``);return`<div class="block">
          <strong>${e(t.id)}</strong> · ${e(t.userName)} · ${e(t.phone)}
          <div class="muted">${e(t.address)}${t.pin?` · PIN ${e(t.pin)}`:``}</div>
          <ul>${n}</ul>
        </div>`}).join(``);return`<h2>${e(t)} (${r.length})</h2>${i}`},s=n===`bn`?`ডেলিভারি প্যাকিং লিস্ট`:`Delivery packing list`,c=`<!DOCTYPE html><html><head><title>${e(s)}</title>
  <style>
    body{font-family:'Hind Siliguri','Noto Sans Bengali','Nirmala UI',system-ui,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 8px} h2{margin:24px 0 8px;border-bottom:2px solid #166534;padding-bottom:4px}
    .muted{color:#666;font-size:14px} .block{margin:12px 0;padding:10px 0;border-bottom:1px solid #eee}
    ul{margin:6px 0 0;padding-left:18px}
  </style></head><body>
  <h1>${e(s)}</h1>
  <p class="muted">${new Date().toLocaleString()}</p>
  ${o(n===`bn`?`সকাল`:`Morning (8 AM – 12 PM)`,i)}
  ${o(n===`bn`?`সন্ধ্যা`:`Evening (4 PM – 8 PM)`,a)}
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`,l=window.open(``,`_blank`,`width=800,height=1000,noopener,noreferrer`);l&&(l.document.write(c),l.document.close())}function i(t,n=`en`){let r=t.filter(e=>e.status!==`cancelled`&&e.status!==`delivered`);if(r.length===0){alert(n===`bn`?`ডেলিভারির জন্য কোনো সক্রিয় অর্ডার নেই।`:`No active orders for delivery.`);return}let i=new Map;r.forEach(e=>{let t=e.pin||`Other`;i.has(t)||i.set(t,[]),i.get(t).push(e)});let a=0,o=``;for(let[t,n]of i.entries()){let r=n.map((t,n)=>{let r=Math.max(0,t.total-t.advanceAmount);a+=r;let i=t.items.map(t=>{let n=t.weightLabel?` [${e(t.weightLabel)}]`:``;return`${e(t.emoji)} ${e(t.name)}${n} (${e(t.grade)}) ×${Number(t.qty)}`}).join(`, `),o=t.deliverySlot===`morning`?`🌅 Morning`:t.deliverySlot===`evening`?`🌆 Evening`:`Standard`;return`
        <tr>
          <td>${n+1}</td>
          <td>
            <strong>${e(t.userName)}</strong><br/>
            <span class="muted">${e(t.phone)}</span>
          </td>
          <td>
            ${e(t.address)}<br/>
            <span class="badge">${e(o)}</span>
          </td>
          <td><small>${i}</small></td>
          <td>₹${Number(t.total)}</td>
          <td>₹${Number(t.advanceAmount)}</td>
          <td class="bal">₹${r}</td>
          <td class="check">[ &nbsp; ]</td>
        </tr>
      `}).join(``);o+=`
      <div class="zone-header">📍 PIN Zone: ${e(t)} (${n.length} orders)</div>
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
        <tbody>${r}</tbody>
      </table>
    `}let s=n===`bn`?`রাইডার ডেলিভারি শিট`:`Rider Delivery Manifest`,c=new Date().toLocaleDateString(`en-IN`,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`}),l=`<!DOCTYPE html><html><head><title>${e(s)}</title>
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
      <h1>🌿 GreenVest ${e(s)}</h1>
      <div class="muted">Date: ${e(c)} · Active Orders: ${r.length}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:16px;font-weight:bold;color:#dc2626">Total Cash to Collect: ₹${a}</div>
    </div>
  </div>
  ${o}
  <div class="summary-box">
    <span>Total Orders to Deliver: ${r.length}</span>
    <span>Total Cash/UPI Balance to Collect: ₹${a}</span>
  </div>
  <div class="sig-area">
    <div>Rider Name & Signature: _______________________</div>
    <div>Seller Approval: _______________________</div>
  </div>
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`,u=window.open(``,`_blank`,`width=900,height=1000,noopener,noreferrer`);u&&(u.document.write(l),u.document.close())}export{n as i,r as n,i as r,t};