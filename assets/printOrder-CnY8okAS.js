import{p as e}from"./index-Re7e8hU4.js";function t(t){let n=t.items.map(e=>`<tr><td>${e.emoji} ${e.name} (G${e.grade})</td><td>${e.qty}</td><td>৳${e.unitPrice}</td><td>৳${e.unitPrice*e.qty}</td></tr>`).join(``),r=t.deliverySlot?e[t.deliverySlot].en:`—`,i=`<!DOCTYPE html><html><head><title>Invoice ${t.id}</title>
  <style>
    body{font-family:'Hind Siliguri','Noto Sans Bengali','Nirmala UI',system-ui,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 4px} .muted{color:#666;font-size:14px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
    th{font-size:12px;text-transform:uppercase;color:#555}
    .tot{margin-top:16px;font-size:16px}
  </style></head><body>
  <h1>GreenVest Invoice</h1>
  <p class="muted">${t.id} · ${new Date(t.createdAt).toLocaleString()}</p>
  <p><strong>${t.userName}</strong><br/>${t.phone}<br/>${t.address}<br/>PIN ${t.pin}<br/>Slot: ${r}</p>
  <table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
  <tbody>${n}</tbody></table>
  <div class="tot">
    <div>Subtotal: ৳${t.subtotal}</div>
    <div>Delivery: ৳${t.deliveryFee}</div>
    <div><strong>Total: ৳${t.total}</strong></div>
    <div>Advance (50%): ৳${t.advanceAmount}</div>
    <div>UTR: ${t.utr} ${t.utrVerified?`(verified)`:`(pending)`}</div>
  </div>
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`,a=window.open(``,`_blank`,`width=720,height=900`);a&&(a.document.write(i),a.document.close())}function n(t){let n=t.items.map(e=>`<div>${e.name.slice(0,14)} (G${e.grade}) x${e.qty} = ৳${e.unitPrice*e.qty}</div>`).join(``),r=t.deliverySlot?e[t.deliverySlot].en:`Standard`,i=`<!DOCTYPE html><html><head><title>Thermal Receipt ${t.id}</title>
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
  <div>ID: ${t.id}</div>
  <div>Date: ${new Date(t.createdAt).toLocaleDateString()}</div>
  <div>Cust: ${t.userName.slice(0,16)}</div>
  <div>Ph: ${t.phone}</div>
  <div>Slot: ${r}</div>
  <div class="hr"></div>
  ${n}
  <div class="hr"></div>
  <div>Subtotal: ৳${t.subtotal}</div>
  <div>Delivery: ৳${t.deliveryFee}</div>
  <div class="b">Total: ৳${t.total}</div>
  <div>Advance: ৳${t.advanceAmount}</div>
  <div>UTR: ${t.utr}</div>
  <div class="hr"></div>
  <div class="c">Thank You!</div>
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`,a=window.open(``,`_blank`,`width=320,height=600`);a&&(a.document.write(i),a.document.close())}function r(e,t=`en`){let n=e.filter(e=>e.status!==`cancelled`&&e.status!==`delivered`),r=n.filter(e=>e.deliverySlot===`morning`||!e.deliverySlot),i=n.filter(e=>e.deliverySlot===`evening`),a=(e,n)=>{if(n.length===0)return`<h2>${e}</h2><p class="muted">${t===`bn`?`কোনো অর্ডার নেই`:`No orders`}</p>`;let r=n.map(e=>{let t=e.items.map(e=>`<li>${e.emoji} ${e.name} (G${e.grade}) × ${e.qty}</li>`).join(``);return`<div class="block">
          <strong>${e.id}</strong> · ${e.userName} · ${e.phone}
          <div class="muted">${e.address}${e.pin?` · PIN ${e.pin}`:``}</div>
          <ul>${t}</ul>
        </div>`}).join(``);return`<h2>${e} (${n.length})</h2>${r}`},o=t===`bn`?`ডেলিভারি প্যাকিং লিস্ট`:`Delivery packing list`,s=`<!DOCTYPE html><html><head><title>${o}</title>
  <style>
    body{font-family:'Hind Siliguri','Noto Sans Bengali','Nirmala UI',system-ui,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 8px} h2{margin:24px 0 8px;border-bottom:2px solid #166534;padding-bottom:4px}
    .muted{color:#666;font-size:14px} .block{margin:12px 0;padding:10px 0;border-bottom:1px solid #eee}
    ul{margin:6px 0 0;padding-left:18px}
  </style></head><body>
  <h1>${o}</h1>
  <p class="muted">${new Date().toLocaleString()}</p>
  ${a(t===`bn`?`সকাল`:`Morning (8 AM – 12 PM)`,r)}
  ${a(t===`bn`?`সন্ধ্যা`:`Evening (4 PM – 8 PM)`,i)}
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`,c=window.open(``,`_blank`,`width=800,height=1000`);c&&(c.document.write(s),c.document.close())}export{r as n,n as r,t};