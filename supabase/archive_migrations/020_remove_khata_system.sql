-- ============================================================
-- GreenVest Migration 020: Complete Removal of Khata System
-- Applied: September 2026
-- Description:
--   1. Updates prevent_profile_escalation trigger to remove khata guards
--   2. Updates enforce_profile_security trigger to remove khata logic
--   3. Updates enforce_order_security trigger to remove khata bypass
--   4. Updates register_customer_atomic without khata columns
--   5. Updates login_with_pin without khata payload
--   6. Updates get_staff_customers return signature without khata columns
--   7. Updates create_order_atomic without khata order branches
--   8. Updates delete_user_admin to remove khata balance dependency
--   9. Drops obsolete RPCs: get_staff_khata_ledger & update_user_khata_admin
--  10. Drops public.khata_ledger table cascade
--  11. Drops columns khata_approved, khata_credit_limit from public.profiles
--  12. Drops column is_khata_order from public.orders
-- ============================================================

-- 1. Redefine prevent_profile_escalation
CREATE OR REPLACE FUNCTION public.prevent_profile_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  -- If authorized by any admin RPC, allow everything
  IF current_setting('app.allow_profile_change', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- service_role always allowed (internal Supabase jobs)
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Role escalation guard
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.role IN ('admin', 'seller', 'rider') AND OLD.role = 'customer' THEN
      RAISE EXCEPTION 'Role escalation denied. Use the admin panel to change roles.';
    END IF;
  END IF;

  -- Self-unblock guard
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
     AND OLD.is_blocked = TRUE AND NEW.is_blocked = FALSE THEN
    RAISE EXCEPTION 'Self-unblock denied. Contact support.';
  END IF;

  RETURN NEW;
END;
$func$;

-- 2. Redefine enforce_profile_security
CREATE OR REPLACE FUNCTION public.enforce_profile_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Prevent changing the Super Admin email or phone
  IF OLD.email ILIKE '%debajoyti007%' OR OLD.phone = '8170859653' THEN
    NEW.role := 'admin';
    NEW.email := OLD.email;
    NEW.phone := OLD.phone;
  END IF;

  -- Block any non-admin from changing their own role to 'admin' or 'seller'
  IF (OLD.role = 'customer' OR OLD.role IS NULL) AND (NEW.role = 'admin' OR NEW.role = 'seller') THEN
    IF NEW.email NOT ILIKE '%debajoyti007%' AND NEW.phone != '8170859653' THEN
      NEW.role := OLD.role;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Redefine enforce_order_security (all orders start unverified & pending)
CREATE OR REPLACE FUNCTION public.enforce_order_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.utr_verified := false;
    IF NEW.status = 'confirmed' OR NEW.status = 'delivered' THEN
      NEW.status := 'pending';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Redefine delete_user_admin
CREATE OR REPLACE FUNCTION public.delete_user_admin(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phone text;
  v_email text;
  v_is_super boolean := false;
  v_active_orders int := 0;
BEGIN
  SELECT email, phone, coalesce(is_super_admin, false) INTO v_email, v_phone, v_is_super
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_is_super OR lower(coalesce(v_email, '')) LIKE '%debajoyti007%' THEN
    RETURN jsonb_build_object('ok', false, 'error', '🛡️ Super Admin Shield: Master Administrator account cannot be deleted.');
  END IF;

  SELECT count(*) INTO v_active_orders
  FROM public.orders
  WHERE user_id = p_user_id
    AND status IN ('pending', 'advance_paid', 'confirmed', 'out_for_delivery');

  IF v_active_orders > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', '⚠️ Cannot delete: Customer has ' || v_active_orders || ' active order(s) in transit.');
  END IF;

  DELETE FROM public.addresses WHERE user_id = p_user_id;
  DELETE FROM public.notifications WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'message', 'User deleted successfully');
END;
$function$;

-- 5. Redefine register_customer_atomic
CREATE OR REPLACE FUNCTION public.register_customer_atomic(p_name text, p_email text, p_phone text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      RETURN jsonb_build_object('ok', false, 'error', 'Please provide a valid 10-digit mobile number or email address.');
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
      'error', 'This mobile number / email is already registered. Please click the Login tab and sign in with your PIN.'
    );
  END IF;

  v_new_id := gen_random_uuid()::text;
  INSERT INTO public.profiles (
    id,
    email,
    name,
    role,
    phone,
    pin,
    is_blocked,
    tier,
    is_super_admin,
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
    v_norm_email,
    v_clean_name,
    'customer',
    CASE WHEN length(v_clean_phone) = 10 THEN v_clean_phone ELSE NULL END,
    v_clean_pin,
    false,
    'regular',
    false,
    now(),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', v_new_id,
      'email', v_norm_email,
      'name', v_clean_name,
      'role', 'customer',
      'phone', CASE WHEN length(v_clean_phone) = 10 THEN v_clean_phone ELSE NULL END,
      'createdAt', now()
    )
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object(
    'ok', false,
    'error', 'This mobile number / email is already registered. Please click Login to sign in.'
  );
END;
$function$;

-- 6. Redefine login_with_pin
CREATE OR REPLACE FUNCTION public.login_with_pin(p_identifier text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile profiles%ROWTYPE;
  v_clean_phone text;
  v_clean_id text;
  v_pin text := trim(coalesce(p_pin, ''));
BEGIN
  v_clean_id := lower(trim(coalesce(p_identifier, '')));
  IF v_clean_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please enter your mobile number or email.');
  END IF;

  v_clean_phone := right(regexp_replace(v_clean_id, '\D', '', 'g'), 10);

  SELECT * INTO v_profile
  FROM profiles
  WHERE lower(trim(email)) = v_clean_id
     OR (length(v_clean_phone) = 10 AND phone = v_clean_phone)
     OR (length(v_clean_phone) = 10 AND lower(trim(email)) = (v_clean_phone || '@greenvest.shop'))
  ORDER BY (role = 'admin') DESC, (role = 'seller') DESC, (is_super_admin = true) DESC, created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No account found with this phone/email. Please Sign Up first — it is free!');
  END IF;

  IF v_profile.is_blocked THEN
    RETURN jsonb_build_object('ok', false, 'error', '🚫 Account is suspended. Please contact GreenVest Admin.');
  END IF;

  IF v_profile.pin = v_pin 
     OR v_profile.pin = lpad(v_pin, 4, '0') 
     OR v_profile.pin = rpad(v_pin, 6, '0')
     OR (length(v_profile.pin) = 6 AND substr(v_profile.pin, 1, 4) = v_pin) THEN
    RETURN jsonb_build_object(
      'ok',                 true,
      'id',                 v_profile.id,
      'email',              v_profile.email,
      'name',               v_profile.name,
      'role',               v_profile.role,
      'phone',              v_profile.phone,
      'is_super_admin',     coalesce(v_profile.is_super_admin, false),
      'is_blocked',         coalesce(v_profile.is_blocked, false),
      'tier',               coalesce(v_profile.tier, 'regular')
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'Invalid credentials');
END;
$function$;

-- 7. Redefine get_staff_customers
DROP FUNCTION IF EXISTS public.get_staff_customers(text, text);

CREATE OR REPLACE FUNCTION public.get_staff_customers(p_caller_id text, p_caller_pin text)
RETURNS TABLE(
  id text,
  email text,
  name text,
  role text,
  phone text,
  is_super_admin boolean,
  is_blocked boolean,
  tier text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_is_auth BOOLEAN := false;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid()::text = p_caller_id THEN
    SELECT * INTO v_caller FROM public.profiles WHERE profiles.id = p_caller_id;
    IF FOUND AND (v_caller.role IN ('admin', 'seller') OR v_caller.is_super_admin = true) THEN
      v_is_auth := true;
    END IF;
  END IF;

  IF NOT v_is_auth THEN
    SELECT * INTO v_caller FROM public.profiles WHERE profiles.id = p_caller_id;
    IF FOUND AND (v_caller.role IN ('admin', 'seller') OR v_caller.is_super_admin = true) THEN
      IF v_caller.pin = p_caller_pin OR LPAD(p_caller_pin, 4, '0') = v_caller.pin THEN
        v_is_auth := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_auth THEN
    RAISE EXCEPTION 'Access Denied: Caller is not an authorized seller or administrator';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.name,
    p.role,
    p.phone,
    p.is_super_admin,
    p.is_blocked,
    p.tier,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  ORDER BY p.created_at ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_staff_customers(text, text) TO anon, authenticated;

-- 8. Redefine create_order_atomic
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
  p_delivery_date text DEFAULT 'standard'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
BEGIN
  v_clean_utr := UPPER(TRIM(COALESCE(p_utr, '')));

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
    delivery_slot, delivery_date, created_at, updated_at
  ) VALUES (
    p_id, p_user_id, p_user_name, p_user_email, v_calculated_subtotal,
    COALESCE(p_delivery_fee, 0), COALESCE(p_discount, 0), v_calculated_total,
    v_calculated_advance, COALESCE(p_payment_type, 'advance'), v_clean_utr, false,
    'pending',
    p_address, p_phone, p_pin, p_delivery_slot, COALESCE(p_delivery_date, 'standard'), now(), now()
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
$function$;

-- 9. Drop obsolete Khata RPCs
DROP FUNCTION IF EXISTS public.get_staff_khata_ledger(text, text);
DROP FUNCTION IF EXISTS public.update_user_khata_admin(text, boolean, integer);

-- 10. Drop khata_ledger table cascade
DROP TABLE IF EXISTS public.khata_ledger CASCADE;

-- 11. Drop khata columns from profiles and orders
ALTER TABLE public.profiles DROP COLUMN IF EXISTS khata_approved CASCADE;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS khata_credit_limit CASCADE;
ALTER TABLE public.orders DROP COLUMN IF EXISTS is_khata_order CASCADE;
