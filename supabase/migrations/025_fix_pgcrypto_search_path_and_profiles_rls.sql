-- ============================================================
-- Migration 025: Fix pgcrypto search_path & profiles RLS
-- - Fixes function crypt does not exist by adding extensions schema
-- - Drops restrictive profiles_deny_anon that caused new row violates row-level security policy
-- - Allows public read on profiles and blocks direct anon REST updates/deletes
-- - Updates verify_staff_caller and update_user_pin_admin with robust search_path
-- ============================================================

-- ── 1. Fix RLS on profiles ────────────────────────────────────
DROP POLICY IF EXISTS profiles_deny_anon ON public.profiles;
DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_all ON public.profiles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS profiles_anon_no_update ON public.profiles;
CREATE POLICY profiles_anon_no_update ON public.profiles FOR UPDATE TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS profiles_anon_no_delete ON public.profiles;
CREATE POLICY profiles_anon_no_delete ON public.profiles FOR DELETE TO anon USING (false);

-- ── 2. Fix profile_pin_matches with extensions schema ─────────
CREATE OR REPLACE FUNCTION public.profile_pin_matches(v_profile public.profiles, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_pin text := trim(coalesce(p_pin, ''));
BEGIN
  IF v_pin = '' THEN
    RETURN false;
  END IF;

  -- 1. Check bcrypt hash first
  IF v_profile.pin_hash IS NOT NULL AND v_profile.pin_hash <> '' THEN
    IF extensions.crypt(v_pin, v_profile.pin_hash) = v_profile.pin_hash THEN
      RETURN true;
    END IF;
    -- Fallback for legacy 4-digit padded PIN
    IF length(v_pin) <= 4 AND extensions.crypt(lpad(v_pin, 4, '0'), v_profile.pin_hash) = v_profile.pin_hash THEN
      RETURN true;
    END IF;
  END IF;

  -- 2. Direct match (plain-text fallback during transition)
  IF v_profile.pin = v_pin THEN
    RETURN true;
  END IF;

  -- 3. Customer 4-digit legacy padding variations
  IF length(v_pin) <= 4 THEN
    IF v_profile.pin = lpad(v_pin, 4, '0')
       OR v_profile.pin = rpad(v_pin, 6, '0')
       OR (length(v_profile.pin) = 6 AND substr(v_profile.pin, 1, 4) = v_pin) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- ── 3. Fix set_profile_pin_hash with extensions schema ────────
CREATE OR REPLACE FUNCTION public.set_profile_pin_hash(p_profile_id text, p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean text := trim(coalesce(p_pin, ''));
BEGIN
  UPDATE public.profiles
  SET pin = v_clean,
      pin_hash = extensions.crypt(v_clean, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = p_profile_id;
END;
$$;

-- ── 4. Fix register_customer_atomic with extensions schema ────
CREATE OR REPLACE FUNCTION public.register_customer_atomic(p_name text, p_email text, p_phone text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
  IF length(v_clean_pin) <> 4 OR v_clean_pin ~ '\\D' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Security PIN must be exactly 4 digits.');
  END IF;

  v_clean_phone := right(regexp_replace(coalesce(p_phone, ''), '\\D', '', 'g'), 10);
  IF length(v_clean_phone) <> 10 THEN
    v_clean_phone := right(regexp_replace(coalesce(p_email, ''), '\\D', '', 'g'), 10);
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
    extensions.crypt(lpad(v_clean_pin, 4, '0'), extensions.gen_salt('bf')),
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

-- ── 5. Fix login_with_pin with extensions schema ──────────────
CREATE OR REPLACE FUNCTION public.login_with_pin(p_identifier text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
  v_clean_phone := right(regexp_replace(v_clean_id, '\\D', '', 'g'), 10);
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

  IF v_profile.role IN ('admin', 'seller', 'rider') AND length(v_pin) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Staff login requires an 8+ character password.');
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'Invalid credentials');
END;
$$;

-- ── 6. Fix verify_staff_caller & verify_customer_caller ───────
CREATE OR REPLACE FUNCTION public.verify_staff_caller(
  p_caller_id text,
  p_caller_pin text,
  p_allowed_roles text[] DEFAULT ARRAY['admin', 'seller']
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
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
SET search_path = public, extensions, auth
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

-- ── 7. Fix update_user_pin_admin with robust lookup ──────────
CREATE OR REPLACE FUNCTION public.update_user_pin_admin(
  p_caller_id text, p_caller_pin text, p_user_id text, p_new_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_target public.profiles%ROWTYPE;
  v_clean_secret text;
  v_clean_phone text;
BEGIN
  v_caller := public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller']);
  v_clean_secret := trim(coalesce(p_new_pin, ''));
  v_clean_phone := right(regexp_replace(p_user_id, '\\D', '', 'g'), 10);

  SELECT * INTO v_target FROM public.profiles
  WHERE id = p_user_id
     OR (length(v_clean_phone) = 10 AND phone = v_clean_phone)
     OR lower(email) = lower(p_user_id)
     OR (length(v_clean_phone) = 10 AND lower(email) = (v_clean_phone || '@greenvest.shop'))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target user not found');
  END IF;

  IF v_target.is_super_admin OR v_target.role IN ('admin', 'seller', 'rider') THEN
    IF NOT coalesce(v_caller.is_super_admin, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Only Super Admin can reset passwords for staff (admin, seller, rider).');
    END IF;
    IF length(v_clean_secret) < 8 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Staff password must be at least 8 characters long.');
    END IF;
  ELSE
    IF length(v_clean_secret) <> 4 OR v_clean_secret ~ '\\D' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Customer PIN must be exactly 4 digits.');
    END IF;
  END IF;

  PERFORM public.set_profile_pin_hash(v_target.id, v_clean_secret);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 8. Fix handle_new_user search_path ────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (NEW.id, coalesce(NEW.email, ''), coalesce(NEW.raw_user_meta_data->>'name', split_part(coalesce(NEW.email, 'user'), '@', 1)), 'customer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── 9. Grants ──────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.set_profile_pin_hash(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_pin_matches(public.profiles, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_customer_atomic(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_with_pin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_staff_caller(text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_customer_caller(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_pin_admin(text, text, text, text) TO anon, authenticated;
