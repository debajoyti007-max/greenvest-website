-- ============================================================
-- ROLE: CUSTOMER
-- MODULE: Core Remote Procedure Calls (RPCs)
-- File: supabase/sql/customer/02_customer_rpcs.sql
-- ============================================================
-- Description:
-- Contains server-side, atomic PostgreSQL functions for:
-- 1. check_account_exists (Phone/Email duplicate detection)
-- 2. login_with_pin (Secure PIN authentication)
-- 3. register_customer_atomic (Account creation with duplicate guards)
-- 4. create_order_atomic (Atomic checkout calculation, order & items insert)
-- 5. validate_coupon (Voucher discount verification)
-- 6. reset_pin_with_verification (Self-service PIN recovery)
-- ============================================================

-- 1. CHECK ACCOUNT EXISTS
CREATE OR REPLACE FUNCTION public.check_account_exists(p_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_phone text;
  v_norm_email text;
  v_exists boolean := false;
BEGIN
  v_clean_phone := right(regexp_replace(coalesce(p_identifier, ''), '\D', '', 'g'), 10);
  v_norm_email := lower(trim(coalesce(p_identifier, '')));

  IF length(v_clean_phone) = 10 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE phone = v_clean_phone OR email = v_clean_phone || '@greenvest.shop'
    ) INTO v_exists;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE lower(trim(email)) = v_norm_email
    ) INTO v_exists;
  END IF;

  RETURN jsonb_build_object('exists', v_exists);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_account_exists(text) TO anon, authenticated;


-- 2. LOGIN WITH PIN
CREATE OR REPLACE FUNCTION public.login_with_pin(p_identifier text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_id text := lower(trim(coalesce(p_identifier, '')));
  v_clean_pin text := trim(coalesce(p_pin, ''));
  v_clean_phone text;
  v_profile profiles%ROWTYPE;
BEGIN
  v_clean_phone := right(regexp_replace(coalesce(p_identifier, ''), '\D', '', 'g'), 10);

  IF length(v_clean_phone) = 10 THEN
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE phone = v_clean_phone
       OR email = v_clean_phone || '@greenvest.shop'
       OR email = v_clean_id
    LIMIT 1;
  ELSE
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE lower(trim(email)) = v_clean_id
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No account found with this mobile number or email.');
  END IF;

  IF coalesce(v_profile.is_blocked, false) = true THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account is suspended. Please contact MS Vegetable Center Support.');
  END IF;

  IF v_profile.pin = v_clean_pin OR v_profile.pin = lpad(v_clean_pin, 4, '0') THEN
    RETURN jsonb_build_object(
      'ok',                 true,
      'id',                 v_profile.id,
      'email',              v_profile.email,
      'name',               v_profile.name,
      'role',               v_profile.role,
      'phone',              v_profile.phone,
      'is_super_admin',     coalesce(v_profile.is_super_admin, false),
      'is_blocked',         coalesce(v_profile.is_blocked, false),
      'tier',               coalesce(v_profile.tier, 'regular'),
      'khata_approved',     coalesce(v_profile.khata_approved, false),
      'khata_credit_limit', coalesce(v_profile.khata_credit_limit, 2000)
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'Incorrect PIN. Please try again or use PIN reset.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_with_pin(text, text) TO anon, authenticated;


-- 3. ATOMIC CUSTOMER REGISTRATION
CREATE OR REPLACE FUNCTION public.register_customer_atomic(
  p_name text,
  p_email text,
  p_phone text,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_name text := trim(coalesce(p_name, ''));
  v_clean_pin text := trim(coalesce(p_pin, ''));
  v_clean_phone text;
  v_norm_email text;
  v_new_id text;
  v_existing profiles%ROWTYPE;
BEGIN
  IF v_clean_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Full Name is required.');
  END IF;

  IF length(v_clean_pin) <> 4 OR v_clean_pin ~ '\D' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Security PIN must be exactly 4 digits.');
  END IF;

  v_clean_phone := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  IF length(v_clean_phone) <> 10 THEN
    v_clean_phone := right(regexp_replace(coalesce(p_email, ''), '\D', '', 'g'), 10);
  END IF;

  v_norm_email := lower(trim(coalesce(p_email, '')));
  IF v_norm_email = '' OR position('@' in v_norm_email) = 0 THEN
    IF length(v_clean_phone) = 10 THEN
      v_norm_email := v_clean_phone || '@greenvest.shop';
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Please provide a valid 10-digit mobile number.');
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM public.profiles
  WHERE lower(trim(email)) = v_norm_email
     OR (length(v_clean_phone) = 10 AND phone = v_clean_phone)
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This mobile number is already registered. Please sign in with your PIN.'
    );
  END IF;

  v_new_id := 'u-' || floor(extract(epoch from now()) * 1000)::text || '-' || floor(random() * 9000 + 1000)::text;

  INSERT INTO public.profiles (
    id, email, name, role, phone, pin, is_super_admin, is_blocked, tier, khata_approved, khata_credit_limit, created_at
  ) VALUES (
    v_new_id, v_norm_email, v_clean_name, 'customer', v_clean_phone, v_clean_pin, false, false, 'regular', false, 2000, now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_new_id,
    'email', v_norm_email,
    'name', v_clean_name,
    'role', 'customer',
    'phone', v_clean_phone,
    'is_super_admin', false,
    'is_blocked', false,
    'tier', 'regular',
    'khata_approved', false,
    'khata_credit_limit', 2000
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_customer_atomic(text, text, text, text) TO anon, authenticated;


-- 4. ATOMIC ORDER CREATION
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
  p_delivery_date text DEFAULT 'standard'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    p_address, p_phone, p_pin, p_delivery_slot, COALESCE(p_delivery_date, 'standard'), v_is_khata, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    advance_amount = EXCLUDED.advance_amount,
    delivery_date = COALESCE(EXCLUDED.delivery_date, orders.delivery_date),
    updated_at = now();

  DELETE FROM public.order_items WHERE order_id = p_id;

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

GRANT EXECUTE ON FUNCTION public.create_order_atomic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb,text) TO anon, authenticated;


-- 5. COUPON DISCOUNT VALIDATION
CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code text,
  p_order_total numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon record;
  v_discount numeric := 0;
BEGIN
  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE upper(code) = upper(trim(p_code))
    AND valid = true
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid or expired coupon code');
  END IF;

  IF p_order_total < coalesce(v_coupon.min_order, 0) THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Minimum order of ₹' || v_coupon.min_order || ' required for this coupon'
    );
  END IF;

  IF v_coupon.discount_type = 'percent' THEN
    v_discount := round((p_order_total * v_coupon.discount_value) / 100);
  ELSE
    v_discount := v_coupon.discount_value;
  END IF;

  v_discount := least(v_discount, p_order_total);

  RETURN jsonb_build_object(
    'valid', true,
    'discount', v_discount,
    'code', v_coupon.code,
    'type', v_coupon.discount_type,
    'value', v_coupon.discount_value
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_coupon(text, numeric) TO anon, authenticated;


-- 6. SELF-SERVICE PIN RESET
CREATE OR REPLACE FUNCTION public.reset_pin_with_verification(
  p_identifier text,
  p_name text,
  p_new_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_pin text := trim(coalesce(p_new_pin, ''));
  v_clean_phone text;
  v_clean_name text := lower(trim(coalesce(p_name, '')));
  v_profile profiles%ROWTYPE;
BEGIN
  IF length(v_clean_pin) <> 4 OR v_clean_pin ~ '\D' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'New PIN must be exactly 4 digits.');
  END IF;

  v_clean_phone := right(regexp_replace(coalesce(p_identifier, ''), '\D', '', 'g'), 10);

  IF length(v_clean_phone) = 10 THEN
    SELECT * INTO v_profile FROM public.profiles
    WHERE phone = v_clean_phone OR email = v_clean_phone || '@greenvest.shop'
    LIMIT 1;
  ELSE
    SELECT * INTO v_profile FROM public.profiles
    WHERE lower(trim(email)) = lower(trim(p_identifier))
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No registered account found.');
  END IF;

  IF lower(trim(v_profile.name)) <> v_clean_name THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account verification failed. Name does not match account records.');
  END IF;

  UPDATE public.profiles
  SET pin = v_clean_pin, updated_at = now()
  WHERE id = v_profile.id;

  RETURN jsonb_build_object('ok', true, 'message', 'PIN has been reset successfully. Please log in.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_pin_with_verification(text, text, text) TO anon, authenticated;
