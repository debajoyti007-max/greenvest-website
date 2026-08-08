# GreenVest – Fresh groceries (cloud)

Customer shop + seller tools + admin users.  
**Manual UPI / UTR** · **Min order ₹500** · **Delivery 12–24 hours**  
Shared data via **Supabase**. Premium shop UI with real vegetable photos.

---

## What YOU do next (beginner checklist)

Do these in order. Stop if something fails and ask for help.

### Step 1 — Open the project on your PC
```bash
cd C:\Users\Debajoyti\Documents\greenvest-website
npm install
```

### Step 2 — Create a free Supabase account
1. Open [https://supabase.com](https://supabase.com) and sign up  
2. Click **New project** → wait ~2 minutes  

### Step 3 — Copy keys into `.env`
1. In Supabase: **Project Settings → API**  
2. On your PC: copy `.env.example` to `.env`  
3. Paste:
   - Project URL → `VITE_SUPABASE_URL=...`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY=...`

### Step 4 — Create database tables
1. Supabase → **SQL Editor** → New query  
2. Open file `supabase/schema.sql` in your project  
3. Copy **all** of it → paste → click **Run**

### Step 5 — Create 3 login users
Supabase → **Authentication → Users → Add user** (password `demo123` for each):

- `customer@demo.com`
- `seller@demo.com`
- `admin@demo.com`

Then run this SQL once:

```sql
update public.profiles set role = 'seller', name = 'Demo Seller' where email = 'seller@demo.com';
update public.profiles set role = 'admin', name = 'Demo Admin' where email = 'admin@demo.com';
update public.profiles set name = 'Demo Customer' where email = 'customer@demo.com';
```

Also turn **OFF** email confirm: **Authentication → Providers → Email → Confirm email**.

### Step 6 — Start the website
```bash
npm run dev
```
Open http://localhost:3000 → Login → try Customer / Seller.

### Step 7 — (Later) Put online
Netlify or Vercel: upload after `npm run build`, and add the same two env keys there.

---

## Features
- Real vegetable photos + full-bleed hero  
- Shared products & orders (customer phone ↔ seller phone)  
- UPI QR + manual UTR, min ₹500, delivery 12–24h  
- Seller stock / UTR verify / sourcing sheet  
- Admin make/revoke sellers  
