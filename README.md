# GreenVest – Fresh groceries (production)

Customer shop + seller tools + admin users.  
**Manual UPI / UTR** · **Min order ₹500** · **Delivery 12–24 hours**  
Live data via **Supabase**. Public site on **GitHub Pages**.

**Live URL:** https://debajoyti007-max.github.io/greenvest-website/

---

## How you log in (roles)

There are **no demo accounts**. Everyone signs up / logs in with a real email at **/auth**.

| Role | How you get it | After login |
|------|----------------|-------------|
| **Customer** | Sign up on the website | Shop, cart, my orders |
| **Seller** | Admin clicks **Make seller** (or SQL below) | **/seller** — products, stock, orders, UTR |
| **Admin** | One-time SQL in Supabase (below) | **/admin** — users; also can open **/seller** |

### Make yourself Admin (first time)

1. Open the live site → **Login** → **Sign up** with your real email + strong password.  
2. Supabase → **SQL Editor** → run (use your email):

```sql
update public.profiles set role = 'admin' where email = 'YOUR_REAL_EMAIL@gmail.com';
```

3. Log out and log in again → you will see **Admin** (and **Seller**) in the menu.  
4. Delete any old `*@demo.com` users in Supabase → **Authentication → Users**.

### Make a Seller

**Option A (in the app):** Login as admin → **Admin** → find the user’s email → **Make seller**.  
**Option B (SQL):**

```sql
update public.profiles set role = 'seller' where email = 'SELLER_EMAIL@gmail.com';
```

Seller then logs in → opens **Seller** to manage the shop.

### What the seller manages day-to-day

- **Dashboard** — today’s / yesterday’s sales, low-stock alerts, morning reset  
- **Products** — add/edit prices, photos, season, stock qty, in/out/archived  
- **Orders** — verify UTR, update status, WhatsApp customer  
- **Customers** — list + WhatsApp / call  

Admin does **not** need a revenue screen — business ops stay on the seller side.

---

## Production checklist (owner)

1. **Supabase keys** in GitHub → Settings → Secrets → Actions  
   - `VITE_SUPABASE_URL`  
   - `VITE_SUPABASE_ANON_KEY` (anon only — never `service_role`)
2. If you ever pasted a **service_role** key in chat, **rotate it** in Supabase → Project Settings → API.
3. Prefer **Confirm email OFF** in Auth until SMTP is set (Auth → Providers → Email), or turn it ON for stricter signups.
4. For **Forgot password**, add redirect URL in Supabase → Authentication → URL Configuration:  
   `https://debajoyti007-max.github.io/greenvest-website/auth/reset`
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

Without Supabase keys, **dev only** can use localStorage (no demo logins). Production builds **require** Supabase.

### First-time Supabase setup
1. Create project at [supabase.com](https://supabase.com)  
2. SQL Editor → run `supabase/schema.sql`  
3. Sign up on the site → set your role with the SQL above  
4. Sync catalog (optional): `node scripts/sync-products.mjs`

---

## Features
- Bangla / English UI  
- Shared products & orders (cloud)  
- UPI QR + manual UTR, min ₹500, delivery 12–24h  
- WhatsApp seller notify on order  
- Seller stock / photo / season / delivery slot / UTR verify  
- Admin make/revoke sellers (no demo reset)
