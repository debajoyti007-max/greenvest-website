-- ==============================================================================
-- GREENVEST: SECURITY PROTECTIONS + 10% ADVANCE ORDER RPC
-- Run this ONCE in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- ==============================================================================
-- PART 1: UPDATE create_order_atomic (10% ADVANCE + REMOVE UTR CONFLICT)
-- ==============================================================================

-- 1. Ensure required columns exist on orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_date text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_khata_order boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payer_upi_name text;

-- 2. Drop any legacy versions of create_order_atomic
DROP FUNCTION IF EXISTS public.create_order_atomic(text, text, text, text, text, text, text, text, text, numeric, numeric, text, jsonb);

-- 3. Create definitive 14-parameter create_order_atomic RPC with 10% Advance calculation
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
  p_items jsonb,
  p_delivery_date text DEFAULT NULL
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
  v_clean_utr text;
  v_is_khata boolean := false;
BEGIN
  v_clean_utr := UPPER(TRIM(COALESCE(p_utr, '')));
  v_is_khata := (p_payment_type = 'khata' OR v_clean_utr = 'KHATA-DEBIT');

  -- Validate UTR uniqueness ONLY if a real bank UTR is provided (ignore generic placeholders)
  IF v_clean_utr IS NOT NULL 
     AND v_clean_utr != '' 
     AND v_clean_utr != 'ONLINE-PAY' 
     AND v_clean_utr != 'KHATA-DEBIT' 
     AND v_clean_utr != 'CASH-PAY' THEN
    IF EXISTS (
      SELECT 1 FROM public.orders 
      WHERE utr = v_clean_utr 
        AND id != p_id 
        AND status != 'cancelled'
    ) THEN
      RAISE EXCEPTION 'This transaction UTR has already been used for another active order.';
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

  -- ⚡ 10% ADVANCE CALCULATION (or 100% for full pay, 0 for Khata)
  IF p_payment_type = 'full' THEN
    v_calculated_advance := v_calculated_total;
  ELSIF v_is_khata THEN
    v_calculated_advance := 0;
  ELSE
    v_calculated_advance := CASE 
      WHEN v_calculated_total > 0 THEN GREATEST(1, CEIL(v_calculated_total * 0.1)) 
      ELSE 0 
    END;
  END IF;

  -- Ensure profile exists (never overwrite existing role)
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
    delivery_date,
    is_khata_order,
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
    v_clean_utr,
    v_is_khata,
    CASE WHEN v_is_khata THEN 'confirmed' ELSE 'pending' END,
    p_address,
    p_phone,
    p_pin,
    p_delivery_slot,
    p_delivery_date,
    v_is_khata,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    advance_amount = EXCLUDED.advance_amount,
    delivery_date = COALESCE(EXCLUDED.delivery_date, orders.delivery_date),
    updated_at = now();

  -- Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := v_item->>'productId';
    v_grade := UPPER(COALESCE(v_item->>'grade', 'B'));
    v_qty := (v_item->>'qty')::numeric;
    v_weight_mult := COALESCE((v_item->>'weightMultiplier')::numeric, 1);
    v_weight_lbl := COALESCE(v_item->>'weightLabel', '1 kg');
    v_prod_name := COALESCE(v_item->>'name', 'Product');
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


-- ==============================================================================
-- PART 2: SECURITY PROTECTION 1 — LOCK PRODUCTS TABLE FROM DIRECT MODIFICATION
-- ==============================================================================

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_all"   ON public.products;
DROP POLICY IF EXISTS "products_staff_insert" ON public.products;
DROP POLICY IF EXISTS "products_staff_update" ON public.products;
DROP POLICY IF EXISTS "products_staff_delete" ON public.products;
DROP POLICY IF EXISTS "Allow public read products"  ON public.products;
DROP POLICY IF EXISTS "Allow staff write products" ON public.products;

CREATE POLICY "products_select_all"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "products_staff_insert"
  ON public.products
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id::text = auth.uid()::text
        AND role IN ('seller', 'admin')
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "products_staff_update"
  ON public.products
  FOR UPDATE
  TO authenticated, service_role
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id::text = auth.uid()::text
        AND role IN ('seller', 'admin')
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "products_staff_delete"
  ON public.products
  FOR DELETE
  TO authenticated, service_role
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id::text = auth.uid()::text
        AND role = 'admin'
    )
    OR auth.role() = 'service_role'
  );

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
  p_image_url text DEFAULT NULL,
  p_emoji text DEFAULT '🥬',
  p_archived boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res record;
BEGIN
  INSERT INTO public.products (
    id, name, bn_name, p_a, p_b, p_c, in_stock, category, unit, image_url, emoji, archived, updated_at
  ) VALUES (
    p_id, p_name, p_bn_name, p_p_a, p_p_b, p_p_c, p_in_stock, p_category, p_unit, p_image_url, p_emoji, p_archived, now()
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
    image_url = COALESCE(EXCLUDED.image_url, products.image_url),
    emoji = EXCLUDED.emoji,
    archived = EXCLUDED.archived,
    updated_at = now()
  RETURNING * INTO v_res;

  RETURN to_jsonb(v_res);
END;
$$;


-- ==============================================================================
-- PART 3: SECURITY PROTECTION 2 — LOCK PROFILES (NO ROLE/KHATA SELF-PROMOTION)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role text;
  v_is_staff boolean := false;
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.khata_approved IS NOT DISTINCT FROM OLD.khata_approved
     AND NEW.khata_credit_limit IS NOT DISTINCT FROM OLD.khata_credit_limit
     AND NEW.is_blocked IS NOT DISTINCT FROM OLD.is_blocked THEN
    RETURN NEW;
  END IF;

  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id::text = auth.uid()::text;
    IF v_caller_role IN ('admin', 'seller') THEN
      v_is_staff := true;
    END IF;
  END IF;

  IF NOT v_is_staff THEN
    NEW.role := OLD.role;
    NEW.khata_approved := OLD.khata_approved;
    NEW.khata_credit_limit := OLD.khata_credit_limit;
    NEW.is_blocked := OLD.is_blocked;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileges();

CREATE OR REPLACE FUNCTION public.update_user_role_admin(
  p_user_id text,
  p_role text
) RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  v_clean_phone text;
BEGIN
  IF p_role NOT IN ('customer', 'seller', 'admin', 'rider') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);

  UPDATE public.profiles 
  SET role = p_role, updated_at = now() 
  WHERE id = p_user_id 
     OR (email IS NOT NULL AND email = lower(p_user_id))
     OR (phone IS NOT NULL AND v_clean_phone != '' AND phone = v_clean_phone);

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'role', p_role);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'User not found');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_khata_admin(
  p_user_id text,
  p_approved boolean,
  p_limit numeric DEFAULT 2000
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_phone text;
BEGIN
  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);

  UPDATE public.profiles
  SET khata_approved = p_approved,
      khata_credit_limit = COALESCE(p_limit, 2000),
      updated_at = now()
  WHERE id = p_user_id
     OR (email IS NOT NULL AND email = lower(p_user_id))
     OR (phone IS NOT NULL AND v_clean_phone != '' AND phone = v_clean_phone);

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'khata_approved', p_approved, 'credit_limit', p_limit);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'User not found');
END;
$$;


-- ==============================================================================
-- PART 4: SECURITY PROTECTION 3 — LOCK ORDERS & KHATA LEDGER INTEGRITY
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.protect_order_manipulation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role text;
  v_is_staff boolean := false;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.total IS NOT DISTINCT FROM OLD.total
     AND NEW.advance_amount IS NOT DISTINCT FROM OLD.advance_amount THEN
    RETURN NEW;
  END IF;

  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id::text = auth.uid()::text;
    IF v_caller_role IN ('admin', 'seller', 'rider') THEN
      v_is_staff := true;
    END IF;
  END IF;

  IF NOT v_is_staff THEN
    IF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
      RETURN NEW;
    ELSE
      NEW.status := OLD.status;
      NEW.total := OLD.total;
      NEW.advance_amount := OLD.advance_amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_order_manipulation ON public.orders;
CREATE TRIGGER trg_protect_order_manipulation
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_order_manipulation();
