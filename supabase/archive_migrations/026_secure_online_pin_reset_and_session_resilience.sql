-- ============================================================
-- Migration 026: Secure Online PIN Reset & Staff Session Resilience
-- 1. Restore self-service customer PIN reset with enterprise security:
--    - Rate-limited brute-force lockout (15 mins on 5 failures) via auth_attempts
--    - Anti-weak-PIN filter (rejects 0000, 1234, etc.)
--    - Staff account shielding (super admins and staff cannot be reset via this RPC)
--    - Normalized registered name verification
--    - Strong bcrypt hashing via set_profile_pin_hash (pgcrypto)
-- 2. Resilient verify_staff_caller:
--    - Automatically recognizes active Supabase Auth sessions (auth.uid())
--    - Matches caller by id, auth.uid(), or verified email
--    - Validates PIN/password for anon callers
-- 3. Resilient update_own_pin with explicit search_path
-- ============================================================

-- ── 1. Resilient verify_staff_caller ──────────────────────────
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
  -- A. Check active Supabase Auth session (e.g. Super Admin via Gmail OTP / Magic Link)
  IF auth.uid() IS NOT NULL THEN
    SELECT * INTO v_caller FROM public.profiles
    WHERE id = p_caller_id
       OR id = auth.uid()::text
       OR email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
    ORDER BY (is_super_admin = true) DESC, created_at ASC
    LIMIT 1;

    IF FOUND AND (coalesce(v_caller.is_super_admin, false) = true OR v_caller.role = ANY (p_allowed_roles)) THEN
      RETURN v_caller;
    END IF;
  END IF;

  -- B. Lookup caller by ID or normalized email
  SELECT * INTO v_caller FROM public.profiles
  WHERE id = p_caller_id
     OR lower(trim(email)) = lower(trim(p_caller_id))
  ORDER BY (is_super_admin = true) DESC, created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT (coalesce(v_caller.is_super_admin, false) = true OR v_caller.role = ANY (p_allowed_roles)) THEN
    RAISE EXCEPTION 'Access denied: insufficient staff privileges';
  END IF;

  IF coalesce(v_caller.is_blocked, false) THEN
    RAISE EXCEPTION 'Account is suspended';
  END IF;

  -- C. Validate PIN / password
  IF NOT public.profile_pin_matches(v_caller, p_caller_pin) THEN
    RAISE EXCEPTION 'Invalid staff credentials';
  END IF;

  RETURN v_caller;
END;
$$;

-- ── 2. Secure Online Self-Service PIN Reset ───────────────────
CREATE OR REPLACE FUNCTION public.reset_pin_with_verification(
  p_identifier text,
  p_name text,
  p_new_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_pin text := trim(coalesce(p_new_pin, ''));
  v_clean_phone text;
  v_clean_id text;
  v_input_name text := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
  v_profile public.profiles%ROWTYPE;
  v_key text;
  v_profile_name text;
BEGIN
  -- A. Format validation for new PIN (customers must use exactly 4 numeric digits)
  IF length(v_clean_pin) <> 4 OR v_clean_pin ~ '\D' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'New PIN must be exactly 4 numeric digits.');
  END IF;

  IF v_clean_pin IN ('0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please choose a stronger 4-digit PIN (avoid common sequences like 1234 or 0000).');
  END IF;

  -- B. Identifier normalization
  v_clean_id := lower(trim(coalesce(p_identifier, '')));
  IF v_clean_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please enter your registered mobile number or email.');
  END IF;

  v_clean_phone := right(regexp_replace(v_clean_id, '\D', '', 'g'), 10);
  IF length(v_clean_phone) = 10 THEN
    v_key := v_clean_phone;
  ELSE
    v_key := v_clean_id;
  END IF;

  -- C. Brute-force rate limiting check (15-min lockout after 5 failed attempts)
  IF public.auth_is_locked(v_key) THEN
    RETURN jsonb_build_object('ok', false, 'error', '🔒 Too many failed attempts. Account recovery is temporarily locked for 15 minutes for your security.');
  END IF;

  -- D. Locate registered profile
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE (length(v_clean_phone) = 10 AND phone = v_clean_phone)
     OR (length(v_clean_phone) = 10 AND lower(trim(email)) = (v_clean_phone || '@greenvest.shop'))
     OR lower(trim(email)) = v_clean_id
  ORDER BY (is_super_admin = true) DESC, created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM public.record_auth_attempt(v_key, false);
    RETURN jsonb_build_object('ok', false, 'error', 'Verification failed: No account found matching this mobile number or email.');
  END IF;

  -- E. Staff Account Immunity Shield (Staff & Admin accounts CANNOT be reset via self-service customer PIN reset)
  IF coalesce(v_profile.is_super_admin, false) = true OR v_profile.role IN ('admin', 'seller', 'rider') THEN
    PERFORM public.record_auth_attempt(v_key, false);
    RETURN jsonb_build_object('ok', false, 'error', '🔒 Staff and administrator accounts cannot use customer self-service PIN reset. Please contact Super Administrator.');
  END IF;

  -- F. Check account suspension
  IF coalesce(v_profile.is_blocked, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', '🚫 This account is suspended. Please contact customer support.');
  END IF;

  -- G. Registered Name Verification
  v_profile_name := lower(regexp_replace(trim(coalesce(v_profile.name, '')), '\s+', ' ', 'g'));
  IF v_input_name = '' OR v_profile_name <> v_input_name THEN
    PERFORM public.record_auth_attempt(v_key, false);
    RETURN jsonb_build_object('ok', false, 'error', 'Verification failed: The registered account name does not match account records.');
  END IF;

  -- H. Set new bcrypt hash + legacy PIN
  PERFORM public.set_profile_pin_hash(v_profile.id, v_clean_pin);

  -- I. Clear failed attempts & record success
  DELETE FROM public.auth_attempts WHERE identifier = v_key;
  PERFORM public.record_auth_attempt(v_key, true);

  RETURN jsonb_build_object('ok', true, 'message', '✅ PIN has been reset successfully! Please log in with your new 4-digit PIN.');
END;
$$;

-- ── 3. Resilient update_own_pin with explicit search_path ─────
CREATE OR REPLACE FUNCTION public.update_own_pin(
  p_caller_id text,
  p_old_pin text,
  p_new_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_clean_secret text;
BEGIN
  v_clean_secret := trim(coalesce(p_new_pin, ''));

  SELECT * INTO v_caller FROM public.profiles WHERE id = p_caller_id;
  IF NOT FOUND OR NOT public.profile_pin_matches(v_caller, p_old_pin) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Current credentials are incorrect.');
  END IF;

  -- If user is staff, enforce 8+ characters
  IF coalesce(v_caller.is_super_admin, false) OR v_caller.role IN ('admin', 'seller', 'rider') THEN
    IF length(v_clean_secret) < 8 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Staff password must be at least 8 characters long.');
    END IF;
  ELSE
    -- Customer PIN: exactly 4 digits
    IF length(v_clean_secret) <> 4 OR v_clean_secret ~ '\D' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Customer PIN must be exactly 4 digits.');
    END IF;
  END IF;

  PERFORM public.set_profile_pin_hash(p_caller_id, v_clean_secret);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 4. Grants ─────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.reset_pin_with_verification(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_staff_caller(text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_pin(text, text, text) TO anon, authenticated;
