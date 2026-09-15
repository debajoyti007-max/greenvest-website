-- ============================================================
-- Migration 023: Free-tier security hardening
-- - PIN hashing (pgcrypto), server rate limiting
-- - Caller PIN verification on all admin RPCs
-- - Lock down anon RLS (deny direct table writes)
-- - Customer gateway RPCs for orders / addresses / profile
-- - Disable weak self-service PIN reset (contact support)
-- Run once in Supabase SQL Editor after deploying frontend update.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Rate limiting table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_attempts (
  id bigserial PRIMARY KEY,
  identifier text NOT NULL,
  attempt_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS auth_attempts_identifier_time_idx
  ON public.auth_attempts (identifier, attempt_at DESC);

ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_attempts_deny_all ON public.auth_attempts;
CREATE POLICY auth_attempts_deny_all ON public.auth_attempts FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- ── 2. PIN hash column ──────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_hash text;

UPDATE public.profiles
SET pin_hash = crypt(pin, gen_salt('bf'))
WHERE pin IS NOT NULL AND pin <> '' AND (pin_hash IS NULL OR pin_hash = '');

-- ── 3. Shared helpers ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profile_pin_matches(v_profile public.profiles, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_pin text := trim(coalesce(p_pin, ''));
BEGIN
  IF v_pin = '' THEN
    RETURN false;
  END IF;

  IF v_profile.pin_hash IS NOT NULL AND v_profile.pin_hash <> '' THEN
    IF crypt(v_pin, v_profile.pin_hash) = v_profile.pin_hash THEN
      RETURN true;
    END IF;
    IF crypt(lpad(v_pin, 4, '0'), v_profile.pin_hash) = v_profile.pin_hash THEN
      RETURN true;
    END IF;
  END IF;

  RETURN v_profile.pin = v_pin
      OR v_profile.pin = lpad(v_pin, 4, '0')
      OR v_profile.pin = rpad(v_pin, 6, '0')
      OR (length(v_profile.pin) = 6 AND substr(v_profile.pin, 1, 4) = v_pin);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_profile_pin_hash(p_profile_id text, p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET pin = lpad(trim(p_pin), 4, '0'),
      pin_hash = crypt(lpad(trim(p_pin), 4, '0'), gen_salt('bf')),
      updated_at = now()
  WHERE id = p_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_staff_caller(
  p_caller_id text,
  p_caller_pin text,
  p_allowed_roles text[] DEFAULT ARRAY['admin', 'seller']
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid()::text = p_caller_id THEN
    SELECT * INTO v_caller FROM public.profiles WHERE id = p_caller_id;
    IF FOUND AND (v_caller.is_super_admin OR v_caller.role = ANY (p_allowed_roles)) THEN
      RETURN v_caller;
    END IF;
  END IF;

  SELECT * INTO v_caller FROM public.profiles WHERE id = p_caller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT (v_caller.is_super_admin OR v_caller.role = ANY (p_allowed_roles)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT public.profile_pin_matches(v_caller, p_caller_pin) THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;

  RETURN v_caller;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_customer_caller(p_caller_id text, p_caller_pin text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM public.profiles WHERE id = p_caller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF coalesce(v_caller.is_blocked, false) THEN
    RAISE EXCEPTION 'Account is blocked';
  END IF;
  IF NOT public.profile_pin_matches(v_caller, p_caller_pin) THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;
  RETURN v_caller;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_auth_attempt(p_identifier text, p_success boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.auth_attempts (identifier, success) VALUES (lower(trim(p_identifier)), p_success);
  DELETE FROM public.auth_attempts WHERE attempt_at < now() - interval '7 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_is_locked(p_identifier text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fail_count int;
BEGIN
  SELECT count(*) INTO v_fail_count
  FROM public.auth_attempts
  WHERE identifier = lower(trim(p_identifier))
    AND success = false
    AND attempt_at > now() - interval '15 minutes';

  RETURN v_fail_count >= 5;
END;
$$;

-- ── 4. login_with_pin (hashed PIN + rate limit) ───────────────
CREATE OR REPLACE FUNCTION public.login_with_pin(p_identifier text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_clean_phone text;
  v_clean_id text;
  v_pin text := trim(coalesce(p_pin, ''));
  v_key text;
BEGIN
  v_clean_id := lower(trim(coalesce(p_identifier, '')));
  IF v_clean_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please enter your mobile number or email.');
  END IF;

  v_key := v_clean_id;
  v_clean_phone := right(regexp_replace(v_clean_id, '\D', '', 'g'), 10);
  IF length(v_clean_phone) = 10 THEN
    v_key := v_clean_phone;
  END IF;

  IF public.auth_is_locked(v_key) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Too many failed attempts. Please wait 15 minutes.');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE lower(trim(email)) = v_clean_id
     OR (length(v_clean_phone) = 10 AND phone = v_clean_phone)
     OR (length(v_clean_phone) = 10 AND lower(trim(email)) = (v_clean_phone || '@greenvest.shop'))
  ORDER BY (role = 'admin') DESC, (role = 'seller') DESC, (is_super_admin = true) DESC, created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM public.record_auth_attempt(v_key, false);
    RETURN jsonb_build_object('ok', false, 'error', 'No account found with this phone/email. Please Sign Up first — it is free!');
  END IF;

  IF coalesce(v_profile.is_blocked, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account is suspended. Please contact support.');
  END IF;

  IF public.profile_pin_matches(v_profile, v_pin) THEN
    PERFORM public.record_auth_attempt(v_key, true);
    RETURN jsonb_build_object(
      'ok', true,
      'id', v_profile.id,
      'email', v_profile.email,
      'name', v_profile.name,
      'role', v_profile.role,
      'phone', v_profile.phone,
      'is_super_admin', coalesce(v_profile.is_super_admin, false),
      'is_blocked', coalesce(v_profile.is_blocked, false),
      'tier', coalesce(v_profile.tier, 'regular')
    );
  END IF;

  PERFORM public.record_auth_attempt(v_key, false);
  RETURN jsonb_build_object('ok', false, 'error', 'Invalid credentials');
END;
$$;

-- ── 5. Disable weak PIN reset ─────────────────────────────────
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
BEGIN
  RETURN jsonb_build_object(
    'ok', false,
    'error', 'Online PIN reset is disabled for security. Please contact GreenVest support on WhatsApp to reset your PIN.'
  );
END;
$$;

-- ── 6. Customer self-service RPCs ─────────────────────────────
CREATE OR REPLACE FUNCTION public.update_own_pin(
  p_caller_id text,
  p_old_pin text,
  p_new_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
BEGIN
  IF length(trim(coalesce(p_new_pin, ''))) <> 4 OR trim(p_new_pin) ~ '\D' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'New PIN must be exactly 4 digits.');
  END IF;

  SELECT * INTO v_caller FROM public.profiles WHERE id = p_caller_id;
  IF NOT FOUND OR NOT public.profile_pin_matches(v_caller, p_old_pin) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Current PIN is incorrect.');
  END IF;

  PERFORM public.set_profile_pin_hash(p_caller_id, p_new_pin);
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_own_profile(
  p_caller_id text,
  p_caller_pin text,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.verify_customer_caller(p_caller_id, p_caller_pin);

  UPDATE public.profiles
  SET name = COALESCE(NULLIF(trim(p_name), ''), name),
      phone = COALESCE(NULLIF(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10), ''), phone),
      updated_at = now()
  WHERE id = p_caller_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_orders(
  p_caller_id text,
  p_caller_pin text,
  p_limit int DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.verify_customer_caller(p_caller_id, p_caller_pin);

  SELECT coalesce(
    jsonb_agg(
      to_jsonb(o) || jsonb_build_object('order_items', coalesce(items.arr, '[]'::jsonb))
      ORDER BY o.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT * FROM public.orders
    WHERE user_id = p_caller_id
    ORDER BY created_at DESC
    LIMIT GREATEST(1, LEAST(coalesce(p_limit, 100), 200))
  ) o
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(to_jsonb(oi)) AS arr FROM public.order_items oi WHERE oi.order_id = o.id
  ) items ON true;

  RETURN jsonb_build_object('ok', true, 'orders', v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.track_order_public(p_order_id text, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items jsonb;
  v_clean_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_clean_id text := trim(coalesce(p_order_id, ''));
BEGIN
  IF length(v_clean_phone) < 10 OR v_clean_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Order ID and phone are required.');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE phone = v_clean_phone
    AND (id = v_clean_id OR id ILIKE ('%' || v_clean_id))
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Order not found.');
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(oi)), '[]'::jsonb) INTO v_items
  FROM public.order_items oi WHERE oi.order_id = v_order.id;

  RETURN jsonb_build_object('ok', true, 'order', to_jsonb(v_order) || jsonb_build_object('order_items', v_items));
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_own_order(
  p_caller_id text,
  p_caller_pin text,
  p_order_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.verify_customer_caller(p_caller_id, p_caller_pin);

  UPDATE public.orders
  SET status = 'cancelled', rejection_reason = 'Cancelled by customer', updated_at = now()
  WHERE id = p_order_id
    AND user_id = p_caller_id
    AND status IN ('pending', 'advance_paid');

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'Order cannot be cancelled.');
END;
$$;

-- ── 7. Admin RPCs with caller verification ────────────────────
DROP FUNCTION IF EXISTS public.update_user_role_admin(text, text);
CREATE OR REPLACE FUNCTION public.update_user_role_admin(
  p_caller_id text, p_caller_pin text, p_user_id text, p_role text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clean_phone text;
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin']);

  IF p_role NOT IN ('customer', 'seller', 'admin', 'rider') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
  END IF;

  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (id = p_user_id OR email = lower(p_user_id) OR phone = v_clean_phone)
      AND is_super_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change role of Super Admin');
  END IF;

  PERFORM set_config('app.allow_profile_change', 'true', true);
  UPDATE public.profiles SET role = p_role, updated_at = now()
  WHERE id = p_user_id OR email = lower(p_user_id) OR phone = v_clean_phone
     OR email = (v_clean_phone || '@greenvest.shop');

  RETURN jsonb_build_object('success', true);
END;
$$;

DROP FUNCTION IF EXISTS public.update_user_block_admin(text, boolean);
CREATE OR REPLACE FUNCTION public.update_user_block_admin(
  p_caller_id text, p_caller_pin text, p_user_id text, p_is_blocked boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clean_phone text;
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller']);

  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (id = p_user_id OR email = lower(p_user_id) OR phone = v_clean_phone)
      AND is_super_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot block Super Admin');
  END IF;

  PERFORM set_config('app.allow_profile_change', 'true', true);
  UPDATE public.profiles SET is_blocked = p_is_blocked, updated_at = now()
  WHERE id = p_user_id OR email = lower(p_user_id) OR phone = v_clean_phone
     OR email = (v_clean_phone || '@greenvest.shop');

  RETURN jsonb_build_object('success', true);
END;
$$;

DROP FUNCTION IF EXISTS public.update_user_pin_admin(text, text, text);
CREATE OR REPLACE FUNCTION public.update_user_pin_admin(
  p_caller_id text, p_caller_pin text, p_user_id text, p_new_pin text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller']);

  IF length(trim(coalesce(p_new_pin, ''))) <> 4 OR trim(p_new_pin) ~ '\D' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PIN must be 4 digits');
  END IF;

  PERFORM public.set_profile_pin_hash(p_user_id, p_new_pin);
  RETURN jsonb_build_object('ok', true);
END;
$$;

DROP FUNCTION IF EXISTS public.delete_user_admin(text);
CREATE OR REPLACE FUNCTION public.delete_user_admin(
  p_caller_id text, p_caller_pin text, p_user_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_super boolean; v_active_orders int;
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin']);

  SELECT coalesce(is_super_admin, false) INTO v_is_super FROM public.profiles WHERE id = p_user_id;
  IF v_is_super THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Super Admin cannot be deleted');
  END IF;

  SELECT count(*) INTO v_active_orders FROM public.orders
  WHERE user_id = p_user_id AND status IN ('pending', 'advance_paid', 'confirmed', 'out_for_delivery');

  IF v_active_orders > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Customer has active orders');
  END IF;

  DELETE FROM public.addresses WHERE user_id = p_user_id;
  DELETE FROM public.notifications WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

DROP FUNCTION IF EXISTS public.update_order_status_admin(text, text, text);
CREATE OR REPLACE FUNCTION public.update_order_status_admin(
  p_caller_id text, p_caller_pin text, p_order_id text, p_status text, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller', 'rider']);

  UPDATE public.orders
  SET status = p_status, rejection_reason = COALESCE(p_reason, rejection_reason), updated_at = now()
  WHERE id = p_order_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true);
  END IF;
  RETURN jsonb_build_object('success', false, 'error', 'Order not found');
END;
$$;

DROP FUNCTION IF EXISTS public.delete_order_admin(text);
CREATE OR REPLACE FUNCTION public.delete_order_admin(
  p_caller_id text, p_caller_pin text, p_order_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller']);

  DELETE FROM public.order_messages WHERE order_id = p_order_id;
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

DROP FUNCTION IF EXISTS public.save_coupon_admin(text, text, numeric, numeric, boolean, timestamptz);
CREATE OR REPLACE FUNCTION public.save_coupon_admin(
  p_caller_id text, p_caller_pin text,
  p_code text, p_discount_type text, p_discount_value numeric,
  p_min_order numeric, p_valid boolean, p_expires_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller']);

  INSERT INTO public.coupons (code, discount_type, discount_value, min_order, active, valid, expires_at, valid_until)
  VALUES (upper(trim(p_code)), p_discount_type, p_discount_value, p_min_order, p_valid, p_valid, p_expires_at, p_expires_at)
  ON CONFLICT (code) DO UPDATE SET
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    min_order = EXCLUDED.min_order,
    active = EXCLUDED.active,
    valid = EXCLUDED.valid,
    expires_at = EXCLUDED.expires_at,
    valid_until = EXCLUDED.valid_until;

  RETURN jsonb_build_object('success', true);
END;
$$;

DROP FUNCTION IF EXISTS public.save_product_admin(text, text, text, numeric, numeric, numeric, boolean, text, text, text, text, boolean, numeric, text[], text, integer[], numeric);
CREATE OR REPLACE FUNCTION public.save_product_admin(
  p_caller_id text, p_caller_pin text,
  p_id text, p_name text, p_bn_name text,
  p_p_a numeric, p_p_b numeric, p_p_c numeric, p_in_stock boolean,
  p_category text, p_unit text,
  p_image_url text DEFAULT NULL, p_emoji text DEFAULT '🥬', p_archived boolean DEFAULT false,
  p_mrp numeric DEFAULT NULL, p_available_grades text[] DEFAULT ARRAY['A','B','C'],
  p_sold_as text DEFAULT 'loose', p_gram_options integer[] DEFAULT NULL, p_stock_qty numeric DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res record;
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller']);

  INSERT INTO public.products (
    id, name, bn_name, p_a, p_b, p_c, in_stock, category, unit,
    image_url, emoji, archived, mrp, available_grades, sold_as, gram_options, stock_qty, updated_at
  ) VALUES (
    p_id, p_name, p_bn_name, p_p_a, p_p_b, p_p_c, p_in_stock, p_category, p_unit,
    p_image_url, p_emoji, p_archived, p_mrp, coalesce(p_available_grades, ARRAY['A','B','C']),
    coalesce(p_sold_as, 'loose'), p_gram_options, p_stock_qty, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, bn_name = EXCLUDED.bn_name,
    p_a = EXCLUDED.p_a, p_b = EXCLUDED.p_b, p_c = EXCLUDED.p_c,
    in_stock = EXCLUDED.in_stock, category = EXCLUDED.category, unit = EXCLUDED.unit,
    image_url = coalesce(EXCLUDED.image_url, products.image_url),
    emoji = EXCLUDED.emoji, archived = EXCLUDED.archived,
    mrp = EXCLUDED.mrp, available_grades = EXCLUDED.available_grades,
    sold_as = coalesce(EXCLUDED.sold_as, products.sold_as),
    gram_options = EXCLUDED.gram_options, stock_qty = EXCLUDED.stock_qty,
    updated_at = now()
  RETURNING * INTO v_res;

  RETURN to_jsonb(v_res);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_product_admin(
  p_caller_id text, p_caller_pin text, p_product_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller']);
  DELETE FROM public.products WHERE id = p_product_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_all_products_in_stock_admin(
  p_caller_id text, p_caller_pin text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller']);
  UPDATE public.products SET in_stock = true WHERE coalesce(archived, false) = false;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Update staff gateways to use profile_pin_matches
CREATE OR REPLACE FUNCTION public.get_staff_customers(p_caller_id text, p_caller_pin text)
RETURNS TABLE(
  id text, email text, name text, role text, phone text,
  is_super_admin boolean, is_blocked boolean, tier text,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller']);
  RETURN QUERY
  SELECT p.id, p.email, p.name, p.role, p.phone, p.is_super_admin, p.is_blocked, p.tier, p.created_at, p.updated_at
  FROM public.profiles p ORDER BY p.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_orders(p_caller_id text, p_caller_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_caller public.profiles%ROWTYPE; v_result jsonb;
BEGIN
  SELECT * INTO v_caller FROM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller', 'rider']);

  IF v_caller.role = 'rider' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object('order_items', coalesce(items.arr, '[]'::jsonb)) ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO v_result FROM public.orders o
    LEFT JOIN LATERAL (SELECT jsonb_agg(to_jsonb(oi)) AS arr FROM public.order_items oi WHERE oi.order_id = o.id) items ON true
    WHERE o.status IN ('confirmed', 'out_for_delivery');
  ELSE
    SELECT coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object('order_items', coalesce(items.arr, '[]'::jsonb)) ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO v_result FROM public.orders o
    LEFT JOIN LATERAL (SELECT jsonb_agg(to_jsonb(oi)) AS arr FROM public.order_items oi WHERE oi.order_id = o.id) items ON true;
  END IF;

  RETURN v_result;
END;
$$;

-- ── 8. RLS lockdown for anon ──────────────────────────────────
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles','orders','order_items','products','coupons','addresses','notifications','daily_reports','promotional_deals')
      AND 'anon' = ANY(roles)
      AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS profiles_deny_anon ON public.profiles;
CREATE POLICY profiles_deny_anon ON public.profiles FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS profiles_read_own_authenticated ON public.profiles;
CREATE POLICY profiles_read_own_authenticated ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid()::text);

DROP POLICY IF EXISTS orders_deny_anon ON public.orders;
CREATE POLICY orders_deny_anon ON public.orders FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS order_items_deny_anon ON public.order_items;
CREATE POLICY order_items_deny_anon ON public.order_items FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS products_anon_read ON public.products;
CREATE POLICY products_anon_read ON public.products FOR SELECT TO anon
  USING (coalesce(archived, false) = false);

DROP POLICY IF EXISTS products_deny_anon_insert ON public.products;
CREATE POLICY products_deny_anon_insert ON public.products FOR INSERT TO anon WITH CHECK (false);
DROP POLICY IF EXISTS products_deny_anon_update ON public.products;
CREATE POLICY products_deny_anon_update ON public.products FOR UPDATE TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS products_deny_anon_delete ON public.products;
CREATE POLICY products_deny_anon_delete ON public.products FOR DELETE TO anon USING (false);

DROP POLICY IF EXISTS coupons_anon_read ON public.coupons;
CREATE POLICY coupons_anon_read ON public.coupons FOR SELECT TO anon USING (coalesce(valid, active, true) = true);

DROP POLICY IF EXISTS addresses_deny_anon ON public.addresses;
CREATE POLICY addresses_deny_anon ON public.addresses FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS notifications_deny_anon ON public.notifications;
CREATE POLICY notifications_deny_anon ON public.notifications FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS daily_reports_deny_anon ON public.daily_reports;
CREATE POLICY daily_reports_deny_anon ON public.daily_reports FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS promotional_deals_anon_read ON public.promotional_deals;
CREATE POLICY promotional_deals_anon_read ON public.promotional_deals FOR SELECT TO anon USING (is_active = true);

-- ── 9. Grants (customer + staff RPCs for anon PIN auth) ────────
REVOKE ALL ON FUNCTION public.update_user_role_admin(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_user_block_admin(text,text,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_admin(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_order_status_admin(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_order_admin(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_coupon_admin(text,text,text,text,numeric,numeric,boolean,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_product_admin(text,text,text,text,text,numeric,numeric,numeric,boolean,text,text,text,text,boolean,numeric,text[],text,integer[],numeric) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.login_with_pin(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_customer_atomic(text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text,numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_account_exists(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_delivery_handover(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_pin_with_verification(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_customers(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_orders(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_pin(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_profile(text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_orders(text,text,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_order_public(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_order(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_role_admin(text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_block_admin(text,text,text,boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_pin_admin(text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_admin(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status_admin(text,text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_order_admin(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_coupon_admin(text,text,text,text,numeric,numeric,boolean,timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_admin(text,text,text,text,text,numeric,numeric,numeric,boolean,text,text,text,text,boolean,numeric,text[],text,integer[],numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_product_admin(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_all_products_in_stock_admin(text,text) TO anon, authenticated;

-- Register with hashed PIN
CREATE OR REPLACE FUNCTION public.register_customer_atomic(p_name text, p_email text, p_phone text, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  SELECT * INTO v_existing FROM public.profiles
  WHERE lower(trim(email)) = v_norm_email OR (length(v_clean_phone) = 10 AND phone = v_clean_phone) LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This mobile number / email is already registered. Please log in with your PIN.');
  END IF;

  v_new_id := gen_random_uuid()::text;
  INSERT INTO public.profiles (id, email, name, role, phone, pin, pin_hash, is_blocked, tier, is_super_admin, created_at, updated_at)
  VALUES (
    v_new_id, v_norm_email, v_clean_name, 'customer',
    CASE WHEN length(v_clean_phone) = 10 THEN v_clean_phone ELSE NULL END,
    lpad(v_clean_pin, 4, '0'),
    crypt(lpad(v_clean_pin, 4, '0'), gen_salt('bf')),
    false, 'regular', false, now(), now()
  );

  RETURN jsonb_build_object('ok', true, 'user', jsonb_build_object(
    'id', v_new_id, 'email', v_norm_email, 'name', v_clean_name,
    'role', 'customer', 'phone', CASE WHEN length(v_clean_phone) = 10 THEN v_clean_phone ELSE NULL END,
    'createdAt', now()
  ));
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'This mobile number / email is already registered.');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_tier_admin(
  p_caller_id text, p_caller_pin text, p_user_id text, p_tier text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller']);
  PERFORM set_config('app.allow_profile_change', 'true', true);
  UPDATE public.profiles SET tier = p_tier, updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_order_delivery_admin(
  p_caller_id text, p_caller_pin text, p_order_id text, p_delivery_date text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller']);
  UPDATE public.orders SET delivery_date = p_delivery_date, updated_at = now() WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_tier_admin(text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_delivery_admin(text,text,text,text) TO anon, authenticated;
