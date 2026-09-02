-- ============================================================================
-- GREENVEST — MASTER ALL-IN-ONE UNIVERSAL DATABASE FIX
-- Copy and run this ENTIRE script in:
-- Supabase Dashboard -> SQL Editor -> New Query -> Run (▶️)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES TABLE & CONSTRAINTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id text PRIMARY KEY,
  email text,
  name text DEFAULT '',
  phone text DEFAULT '',
  role text DEFAULT 'customer',
  pin text,
  is_blocked boolean DEFAULT false,
  tier text DEFAULT 'Retail',
  khata_approved boolean DEFAULT false,
  khata_credit_limit numeric DEFAULT 2000,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'customer';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tier text DEFAULT 'Retail';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS khata_approved boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS khata_credit_limit numeric DEFAULT 2000;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Drop legacy role constraint and recreate with all 4 roles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('customer', 'seller', 'admin', 'rider'));

-- Drop any legacy trigger on profiles that blocked role updates
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE event_object_table = 'profiles' 
        AND trigger_schema = 'public'
    ) LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON public.profiles CASCADE;';
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. PRODUCTS TABLE & COLUMNS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  emoji text NOT NULL DEFAULT '🥬',
  name text NOT NULL,
  bn_name text NOT NULL DEFAULT '',
  p_a numeric NOT NULL DEFAULT 0,
  p_b numeric NOT NULL DEFAULT 0,
  p_c numeric NOT NULL DEFAULT 0,
  mrp numeric,
  available_grades text[] DEFAULT ARRAY['A', 'B', 'C'],
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

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mrp numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS available_grades text[] DEFAULT ARRAY['A', 'B', 'C'];
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sold_as text DEFAULT 'loose';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gram_options jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_qty numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;

-- ----------------------------------------------------------------------------
-- 3. ORDERS TABLE & CONSTRAINTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  user_name text NOT NULL,
  user_email text NOT NULL,
  subtotal numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  advance_amount numeric NOT NULL DEFAULT 0,
  payment_type text NOT NULL DEFAULT 'advance',
  payment_mode text NOT NULL DEFAULT 'online',
  payer_upi_name text,
  delivery_date text,
  utr text,
  utr_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  pin text NOT NULL DEFAULT '',
  delivery_slot text,
  rejection_reason text,
  assigned_rider_id text,
  geo_lat numeric,
  geo_lng numeric,
  is_khata_order boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_date text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payer_upi_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'advance';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT 'online';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_rider_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS geo_lat numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS geo_lng numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_khata_order boolean DEFAULT false;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('pending', 'advance_paid', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'));

DROP TRIGGER IF EXISTS validate_order_total_trigger ON public.orders;
DROP FUNCTION IF EXISTS public.validate_order_total();

-- ----------------------------------------------------------------------------
-- 4. ORDER ITEMS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '🥬',
  grade text NOT NULL DEFAULT 'B',
  qty numeric NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  weight_multiplier numeric DEFAULT 1,
  weight_label text DEFAULT '1 kg',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS weight_multiplier numeric DEFAULT 1;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS weight_label text DEFAULT '1 kg';

-- ----------------------------------------------------------------------------
-- 5. ADDRESSES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.addresses (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  label text,
  address text NOT NULL,
  phone text NOT NULL,
  pin text,
  landmark text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6. COUPONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'flat' CHECK (discount_type IN ('flat', 'percent')),
  discount_value numeric NOT NULL DEFAULT 0,
  min_order numeric NOT NULL DEFAULT 0,
  max_uses int,
  used_count int NOT NULL DEFAULT 0,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  valid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. NOTIFICATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  sender text DEFAULT 'GreenVest',
  created_at timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 8. ORDER MESSAGES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_messages (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  user_name text NOT NULL,
  sender_role text NOT NULL DEFAULT 'customer',
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 9. PRODUCT REVIEWS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id bigserial PRIMARY KEY,
  product_id text NOT NULL,
  user_id text NOT NULL,
  user_name text NOT NULL,
  rating int NOT NULL DEFAULT 5,
  comment text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 10. KHATA LEDGER TABLE (Digital Passbook & Credit History)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.khata_ledger (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('debit', 'payment_credit', 'adjustment_credit', 'adjustment_debit')),
  amount numeric NOT NULL,
  notes text,
  order_id text,
  payment_method text DEFAULT 'upi',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS khata_ledger_user_id_idx ON public.khata_ledger (user_id);
CREATE INDEX IF NOT EXISTS khata_ledger_created_at_idx ON public.khata_ledger (created_at DESC);

-- ----------------------------------------------------------------------------
-- 11. PROMOTIONAL DEALS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotional_deals (
  id text PRIMARY KEY,
  badge_bn text NOT NULL DEFAULT '',
  badge_en text NOT NULL DEFAULT '',
  title_bn text NOT NULL DEFAULT '',
  title_en text NOT NULL DEFAULT '',
  subtitle_bn text,
  subtitle_en text,
  coupon_code text,
  link_url text,
  button_text_bn text,
  button_text_en text,
  bg_gradient text,
  emoji text,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  auto_remove_on_expiry boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 12. SUPPORT MESSAGES TABLE (Live In-App Support Chat)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_messages (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  user_name text NOT NULL DEFAULT 'Customer',
  user_phone text,
  sender_role text NOT NULL DEFAULT 'customer',
  message text NOT NULL,
  order_id text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_user_id_idx ON public.support_messages (user_id);
CREATE INDEX IF NOT EXISTS support_messages_created_at_idx ON public.support_messages (created_at DESC);

-- ----------------------------------------------------------------------------
-- 13. UNIVERSAL ROW LEVEL SECURITY (RLS) POLICIES
-- Enables RLS and grants clean read/write access to avoid silent front-end blocks
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.khata_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotional_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'profiles', 'products', 'orders', 'order_items', 'addresses',
      'coupons', 'notifications', 'order_messages', 'product_reviews',
      'khata_ledger', 'promotional_deals', 'support_messages'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_all_access" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_all_access" ON public.%I FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 14. BULLETPROOF RPC FUNCTIONS (SECURITY DEFINER)
-- ----------------------------------------------------------------------------

-- Role Update RPC (Pure PL/pgSQL, guaranteed syntax compliance)
CREATE OR REPLACE FUNCTION public.update_user_role_admin(
  p_user_id text,
  p_role text
) RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_clean_phone text;
BEGIN
  IF p_role NOT IN ('customer', 'seller', 'admin', 'rider') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);

  UPDATE public.profiles
  SET role = p_role, updated_at = now()
  WHERE id = p_user_id
     OR lower(email) = lower(p_user_id)
     OR phone = p_user_id
     OR (length(v_clean_phone) >= 10 AND phone = v_clean_phone)
     OR (length(v_clean_phone) >= 10 AND email = (v_clean_phone || '@greenvest.shop'))
     OR email = (p_user_id || '@greenvest.shop')
  RETURNING to_jsonb(public.profiles.*) INTO v_result;

  IF v_result IS NULL THEN
    INSERT INTO public.profiles (
      id, email, name, phone, role, created_at, updated_at
    )
    VALUES (
      p_user_id,
      CASE 
        WHEN p_user_id LIKE '%@%' THEN lower(p_user_id) 
        WHEN length(v_clean_phone) >= 10 THEN v_clean_phone || '@greenvest.shop'
        ELSE p_user_id || '@greenvest.shop' 
      END,
      CASE 
        WHEN length(v_clean_phone) >= 10 THEN 'User ' || v_clean_phone
        ELSE 'User ' || left(p_user_id, 8)
      END,
      CASE WHEN length(v_clean_phone) >= 10 THEN v_clean_phone ELSE '' END,
      p_role,
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE 
      SET role = p_role, updated_at = now()
    RETURNING to_jsonb(public.profiles.*) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_role_admin(text, text) TO anon, authenticated, service_role;

-- Save Product RPC
CREATE OR REPLACE FUNCTION public.save_product_admin(
  p_id text,
  p_name text,
  p_bn_name text,
  p_p_a numeric,
  p_p_b numeric,
  p_p_c numeric,
  p_in_stock boolean,
  p_category text,
  p_unit text,
  p_image_url text,
  p_emoji text,
  p_archived boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  INSERT INTO public.products (
    id, name, bn_name, p_a, p_b, p_c, in_stock, category, unit, image_url, emoji, archived
  ) VALUES (
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
    image_url = EXCLUDED.image_url,
    emoji = EXCLUDED.emoji,
    archived = EXCLUDED.archived
  RETURNING to_jsonb(public.products.*) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_product_admin TO anon, authenticated, service_role;

-- Save Coupon RPC
CREATE OR REPLACE FUNCTION public.save_coupon_admin(
  p_code text,
  p_discount_type text,
  p_discount_value numeric,
  p_min_order numeric,
  p_valid boolean,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.coupons (
    code, discount_type, discount_value, min_order, active, valid, expires_at, valid_until
  ) VALUES (
    UPPER(TRIM(p_code)), p_discount_type, p_discount_value, p_min_order, p_valid, p_valid, p_expires_at, p_expires_at
  )
  ON CONFLICT (code) DO UPDATE SET
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    min_order = EXCLUDED.min_order,
    active = EXCLUDED.active,
    valid = EXCLUDED.valid,
    expires_at = EXCLUDED.expires_at,
    valid_until = EXCLUDED.valid_until;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_coupon_admin TO anon, authenticated, service_role;

-- Validate Coupon RPC
CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code text,
  p_order_total numeric
)
RETURNS TABLE (
  valid boolean,
  discount numeric,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coupon record;
  v_discount numeric;
BEGIN
  SELECT * INTO v_coupon FROM public.coupons
  WHERE code = UPPER(TRIM(p_code))
    AND active = true
    AND valid = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (valid_until IS NULL OR valid_until > now());

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::numeric, 'Invalid or expired coupon code'::text;
    RETURN;
  END IF;

  IF p_order_total < v_coupon.min_order THEN
    RETURN QUERY SELECT false, 0::numeric, ('Order must be at least ₹' || v_coupon.min_order)::text;
    RETURN;
  END IF;

  IF v_coupon.discount_type = 'percent' THEN
    v_discount := ROUND((p_order_total * v_coupon.discount_value) / 100);
  ELSE
    v_discount := v_coupon.discount_value;
  END IF;

  RETURN QUERY SELECT true, v_discount, ('Coupon applied: ₹' || v_discount || ' discount')::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_coupon TO anon, authenticated, service_role;
