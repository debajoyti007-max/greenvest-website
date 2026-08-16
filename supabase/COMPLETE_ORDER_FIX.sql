-- ================================================================
-- GREENVEST — COMPLETE DATABASE & ORDER FIX (MASTER SCRIPT V2)
-- Copy and run this entire script in Supabase Dashboard -> SQL Editor -> Run
-- ================================================================

-- 1. DROP BROKEN TRIGGERS THAT BLOCK ORDER INSERTS
DROP TRIGGER IF EXISTS validate_order_total_trigger ON public.orders;
DROP FUNCTION IF EXISTS public.validate_order_total();

-- 2. ENSURE ALL TABLES EXIST WITH BASE SCHEMA
CREATE TABLE IF NOT EXISTS public.profiles (
  id text PRIMARY KEY,
  email text,
  name text,
  role text NOT NULL DEFAULT 'customer',
  phone text,
  "isBlocked" boolean NOT NULL DEFAULT false,
  is_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.addresses (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  label text,
  address text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.orders (
  id text PRIMARY KEY,
  user_id text,
  user_name text,
  user_email text,
  subtotal numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  advance_amount numeric NOT NULL DEFAULT 0,
  payment_type text NOT NULL DEFAULT 'advance',
  utr text,
  utr_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  address text,
  phone text,
  pin text,
  delivery_slot text DEFAULT 'morning',
  geo_lat double precision,
  geo_lng double precision,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id bigserial PRIMARY KEY,
  order_id text,
  product_id text,
  name text,
  emoji text,
  grade text DEFAULT 'B',
  qty numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  weight_multiplier numeric NOT NULL DEFAULT 1,
  weight_label text NOT NULL DEFAULT '1 kg'
);

-- 3. FIX FOREIGN KEYS ON PROFILES & ORDERS (Allow Phone Login UUIDs)
DO $$
BEGIN
  -- Drop restrictive auth.users FK on profiles if present
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'profiles_id_fkey' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_fkey;
  END IF;

  -- Drop restrictive user_id FK on orders if present
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'orders_user_id_fkey' AND table_name = 'orders'
  ) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_user_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'orders_profiles_fkey' AND table_name = 'orders'
  ) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_profiles_fkey;
  END IF;
END $$;

-- 4. ENSURE ALL COLUMNS EXIST ON ORDERS, ORDER_ITEMS, PROFILES
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'advance',
  ADD COLUMN IF NOT EXISTS delivery_slot text DEFAULT 'morning',
  ADD COLUMN IF NOT EXISTS geo_lat double precision,
  ADD COLUMN IF NOT EXISTS geo_lng double precision;

ALTER TABLE public.order_items 
  ADD COLUMN IF NOT EXISTS weight_multiplier numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS weight_label text NOT NULL DEFAULT '1 kg';

ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS "isBlocked" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- 5. CONFIGURE RLS POLICIES
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Drop old conflicting policies
DROP POLICY IF EXISTS "Allow public insert on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public select on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public update on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public delete on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public insert on order_items" ON public.order_items;
DROP POLICY IF EXISTS "Allow public select on order_items" ON public.order_items;
DROP POLICY IF EXISTS "Allow public update on order_items" ON public.order_items;
DROP POLICY IF EXISTS "Allow public delete on order_items" ON public.order_items;
DROP POLICY IF EXISTS "Allow public all on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public all on addresses" ON public.addresses;
DROP POLICY IF EXISTS "Allow public select on coupons" ON public.coupons;

-- Create permissive operational policies
CREATE POLICY "Allow public insert on orders" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow public select on orders" ON public.orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public update on orders" ON public.orders FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow public delete on orders" ON public.orders FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Allow public insert on order_items" ON public.order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow public select on order_items" ON public.order_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public update on order_items" ON public.order_items FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow public delete on order_items" ON public.order_items FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Allow public all on profiles" ON public.profiles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all on addresses" ON public.addresses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public select on coupons" ON public.coupons FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 6. RE-CREATE UTR VALIDATOR (Active order uniqueness)
CREATE OR REPLACE FUNCTION public.validate_utr()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.utr IS NOT NULL AND NEW.utr != '' THEN
    IF EXISTS (
      SELECT 1 FROM public.orders 
      WHERE utr = UPPER(TRIM(NEW.utr)) 
        AND id != NEW.id 
        AND status != 'cancelled'
    ) THEN
      RAISE EXCEPTION 'This UTR has already been used for another active order.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_utr_trigger ON public.orders;
CREATE TRIGGER validate_utr_trigger
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_utr();

-- 7. ATOMIC ORDER CREATION RPC
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_id text,
  p_user_id text,
  p_user_name text,
  p_user_email text,
  p_address text,
  p_phone text,
  p_pin text,
  p_delivery_slot text,
  p_utr text,
  p_delivery_fee numeric,
  p_discount numeric,
  p_payment_type text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item jsonb;
  v_product record;
  v_unit_base_price numeric;
  v_line_unit_price numeric;
  v_calculated_subtotal numeric := 0;
  v_calculated_total numeric := 0;
  v_calculated_advance numeric := 0;
  v_weight_mult numeric;
  v_weight_lbl text;
  v_qty numeric;
  v_grade text;
  v_prod_id text;
  v_prod_name text;
  v_prod_emoji text;
BEGIN
  -- Validate UTR uniqueness on non-cancelled orders
  IF p_utr IS NOT NULL AND p_utr != '' THEN
    IF EXISTS (
      SELECT 1 FROM public.orders 
      WHERE utr = UPPER(TRIM(p_utr)) 
        AND id != p_id 
        AND status != 'cancelled'
    ) THEN
      RAISE EXCEPTION 'This UTR has already been used for another active order.';
    END IF;
  END IF;

  -- Iterate through items and compute verified pricing from products table
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := v_item->>'productId';
    v_grade := UPPER(COALESCE(v_item->>'grade', 'B'));
    v_qty := (v_item->>'qty')::numeric;
    v_weight_mult := COALESCE((v_item->>'weightMultiplier')::numeric, 1);
    v_weight_lbl := COALESCE(v_item->>'weightLabel', '1 kg');

    SELECT * INTO v_product FROM public.products WHERE id = v_prod_id;
    IF NOT FOUND THEN
      v_unit_base_price := COALESCE((v_item->>'unitPrice')::numeric, 40);
    ELSE
      IF v_grade = 'A' THEN
        v_unit_base_price := COALESCE(v_product.p_a, v_product.p_b);
      ELSIF v_grade = 'C' THEN
        v_unit_base_price := COALESCE(v_product.p_c, v_product.p_b);
      ELSE
        v_unit_base_price := v_product.p_b;
      END IF;
    END IF;

    v_line_unit_price := ROUND(v_unit_base_price * v_weight_mult);
    v_calculated_subtotal := v_calculated_subtotal + (v_line_unit_price * v_qty);
  END LOOP;

  v_calculated_total := GREATEST(0, v_calculated_subtotal + COALESCE(p_delivery_fee, 0) - COALESCE(p_discount, 0));

  IF p_payment_type = 'full' THEN
    v_calculated_advance := v_calculated_total;
  ELSE
    v_calculated_advance := CEIL(v_calculated_total * 0.5);
  END IF;

  -- Ensure profile exists
  INSERT INTO public.profiles (id, email, name, role, phone, created_at)
  VALUES (
    p_user_id,
    COALESCE(p_user_email, p_user_id || '@greenvest.shop'),
    COALESCE(p_user_name, 'Customer'),
    'customer',
    p_phone,
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert order
  INSERT INTO public.orders (
    id,
    user_id,
    user_name,
    user_email,
    subtotal,
    delivery_fee,
    discount,
    total,
    advance_amount,
    payment_type,
    utr,
    utr_verified,
    status,
    address,
    phone,
    pin,
    delivery_slot,
    created_at,
    updated_at
  ) VALUES (
    p_id,
    p_user_id,
    p_user_name,
    p_user_email,
    v_calculated_subtotal,
    COALESCE(p_delivery_fee, 0),
    COALESCE(p_discount, 0),
    v_calculated_total,
    v_calculated_advance,
    COALESCE(p_payment_type, 'advance'),
    UPPER(TRIM(COALESCE(p_utr, ''))),
    false,
    'pending',
    p_address,
    p_phone,
    p_pin,
    p_delivery_slot,
    now(),
    now()
  );

  -- Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := v_item->>'productId';
    v_grade := UPPER(COALESCE(v_item->>'grade', 'B'));
    v_qty := (v_item->>'qty')::numeric;
    v_weight_mult := COALESCE((v_item->>'weightMultiplier')::numeric, 1);
    v_weight_lbl := COALESCE(v_item->>'weightLabel', '1 kg');
    v_prod_name := v_item->>'name';
    v_prod_emoji := COALESCE(v_item->>'emoji', '🥬');

    SELECT * INTO v_product FROM public.products WHERE id = v_prod_id;
    IF NOT FOUND THEN
      v_unit_base_price := COALESCE((v_item->>'unitPrice')::numeric, 40);
    ELSE
      IF v_grade = 'A' THEN
        v_unit_base_price := COALESCE(v_product.p_a, v_product.p_b);
      ELSIF v_grade = 'C' THEN
        v_unit_base_price := COALESCE(v_product.p_c, v_product.p_b);
      ELSE
        v_unit_base_price := v_product.p_b;
      END IF;
    END IF;
    v_line_unit_price := ROUND(v_unit_base_price * v_weight_mult);

    INSERT INTO public.order_items (
      order_id,
      product_id,
      name,
      emoji,
      grade,
      qty,
      unit_price,
      weight_multiplier,
      weight_label
    ) VALUES (
      p_id,
      v_prod_id,
      v_prod_name,
      v_prod_emoji,
      v_grade,
      v_qty,
      v_line_unit_price,
      v_weight_mult,
      v_weight_lbl
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_id,
    'subtotal', v_calculated_subtotal,
    'total', v_calculated_total,
    'advance_amount', v_calculated_advance
  );
END;
$$;
