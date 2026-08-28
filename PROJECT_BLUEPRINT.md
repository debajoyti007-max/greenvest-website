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
| `/seller/products`| Seller, Admin | `src/pages/seller/SellerProducts.tsx`| Daily mandi price updates (Grade A/B/C toggles), MRP override, out-of-stock toggles |
| `/seller/deals`   | Seller, Admin | `src/pages/seller/SellerDeals.tsx`    | Promotional Offers & Banner Manager (Custom headlines, gradients, coupon codes, toggles) |
| `/seller/khata`   | Seller, Admin | `src/pages/seller/SellerKhata.tsx`    | Digital Ledger / Khata Book management, dues tracker, 1-click WhatsApp payment reminders |
| `/rider`          | Rider, Admin  | `src/pages/RiderView.tsx`            | Daily delivery manifest, cash collection balance, mark delivered |
| `/admin`          | Admin         | `src/pages/admin/AdminUsers.tsx`     | Staff role assignments, customer blocklist, system cleaner |

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
5. **Atomic Order Confirmation & Mandi Sourcing (`SellerOrders.tsx`, `SellerHome.tsx`):**
   * 1-Tap Accept Order executes `verifyUtr(id, true)` + `updateOrderStatus(id, 'confirmed')` atomically.
   * Daily Mandi Procurement Sheet aggregates exact net kilograms (`qty * weightMultiplier`) with Grade A/B/C breakdown.
6. **Real-time Staff Profile & Customer Directory Sync (`AuthContext.tsx`, `SellerCustomers.tsx`):**
   * Staff (`admin`/`seller`) subscribes to realtime `public.profiles` changes with 800ms debounce.
   * `SellerCustomers` indexes customers by `id`, `email`, and 10-digit normalized phone, guaranteeing zero orphan orders and real-time visibility of new signups.
7. **Lazy On-Demand Realtime Order Chat (`OrderChat.tsx`, `TrackOrder.tsx`):**
   * WebSocket channel `order-chat-{id}` opens ONLY while chat window is mounted on screen; disconnects immediately on close.
   * Messages persist to Supabase `order_messages` table and local cache.
8. **Persistent Announcements & PWA (`CustomerNotificationBanner.tsx`, `PwaInstallPrompt.tsx`):**
   * Notifications hydrate from Supabase `notifications` table on app mount and show top banner.
   * PWA prompt detects Android/iOS standalone state and triggers native installation.
9. **The 9 Client Custom Specifications:**
   * **Feature 1: Offers & Strikethrough Pricing:** Promotional `DealsBanner` with coupon copy + automatic Market MRP calculation (`~~₹MRP~~ ₹SellingPrice` with `[X% OFF]`).
   * **Feature 2: Dynamic / Tiered Pricing:** Customer tiers (`regular`, `vip` = 5% off, `wholesale` = 12% off) configured by seller.
   * **Feature 3: Customizable Admin Options (A, B, C):** Seller toggles grade visibility per product on demand from `/seller/products`.
   * **Feature 4: Serviceable Pincodes:** Home delivery strictly whitelisted to `721632`, `721633`, `721643`. All other areas directed to Store Pickup (₹0).
   * **Feature 5: Estimated Delivery Window:** 12–24h standard delivery window with dynamic shift ETA notices.
   * **Feature 6: Digital Ledger ("Khata Book"):** Customer credit ledger, dues tracking, balance ledger, 1-click WhatsApp payment reminders with UPI link, and customer passbook in `/profile`.
   * **Feature 7: Location-Based Order Acceptance Workflow:** Seller inspects customer address, GPS Google Maps link, PIN, and distance before clicking "Accept & Confirm" or "Reject / Out of Route" (with reason).
   * **Feature 8: Store Operating Hours:** Morning Shift (7:00 AM – 12:00 PM) & Evening Shift (4:00 PM – 9:00 PM) with live `ShiftBadge`.
   * **Feature 9: Quantity Limits & Bulk Order Notice:** Max 10 kg limit per vegetable; $>10$ kg prompts notice with 1-tap WhatsApp bulk inquiry.

10. **Auto Smart Remove Engine (`deals.ts`, `business.ts`, `SellerOrders.tsx`, `SellerKhata.tsx`):**
    * **Feature 1 (Auto-Expiry for Promotional Deals):** Dynamic deals support smart expiry presets (`today_midnight`, `24h`, `3d`, `7d`, or custom datetime). Expired deals auto-remove from storefront carousel in real time, show live countdown timers, and move to an "Expired / Archived" tab in `/seller/deals` with 1-click renewal.
    * **Feature 4 (Stale Pending Orders Auto-Cancel):** Identifies orders in `pending` unverified status $>2$ hours old. Alerts seller and provides 1-tap `autoCancelStaleOrders(2)` to release produce inventory.
    * **Feature 5 (Zero-Balance Khata Smart Filter):** Auto-filters settled accounts (₹0 dues) out of the active debts dashboard with instant toggle tabs (`🔴 Active Dues Only`, `🟢 Settled (₹0)`, `👥 All`).

---

## 💾 6. Client Storage Contracts (`localStorage`)

| Key | Format | Purpose |
| :--- | :--- | :--- |
| `gv_session_uid` | `string` (UUID / ID) | Active authenticated user session identifier |
| `gv_cart_items` | `JSON Array<CartItem>` | Offline persistent cart items |
| `gv_orders_cache` | `JSON Array<Order>` | Cached user orders (capped at 50 latest) |
| `gv_promotional_deals_v1` | `JSON Array<PromotionalDeal>` | Dynamic seller promotional banners & expiry timestamps |
| `gv_khata_ledger_v1` | `JSON Array<KhataEntry>` | Customer digital ledger transactions & balance history |
| `gv_lang` | `'bn' | 'en'` | Active language selection |
| `gv_last_order_ts`| `timestamp string` | Client-side 30s re-order debounce |

---

## 🧪 7. Verification & Build Commands

Before completing any task or committing changes:
```bash
# 1. Run full test suite (59 tests across 19 suites)
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
* [x] **PWA / Add to Home Screen** support with offline manifest & app icons.
* [x] **Prep / Cut Customizations** for fresh fish and vegetables.
* [x] **Thermal POS Bill Printing** (58mm/80mm format for delivery staff).
* [x] **Auto Smart Remove System** for Deals, Stale Orders, and Settled Khata accounts.

---
*Last Updated: 2026-08-29 by Antigravity Agent*
