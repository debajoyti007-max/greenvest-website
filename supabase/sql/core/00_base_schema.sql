-- ============================================================
-- MODULE: CORE DATABASE SCHEMA
-- File: supabase/sql/core/00_base_schema.sql
-- ============================================================
-- Description:
-- Baseline schema definition for MS Vegetable Center (greenvest.shop).
-- Defines core tables, columns, constraints, and defaults.
-- Uses text primary keys for seamless custom PIN auth and outbox sync.
-- ============================================================

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'seller', 'admin', 'rider')),
  phone text,
  pin text,
  is_super_admin boolean NOT NULL DEFAULT false,
  is_blocked boolean NOT NULL DEFAULT false,
  tier text NOT NULL DEFAULT 'regular' CHECK (tier IN ('regular', 'vip', 'wholesale')),
  khata_approved boolean NOT NULL DEFAULT false,
  khata_credit_limit numeric NOT NULL DEFAULT 2000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  emoji text NOT NULL DEFAULT '🥬',
  name text NOT NULL,
  bn_name text NOT NULL DEFAULT '',
  p_a numeric NOT NULL DEFAULT 0,
  p_b numeric NOT NULL DEFAULT 0,
  p_c numeric NOT NULL DEFAULT 0,
  in_stock boolean NOT NULL DEFAULT true,
  archived boolean NOT NULL DEFAULT false,
  stock_qty numeric,
  mrp numeric,
  available_grades text[] DEFAULT ARRAY['A', 'B', 'C'],
  sold_as text DEFAULT 'loose',
  gram_options integer[],
  season text NOT NULL DEFAULT 'all',
  category text NOT NULL DEFAULT 'Vegetables',
  unit text NOT NULL DEFAULT 'kg',
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  user_name text NOT NULL,
  user_email text NOT NULL,
  subtotal numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL,
  advance_amount numeric NOT NULL DEFAULT 0,
  payment_type text NOT NULL DEFAULT 'advance',
  utr text,
  utr_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'advance_paid', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled')),
  address text NOT NULL,
  phone text NOT NULL,
  pin text NOT NULL DEFAULT '',
  delivery_slot text,
  delivery_date text NOT NULL DEFAULT 'standard',
  delivery_otp text,
  is_khata_order boolean NOT NULL DEFAULT false,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.order_items (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  product_id text NOT NULL,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '🥬',
  grade text NOT NULL DEFAULT 'B',
  qty numeric NOT NULL,
  unit_price numeric NOT NULL,
  weight_multiplier numeric NOT NULL DEFAULT 1,
  weight_label text NOT NULL DEFAULT '1 kg'
);

-- 5. ADDRESSES TABLE
CREATE TABLE IF NOT EXISTS public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  label text NOT NULL DEFAULT 'Home',
  full_address text NOT NULL,
  pin text NOT NULL,
  phone text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. KHATA LEDGER TABLE
CREATE TABLE IF NOT EXISTS public.khata_ledger (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('debit', 'credit', 'payment_credit')),
  amount numeric NOT NULL,
  description text NOT NULL,
  order_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. COUPONS TABLE
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'flat')),
  discount_value numeric NOT NULL,
  min_order numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  valid boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. PROMOTIONAL DEALS TABLE
CREATE TABLE IF NOT EXISTS public.promotional_deals (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  discount_percent numeric NOT NULL DEFAULT 0,
  banner_url text,
  badge_text text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. PRODUCT REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id bigserial PRIMARY KEY,
  product_id text NOT NULL,
  user_id text NOT NULL,
  user_name text NOT NULL,
  rating numeric NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. LIVE SUPPORT & ORDER CHAT
CREATE TABLE IF NOT EXISTS public.support_messages (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  user_name text NOT NULL,
  message text NOT NULL,
  sender text NOT NULL CHECK (sender IN ('customer', 'seller', 'admin', 'system')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_messages (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  user_id text NOT NULL,
  user_name text NOT NULL,
  message text NOT NULL,
  sender text NOT NULL CHECK (sender IN ('customer', 'seller', 'admin', 'rider')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
