-- ==============================================================================
-- GREENVEST: FIX ORDER CONFIRM STATUS + 10% ADVANCE ORDER RPC
-- Run this ONCE in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- ==============================================================================
-- STEP 1: DROP BLOCKING TRIGGERS (This fixes "shows confirm then again to confirm")
-- ==============================================================================
DROP TRIGGER IF EXISTS trg_protect_order_manipulation ON public.orders;
DROP FUNCTION IF EXISTS public.protect_order_manipulation();

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_privileges();

-- ==============================================================================
-- STEP 2: CREATE BULLETPROOF ORDER STATUS UPDATE RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.update_order_status_admin(
  p_order_id text,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.orders
  SET status = p_status,
      rejection_reason = COALESCE(p_reason, rejection_reason),
      updated_at = now()
  WHERE id = p_order_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', p_status);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Order not found');
END;
$$;

-- ==============================================================================
-- STEP 3: UPDATE create_order_atomic (10% ADVANCE + CLEAN MULTI-ORDER ONLINE PAY)
-- ==============================================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_date text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_khata_order boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payer_upi_name text;

DROP FUNCTION IF EXISTS public.create_order_atomic(text, text, text, text, text, text, text, text, text, numeric, numeric, text, jsonb);

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

  -- Compute verified pricing from products table
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

  -- ⚡ 10% ADVANCE CALCULATION
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

  INSERT INTO public.orders (
    id, user_id, user_name, user_email, subtotal, delivery_fee, discount, total,
    advance_amount, payment_type, utr, utr_verified, status, address, phone, pin,
    delivery_slot, delivery_date, is_khata_order, created_at, updated_at
  ) VALUES (
    p_id, p_user_id, p_user_name, p_user_email, v_calculated_subtotal,
    COALESCE(p_delivery_fee, 0), COALESCE(p_discount, 0), v_calculated_total,
    v_calculated_advance, COALESCE(p_payment_type, 'advance'), v_clean_utr, v_is_khata,
    CASE WHEN v_is_khata THEN 'confirmed' ELSE 'pending' END,
    p_address, p_phone, p_pin, p_delivery_slot, p_delivery_date, v_is_khata, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    advance_amount = EXCLUDED.advance_amount,
    delivery_date = COALESCE(EXCLUDED.delivery_date, orders.delivery_date),
    updated_at = now();

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
      order_id, product_id, name, emoji, grade, qty, unit_price, weight_multiplier, weight_label
    ) VALUES (
      p_id, v_prod_id, v_prod_name, v_prod_emoji, v_grade, v_qty, v_line_unit_price, v_weight_mult, v_weight_lbl
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
-- STEP 4: SAFE PRODUCT PROTECTION (PRICE LOCK RPC)
-- ==============================================================================
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

-- Atomic SECURITY DEFINER RPC to safely update user roles by Admin
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
