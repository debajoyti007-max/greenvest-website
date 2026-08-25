-- ============================================================================
-- GREENVEST MASTER UNIVERSAL DATABASE FIX
-- Run this ONCE in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id text PRIMARY KEY,
  email text,
  name text DEFAULT '',
  phone text DEFAULT '',
  role text DEFAULT 'customer',
  pin text,
  is_blocked boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_all_access" ON public.profiles;
CREATE POLICY "profiles_all_access" ON public.profiles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. PRODUCTS TABLE & RPC
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
  season text NOT NULL DEFAULT 'all',
  category text NOT NULL DEFAULT 'Vegetables',
  unit text NOT NULL DEFAULT 'kg',
  image_url text,
  sold_as text DEFAULT 'loose',
  gram_options jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_qty numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS season text DEFAULT 'all';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sold_as text DEFAULT 'loose';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gram_options jsonb;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_all_access" ON public.products;
CREATE POLICY "products_all_access" ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.save_product_admin(
  p_id text,
  p_name text,
  p_bn_name text DEFAULT '',
  p_p_a numeric DEFAULT 0,
  p_p_b numeric DEFAULT 0,
  p_p_c numeric DEFAULT 0,
  p_in_stock boolean DEFAULT true,
  p_category text DEFAULT 'Vegetables',
  p_unit text DEFAULT 'kg',
  p_image_url text DEFAULT NULL,
  p_emoji text DEFAULT '🥬',
  p_archived boolean DEFAULT false
) RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  INSERT INTO public.products (
    id, name, bn_name, p_a, p_b, p_c, in_stock, category, unit, image_url, emoji, archived
  )
  VALUES (
    p_id, p_name, p_bn_name, p_p_a, p_p_b, p_p_c, p_in_stock, p_category, p_unit, p_image_url, p_emoji, p_archived
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    bn_name = EXCLUDED.bn_name,
    p_a = EXCLUDED.p_a,
    p_b = EXCLUDED.p_b,
    p_c = EXCLUDED.p_c,
    in_stock = EXCLUDED.in_stock,
    category = EXCLUDED.category,
    unit = EXCLUDED.unit,
    image_url = COALESCE(EXCLUDED.image_url, public.products.image_url),
    emoji = COALESCE(EXCLUDED.emoji, public.products.emoji),
    archived = EXCLUDED.archived
  RETURNING to_jsonb(public.products.*) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.save_product_admin TO anon, authenticated, service_role;

-- 3. COUPONS TABLE & RPC
CREATE TABLE IF NOT EXISTS public.coupons (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'flat',
  discount_value numeric NOT NULL DEFAULT 0,
  min_order numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  valid boolean DEFAULT true,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS valid boolean DEFAULT true;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS valid_until timestamptz;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coupons_all_access" ON public.coupons;
CREATE POLICY "coupons_all_access" ON public.coupons FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.save_coupon_admin(
  p_code text,
  p_discount_type text,
  p_discount_value numeric,
  p_min_order numeric DEFAULT 0,
  p_valid boolean DEFAULT true,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
  v_clean_code text := upper(trim(p_code));
BEGIN
  INSERT INTO public.coupons (
    code, discount_type, discount_value, min_order, active, valid, valid_until, expires_at
  )
  VALUES (
    v_clean_code, p_discount_type, p_discount_value, p_min_order, p_valid, p_valid, p_expires_at, p_expires_at
  )
  ON CONFLICT (code) DO UPDATE SET
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    min_order = EXCLUDED.min_order,
    active = EXCLUDED.active,
    valid = EXCLUDED.valid,
    valid_until = EXCLUDED.valid_until,
    expires_at = EXCLUDED.expires_at
  RETURNING to_jsonb(public.coupons.*) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.save_coupon_admin TO anon, authenticated, service_role;

-- 4. ORDERS & ORDER ITEMS & ADDRESSES
CREATE TABLE IF NOT EXISTS public.orders (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  user_name text NOT NULL,
  user_email text NOT NULL,
  subtotal numeric NOT NULL,
  delivery_fee numeric NOT NULL DEFAULT 0,
  advance_amount numeric NOT NULL DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'upi',
  utr text,
  utr_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_slot text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders_all_access" ON public.orders;
CREATE POLICY "orders_all_access" ON public.orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.order_items (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '🥬',
  grade text NOT NULL DEFAULT 'B',
  qty numeric NOT NULL,
  unit_price numeric NOT NULL,
  weight_multiplier numeric DEFAULT 1,
  weight_label text
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_items_all_access" ON public.order_items;
CREATE POLICY "order_items_all_access" ON public.order_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.addresses (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  label text NOT NULL DEFAULT 'Home',
  address_line text NOT NULL,
  city text NOT NULL DEFAULT 'Kolkata',
  pin_code text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "addresses_all_access" ON public.addresses;
CREATE POLICY "addresses_all_access" ON public.addresses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. REALTIME REPLICATION (ALL TABLES)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'products') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'orders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'order_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'coupons') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.coupons;
  END IF;
END $$;
