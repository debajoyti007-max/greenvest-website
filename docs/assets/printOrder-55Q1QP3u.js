import{T as e}from"./index-DLHIyS5_.js";function t(e){return e==null?``:String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#039;`)}function n(n){let r=n.items.map(e=>{let n=e.weightLabel?` [${t(e.weightLabel)}]`:``;return`<tr><td>${t(e.emoji)} ${t(e.name)}${n} (G${t(e.grade)})</td><td>${Number(e.qty)}</td><td>₹${Number(e.unitPrice)}</td><td>₹${Number(e.unitPrice)*Number(e.qty)}</td></tr>`}).join(``),i=n.deliverySlot?t(e[n.deliverySlot].en):`—`,a=`<!DOCTYPE html><html><head><title>Invoice ${t(n.id)}</title>
  <style>
    body{font-family:'Hind Siliguri','Noto Sans Bengali','Nirmala UI',system-ui,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 4px} .muted{color:#666;font-size:14px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
    th{font-size:12px;text-transform:uppercase;color:#555}
    .tot{margin-top:16px;font-size:16px}
  </style></head><body>
  <h1>GreenVest Invoice</h1>
  <p class="muted">${t(n.id)} · ${new Date(n.createdAt).toLocaleString()}</p>
  <p><strong>${t(n.userName)}</strong><br/>${t(n.phone)}<br/>${t(n.address)}<br/>PIN ${t(n.pin)}<br/>Slot: ${i}</p>
  <table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
  <tbody>${r}</tbody></table>
  <div class="tot">
    <div>Subtotal: ₹${Number(n.subtotal)}</div>
    <div>Delivery: ₹${Number(n.deliveryFee)}</div>
    ${n.discountAmount?`<div style="color:#16a34a">Discount: -₹${Number(n.discountAmount)}</div>`:``}
    <div><strong>Total: ₹${Number(n.total)}</strong></div>
    <div>Paid Amount: ₹${Number(n.advanceAmount)} (${n.paymentType===`full`?`100% Full`:`50% Advance`})</div>
    <div>Balance Due: ₹${Math.max(0,Number(n.total)-Number(n.advanceAmount))}</div>
    <div>UTR: ${t(n.utr)} ${n.utrVerified?`(verified)`:`(pending)`}</div>
  </div>
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`,o=window.open(``,`_blank`,`width=720,height=900,noopener,noreferrer`);o&&(o.document.write(a),o.document.close())}function r(n){let r=n.items.map(e=>{let n=e.weightLabel?` [${t(e.weightLabel)}]`:``;return`<div>${t(e.name.slice(0,14))}${n} (G${t(e.grade)}) x${Number(e.qty)} = ₹${Number(e.unitPrice)*Number(e.qty)}</div>`}).join(``),i=n.deliverySlot?t(e[n.deliverySlot].en):`Standard`,a=`<!DOCTYPE html><html><head><title>Thermal Receipt ${t(n.id)}</title>
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
  <div>ID: ${t(n.id)}</div>
  <div>Date: ${new Date(n.createdAt).toLocaleDateString()}</div>
  <div>Cust: ${t(n.userName.slice(0,16))}</div>
  <div>Ph: ${t(n.phone)}</div>
  <div>Slot: ${i}</div>
  <div class="hr"></div>
  ${r}
  <div class="hr"></div>
  <div>Subtotal: ₹${Number(n.subtotal)}</div>
  <div>Delivery: ₹${Number(n.deliveryFee)}</div>
  ${n.discountAmount?`<div>Discount: -₹${Number(n.discountAmount)}</div>`:``}
  <div class="b">Total: ₹${Number(n.total)}</div>
  <div>Paid: ₹${Number(n.advanceAmount)}</div>
  <div>Due: ₹${Math.max(0,Number(n.total)-Number(n.advanceAmount))}</div>
  <div>UTR: ${t(n.utr)}</div>
  <div class="hr"></div>
  <div class="c">Thank You!</div>
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`,o=window.open(``,`_blank`,`width=320,height=600,noopener,noreferrer`);o&&(o.document.write(a),o.document.close())}function i(e,n=`en`){let r=e.filter(e=>e.status!==`cancelled`&&e.status!==`delivered`),i=r.filter(e=>e.deliverySlot===`morning`||!e.deliverySlot),a=r.filter(e=>e.deliverySlot===`evening`),o=(e,r)=>{if(r.length===0)return`<h2>${t(e)}</h2><p class="muted">${n===`bn`?`কোনো অর্ডার নেই`:`No orders`}</p>`;let i=r.map(e=>{let n=e.items.map(e=>{let n=e.weightLabel?` [${t(e.weightLabel)}]`:``;return`<li>${t(e.emoji)} ${t(e.name)}${n} (G${t(e.grade)}) × ${Number(e.qty)}</li>`}).join(``);return`<div class="block">
          <strong>${t(e.id)}</strong> · ${t(e.userName)} · ${t(e.phone)}
          <div class="muted">${t(e.address)}${e.pin?` · PIN ${t(e.pin)}`:``}</div>
          <ul>${n}</ul>
        </div>`}).join(``);return`<h2>${t(e)} (${r.length})</h2>${i}`},s=n===`bn`?`ডেলিভারি প্যাকিং লিস্ট`:`Delivery packing list`,c=`<!DOCTYPE html><html><head><title>${t(s)}</title>
  <style>
    body{font-family:'Hind Siliguri','Noto Sans Bengali','Nirmala UI',system-ui,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 8px} h2{margin:24px 0 8px;border-bottom:2px solid #166534;padding-bottom:4px}
    .muted{color:#666;font-size:14px} .block{margin:12px 0;padding:10px 0;border-bottom:1px solid #eee}
    ul{margin:6px 0 0;padding-left:18px}
  </style></head><body>
  <h1>${t(s)}</h1>
  <p class="muted">${new Date().toLocaleString()}</p>
  ${o(n===`bn`?`সকাল`:`Morning (8 AM – 12 PM)`,i)}
  ${o(n===`bn`?`সন্ধ্যা`:`Evening (4 PM – 8 PM)`,a)}
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`,l=window.open(``,`_blank`,`width=800,height=1000,noopener,noreferrer`);l&&(l.document.write(c),l.document.close())}function a(e,n=`en`){let r=e.filter(e=>e.status!==`cancelled`&&e.status!==`delivered`);if(r.length===0){alert(n===`bn`?`ডেলিভারির জন্য কোনো সক্রিয় অর্ডার নেই।`:`No active orders for delivery.`);return}let i=new Map;r.forEach(e=>{let t=e.pin||`Other`;i.has(t)||i.set(t,[]),i.get(t).push(e)});let a=0,o=``;for(let[e,n]of i.entries()){let r=n.map((e,n)=>{let r=Math.max(0,e.total-e.advanceAmount);a+=r;let i=e.items.map(e=>{let n=e.weightLabel?` [${t(e.weightLabel)}]`:``;return`${t(e.emoji)} ${t(e.name)}${n} (${t(e.grade)}) ×${Number(e.qty)}`}).join(`, `),o=e.deliverySlot===`morning`?`🌅 Morning`:e.deliverySlot===`evening`?`🌆 Evening`:`Standard`;return`
        <tr>
          <td>${n+1}</td>
          <td>
            <strong>${t(e.userName)}</strong><br/>
            <span class="muted">${t(e.phone)}</span>
          </td>
          <td>
            ${t(e.address)}<br/>
            <span class="badge">${t(o)}</span>
          </td>
          <td><small>${i}</small></td>
          <td>₹${Number(e.total)}</td>
          <td>₹${Number(e.advanceAmount)}</td>
          <td class="bal">₹${r}</td>
          <td class="check">[ &nbsp; ]</td>
        </tr>
      `}).join(``);o+=`
      <div class="zone-header">📍 PIN Zone: ${t(e)} (${n.length} orders)</div>
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
    `}let s=n===`bn`?`রাইডার ডেলিভারি শিট`:`Rider Delivery Manifest`,c=new Date().toLocaleDateString(`en-IN`,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`}),l=`<!DOCTYPE html><html><head><title>${t(s)}</title>
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
      <h1>🌿 GreenVest ${t(s)}</h1>
      <div class="muted">Date: ${t(c)} · Active Orders: ${r.length}</div>
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
  </body></html>`,u=window.open(``,`_blank`,`width=900,height=1000,noopener,noreferrer`);u&&(u.document.write(l),u.document.close())}export{r as i,i as n,a as r,n as t};