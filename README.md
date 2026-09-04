# 🥬 GreenVest – Fresh Farm Produce & Fish (Production)

Hyperlocal Mandi-Fresh Daily Vegetables & Fish E-Commerce Platform.  
**10% Advance UPI** · **Min order ₹500** · **Delivery 12–24 hours** · **Digital Khata Ledger**  
Live database via **Supabase**. Hosted on **GitHub Pages** with custom domain.

**Live URL:** [https://greenvest.shop](https://greenvest.shop/)

---

## 👥 How to Log In & Roles

Users authenticate with a **10-digit Mobile Number** or **Email** + **4-digit PIN** at **/auth**.

| Role | Access | Purpose |
| :--- | :--- | :--- |
| **Customer** | Sign up on website | Browse catalog, weekly staples basket, live order tracking, Khata passbook |
| **Rider** | Assigned by Admin | **/rider** — Delivery manifest, route optimizer, 4-digit OTP handover, UPI balance collection |
| **Seller** | Assigned by Admin | **/seller** — Mandi procurement, inventory, Grade A/B/C pricing, UTR verification, deals |
| **Admin** | Supabase SQL / Master | **/admin** — User roles, customer blocklist, shadow cloaking, system telemetry cleaner |

### Make Yourself Admin (First Time)
1. Open [https://greenvest.shop/auth](https://greenvest.shop/auth) and sign up with your email or phone + 4-digit PIN.
2. In Supabase → **SQL Editor**, run:

```sql
update public.profiles set role = 'admin' where email = 'YOUR_EMAIL@gmail.com';
```

3. Log out and log back in → **Admin** and **Seller** tools will appear in the navigation bar.

---

## 🛠️ Production Operations

### Core Workflows:
- **Seller Procurement**: Daily mandi sheet aggregates exact net kg with Grade A/B/C breakdown.
- **Order Confirmation**: 1-tap accept with double-tap lock and in-flight idempotency guards.
- **Rider Handover**: Customer provides their unique 4-digit delivery handover OTP upon receiving produce.
- **Promotional Deals & Announcements**: Realtime WebSocket broadcast over `gv-broadcasts` with 1-tap `[ 🎟️ CODE ]` claim and customer `[ ✕ Ignore ]` permanent dismissal.
- **Khata Credit Ledger**: 1-tap in-app statement reminders and debt settlements.

---

## 🚀 Local Development & Testing

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Start development server
npm run dev

# 4. Run test suite (99 tests across 31 suites)
npm test

# 5. Build and sync for production (/docs + root)
npm run build
```

---

## 🗄️ Database Setup & Migrations
All database tables, cascade deletes, RLS policies, and triggers are consolidated in:
`supabase/SECURITY_PROTECTIONS_AND_10PERCENT_ADVANCE.sql`

Run this script once in your Supabase SQL Editor to set up the complete schema.

