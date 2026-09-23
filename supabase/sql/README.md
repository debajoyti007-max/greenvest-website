# MS Vegetable Center — Database Architecture by Role

This directory organizes all Supabase PostgreSQL database schemas, Row-Level Security (RLS) policies, triggers, and Remote Procedure Calls (RPCs) **cleanly separated by user role**.

When debugging or implementing features in the future, navigate directly to the relevant role folder below.

---

## 📁 Directory Structure & Troubleshooting Guide

### 1. 🛒 Customer Role (`supabase/sql/customer/`)
Use these files if a customer encounters issues with checkout, accounts, tracking, or chat:
- **`01_customer_tables_rls.sql`**:
  - Row Level Security policies for `orders`, `order_items`, `addresses`, `product_reviews`, `support_messages`, and `notifications`.
- **`02_customer_rpcs.sql`**:
  - `login_with_pin`: PIN verification and safe profile response.
  - `register_customer_atomic`: Atomic registration with duplicate phone guards.
  - `create_order_atomic`: 1-Tap checkout, 10% advance calculation, items insert.
  - `validate_coupon`: Promo code validation.
  - `reset_pin_with_verification`: Customer PIN recovery.
  - `check_account_exists`: Phone/email lookup.

---

### 2. 🛵 Rider Role (`supabase/sql/rider/`)
Use these files if a delivery executive reports issue viewing assigned orders or completing deliveries:
- **`01_rider_order_access.sql`**:
  - View `rider_active_deliveries` and filtered queries for orders in `confirmed` or `out_for_delivery` states.
  - `delivery_otp` column configuration.
- **`02_rider_otp_handover.sql`**:
  - `verify_delivery_handover`: Server-side atomic OTP verification with deterministic fallback computation and status update to `delivered`.

---

### 3. 🏪 Seller Role (`supabase/sql/seller/`)
Use these files if a store manager or seller reports issues with inventory or order processing:
- **`01_seller_products_deals.sql`**:
  - `products` and `promotional_deals` RLS policies (INSERT, UPDATE, DELETE).
  - `save_product_admin`: Atomic vegetable price, stock, grade, and dynamic MRP updater.
- **`02_seller_orders.sql`**:
  - `update_order_status_admin`: Order status transitions (pending ➔ confirmed ➔ delivered).
  - `get_staff_orders`: Live seller order dashboard stream.
  - `delete_order_admin`: Cancelled order cleanup.

---

### 4. 🛡️ Admin & Super Admin Role (`supabase/sql/admin/`)
Use these files for staff permissions, discount vouchers, or account security:
- **`01_admin_user_roles.sql`**:
  - `update_user_role_admin`: Promote or demote users between customer, rider, seller, admin.
  - `update_user_block_admin`: Suspend abusive accounts.
  - `delete_user_admin`: Safe account deletion guarded against active orders and Super Admin shield.
  - `get_staff_customers`: PIN-stripped customer directory.
- **`02_admin_coupons.sql`**:
  - `coupons` table RLS and `save_coupon_admin` RPC.
- **`03_shadow_admin_guards.sql`**:
  - `protect_super_admin_trigger`: Prevents tampering with master admin status.
  - `trg_prevent_profile_escalation`: Prevents non-admins from self-promoting or unblocking.

---

### 5. ⚙️ Core Database Infrastructure (`supabase/sql/core/`)
- **`00_base_schema.sql`**: Baseline table structures, primary keys, and relations.
- **`01_indexes_and_perf.sql`**: High-performance composite B-tree indexes.

---

## ⚡ 1-Click Permissions Reset: `MASTER_ROLE_SYNC.sql`
If you ever migrate to a new Supabase project or need to ensure all permissions and policies are 100% active at once:
1. Open your **Supabase Project Dashboard**.
2. Navigate to **SQL Editor** ➔ **New Query**.
3. Copy and paste the contents of **`supabase/sql/MASTER_ROLE_SYNC.sql`**.
4. Click **Run**.
