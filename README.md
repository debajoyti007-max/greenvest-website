# GreenVest – Fresh groceries (production)

Customer shop + seller tools + admin users.  
**Manual UPI / UTR** · **Min order ₹500** · **Delivery 12–24 hours**  
Live data via **Supabase**. Public site on **GitHub Pages**.

**Live URL:** https://debajoyti007-max.github.io/greenvest-website/

---

## Production checklist (owner)

1. **Supabase keys** in GitHub → Settings → Secrets → Actions  
   - `VITE_SUPABASE_URL`  
   - `VITE_SUPABASE_ANON_KEY` (anon only — never `service_role`)
2. If you ever pasted a **service_role** key in chat, **rotate it** in Supabase → Project Settings → API.
3. **Rotate or delete** old demo logins (`customer@demo.com` / `demo123`). Create real seller/admin accounts with strong passwords, then:
   ```sql
   update public.profiles set role = 'seller' where email = 'YOUR_SELLER@email.com';
   update public.profiles set role = 'admin' where email = 'YOUR_ADMIN@email.com';
   ```
4. Supabase Auth: prefer **Confirm email OFF** until you configure SMTP, or turn it ON for stricter signups.
5. Push to `master` → GitHub Actions deploys Pages automatically.

### Optional env overrides
See `.env.example` for `VITE_SUPPORT_PHONE`, `VITE_SUPPORT_WHATSAPP`, `VITE_UPI_ID`, etc.

---

## Local development
```bash
cd C:\Users\Debajoyti\Documents\greenvest-website
npm install
copy .env.example .env
# fill VITE_SUPABASE_* then:
npm run dev
```
Open http://localhost:3000  

Without Supabase keys, **dev only** falls back to local demo data. Production builds **require** Supabase.

### First-time Supabase setup
1. Create project at [supabase.com](https://supabase.com)  
2. SQL Editor → run `supabase/schema.sql`  
3. Create Auth users → set roles in `profiles`  
4. Sync catalog (optional): `node scripts/sync-products.mjs`

---

## Features
- Bangla / English UI  
- Shared products & orders (cloud)  
- UPI QR + manual UTR, min ₹500, delivery 12–24h  
- WhatsApp seller notify on order  
- Seller stock / photo upload / UTR verify  
- Admin make/revoke sellers (no “reset demo” in production)
