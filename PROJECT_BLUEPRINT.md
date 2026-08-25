# 🥬 GreenVest (greenvest.shop) - Master Project Blueprint & Architecture

> **Notice to AI Agents & Developers:**  
> This file is the **Single Source of Truth (SSOT)** for GreenVest. Whenever you are asked to scan, audit, or make changes to this repository:
> 1. Read this blueprint first to understand the architecture, database contracts, business rules, and state flows.
> 2. Whenever you implement a new feature, fix a bug, or alter database schemas, **ALWAYS update this blueprint** to reflect the latest state.

---

## 📌 1. Project Overview & Business Domain
* **Website URL:** [https://greenvest.shop](https://greenvest.shop/)
* **Repository Path:** `c:\Users\Debajoyti\Documents\greenvest-website`
* **Business Model:** Hyperlocal Mandi-Fresh Daily Produce, Raw Farm Vegetables & Fish Delivery.
* **Central Delivery Hub:** Sutahata / Byabattarhat / Mirpur, Purba Medinipur, West Bengal (PIN: **`721648`**).
* **Physical Outlet:** GreenVest Store (গ্রীনভেস্ট স্টোর), Sutahata Main Road (Hours: 7:00 AM – 9:00 PM).
* **Key Contacts:** Support Phone `+91 99328 71027`, WhatsApp `919932871027`, UPI ID `8170859653-2@ybl`.

---

## 🛠️ 2. Tech Stack & Environment
* **Frontend:** React 19, TypeScript, Vite, React Router v7
* **Styling:** Custom CSS design system with CSS tokens (`src/index.css`)
* **Backend / Database:** Supabase (PostgreSQL + PostgREST + RPC Transactions + Row Level Security)
* **Testing:** Node.js native test runner (`tests/app.test.mjs`, 37 unit & integration tests)
* **Deployment:** Global CDN (Vercel / Cloudflare DNS)

---

## 🗺️ 3. Application Routes & Role-Based Access Control

| Route | Access | Component | Purpose |
| :--- | :--- | :--- | :--- |
| `/` | Public | `src/pages/Shop.tsx` | Product catalog, mandi rates ticker, Banglish search, grade/weight selectors |
| `/cart` | Public | `src/pages/Cart.tsx` | Cart items, weight multipliers, distance delivery preview |
| `/checkout` | Public | `src/pages/Checkout.tsx` | Address form, PIN distance fee calculation, UPI QR, 12-digit UTR submission |
| `/track` | Public | `src/pages/TrackOrder.tsx` | Order search by ID/Phone, live timeline status, 30-min UTR typo edit |
| `/orders` | Customer+ | `src/pages/Orders.tsx` | Customer's historical orders list and status |
| `/profile` | Customer+ | `src/pages/Profile.tsx` | Name/Phone edit, saved addresses, 4-digit PIN management |
| `/auth` | Public | `src/pages/Auth.tsx` | 10-digit Phone / Email + 4-digit PIN login, signup, forgot PIN |
| `/seller` | Seller, Admin | `src/pages/seller/SellerHome.tsx` | Daily mandi procurement sheet, revenue metrics, inventory |
| `/seller/orders` | Seller, Admin | `src/pages/seller/SellerOrders.tsx` | Order verification, UTR confirmation, pack & dispatch |
| `/seller/products`| Seller, Admin | `src/pages/seller/SellerProducts.tsx`| Daily mandi price updates (Grade A/B/C), out-of-stock toggles |
| `/rider` | Rider, Admin | `src/pages/RiderView.tsx` | Daily delivery manifest, cash collection balance, mark delivered |
| `/admin` | Admin | `src/pages/admin/AdminUsers.tsx` | Staff role assignments, customer blocklist, system cleaner |

---

## 🗄️ 4. Supabase Database Schema Contracts

### Tables:
1. **`public.profiles`**: User accounts & staff roles
   * Columns: `id` (text PK), `email` (text), `name` (text), `phone` (text), `role` (`customer`/`rider`/`seller`/`admin`), `pin` (text), `isBlocked` / `is_blocked` (boolean), `created_at`, `updated_at`.
2. **`public.products`**: Catalog produce items
   * Columns: `id` (text PK), `name` (text), `bn_name` (text), `category` (text), `unit` (text), `p_a` (numeric), `p_b` (numeric), `p_c` (numeric), `stock_qty` (numeric), `in_stock` (boolean), `image` (text).
3. **`public.orders`**: Customer orders
   * Columns: `id` (text PK), `user_id` (text), `user_name` (text), `user_email` (text), `phone` (text), `address` (text), `pin` (text), `delivery_slot` (text), `subtotal` (numeric), `delivery_fee` (numeric), `discount` (numeric), `total` (numeric), `advance_amount` (numeric), `payment_type` (`advance`/`full`), `utr` (text), `utr_verified` (boolean), `status` (`pending`/`confirmed`/`out_for_delivery`/`delivered`/`cancelled`), `assigned_rider_id` (text), `created_at`, `updated_at`.
4. **`public.order_items`**: Line items per order
   * Columns: `id` (bigserial PK), `order_id` (text FK), `product_id` (text), `name` (text), `emoji` (text), `grade` (text), `qty` (numeric), `unit_price` (numeric), `weight_multiplier` (numeric), `weight_label` (text).
5. **`public.coupons`**: Discount promotions
   * Columns: `id` (text PK), `code` (text UNIQUE), `discount_percent` (numeric), `flat_discount` (numeric), `min_order` (numeric), `is_active` (boolean).
6. **`public.addresses`**: Saved customer addresses
   * Columns: `id` (bigserial PK), `user_id` (text), `label` (text), `address` (text), `phone` (text), `pin` (text), `is_default` (boolean).

### Database Functions & Triggers:
* **`create_order_atomic` (RPC)**: Atomic PostgreSQL transaction calculating order totals server-side, verifying non-duplicate UTRs, inserting line items, and auto-populating missing profile phone numbers.
* **`trg_check_order_rate_limit` (Trigger)**: Anti-spam trigger blocking any single phone number from creating $>5$ orders in 10 minutes.
* **Row Level Security (RLS)**: Enabled on all tables. Products are publicly readable; staff only can edit products.

---

## 🧮 5. Key Business Rules & Calculation Algorithms

1. **Distance-Based Delivery Fee (`src/lib/delivery.ts`):**
   * Central Store Location: Lat `22.1818`, Lng `88.0827` (PIN `721648`).
   * Store Pickup: **₹0 Free**.
   * Under 5 km: **₹30**.
   * 5 km to 15 km: **₹50**.
   * Beyond 15 km: Flagged out of range (requires custom WhatsApp confirmation).
   * PIN Code Fallbacks: `721648` $ightarrow$ ₹30, `721665` $ightarrow$ ₹30, `721632` $ightarrow$ ₹50.
2. **Advance Payment Calculation (`src/lib/business.ts`):**
   * Minimum Order: **₹500**.
   * Advance Payment: **50% of Grand Total** (rounded up to nearest integer via `Math.ceil(total * 0.5)`).
   * Remaining 50% Balance collected upon delivery by Rider via Cash or Spot UPI.
3. **Weight Multipliers & Multi-Grade Pricing:**
   * Multipliers: `0.25` (250g), `0.5` (500g), `1.0` (1 kg), `2.0` (2 kg).
   * Grade Pricing: Grade A (`p_a`), Grade B (`p_b` standard), Grade C (`p_c` budget).
   * Line Item Price: `Math.round(baseGradePrice * weightMultiplier) * qty`.
4. **UTR Anti-Fraud Verification (`src/lib/validation.ts`):**
   * Strict 12-digit alphanumeric uppercase trimming.
   * Duplicate UTR gating against active non-cancelled database records.
   * 30-minute guest typo editing window in `TrackOrder.tsx`.

---

## 💾 6. Client Storage Contracts (`localStorage`)

| Key | Format | Purpose |
| :--- | :--- | :--- |
| `gv_session_uid` | `string` (UUID / ID) | Active authenticated user session identifier |
| `gv_cart_items` | `JSON Array<CartItem>` | Offline persistent cart items |
| `gv_orders_cache` | `JSON Array<Order>` | Cached user orders (capped at 50 latest) |
| `gv_lang` | `'bn' | 'en'` | Active language selection |
| `gv_last_order_ts`| `timestamp string` | Client-side 30s re-order debounce |

---

## 🧪 7. Verification & Build Commands

Before completing any task or committing changes:
```bash
# 1. Run full test suite (37 tests across 13 suites)
npm test

# 2. Run TypeScript check and Vite production build
npm run build

# 3. Commit and deploy
git add .
git commit -m "your descriptive commit message"
git push origin master
```

---

## 🚀 8. Active Roadmap & Future Improvements
* [ ] **PWA / Add to Home Screen** support with offline manifest & app icons.
* [ ] **Prep / Cut Customizations** for fresh fish and vegetables (e.g. Curry Cut, Stem Removed).
* [ ] **Thermal POS Bill Printing** (58mm/80mm format for delivery staff).
* [ ] **Web Push / SMS Notifications** on order status changes.

---
*Last Updated: 2026-08-25 by Antigravity Agent*
