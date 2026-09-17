-- ============================================================
-- GreenVest Migration 008: Bulletproof Auth, Unique Constraints & Safe PIN Reset
-- Applied: September 2026
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. Create unique indexes on phone and email
-- ─────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique_idx 
  ON public.profiles(phone) 
  WHERE phone IS NOT NULL AND phone <> '';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx 
  ON public.profiles(lower(trim(email)));

-- ─────────────────────────────────────────────
-- 2. Smart login_with_pin RPC (supports raw phone, +91, gmail, or synthetic email)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.login_with_pin(p_identifier text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Extract last 10 digits if digits exist
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

  -- Validate PIN (exact 4-digit, zero-padded, or right-padded 6-char compatibility)
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
      'tier',               coalesce(v_profile.tier, 'regular'),
      'khata_approved',     coalesce(v_profile.khata_approved, false),
      'khata_credit_limit', coalesce(v_profile.khata_credit_limit, 2000)
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'Invalid credentials');
END;
$$;

-- ─────────────────────────────────────────────
-- 3. Atomic registration RPC (prevents race conditions and duplicate phones)
-- ─────────────────────────────────────────────
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
  -- 1. Validation
  IF v_clean_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Full Name is required.');
  END IF;

  IF length(v_clean_pin) <> 4 OR v_clean_pin ~ '\D' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Security PIN must be exactly 4 digits.');
  END IF;

  -- Clean phone to 10 digits
  v_clean_phone := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  IF length(v_clean_phone) <> 10 THEN
    v_clean_phone := right(regexp_replace(coalesce(p_email, ''), '\D', '', 'g'), 10);
  END IF;

  -- Determine email
  v_norm_email := lower(trim(coalesce(p_email, '')));
  IF v_norm_email = '' OR position('@' in v_norm_email) = 0 THEN
    IF length(v_clean_phone) = 10 THEN
      v_norm_email := v_clean_phone || '@greenvest.shop';
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Please provide a valid 10-digit mobile number or email address.');
    END IF;
  END IF;

  -- 2. Duplicate Check (Atomic, checks both phone and email)
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

  -- 3. Atomic Insert
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
    khata_approved,
    khata_credit_limit,
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
    2000,
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
$$;

-- ─────────────────────────────────────────────
-- 4. Secure Reset PIN RPC (Allows unauthenticated password reset with name check)
-- ─────────────────────────────────────────────
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
  v_profile profiles%ROWTYPE;
  v_clean_phone text;
  v_clean_id text;
  v_clean_pin text := trim(coalesce(p_new_pin, ''));
  v_input_name text := lower(trim(coalesce(p_name, '')));
  v_db_name text;
BEGIN
  IF length(v_clean_pin) <> 4 OR v_clean_pin ~ '\D' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'New PIN must be exactly 4 digits.');
  END IF;

  IF v_input_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please enter your registered Full Name / Username.');
  END IF;

  v_clean_id := lower(trim(coalesce(p_identifier, '')));
  v_clean_phone := right(regexp_replace(v_clean_id, '\D', '', 'g'), 10);

  SELECT * INTO v_profile
  FROM profiles
  WHERE lower(trim(email)) = v_clean_id
     OR (length(v_clean_phone) = 10 AND phone = v_clean_phone)
     OR (length(v_clean_phone) = 10 AND lower(trim(email)) = (v_clean_phone || '@greenvest.shop'))
  ORDER BY (role = 'admin') DESC, created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account not found with this mobile number or email.');
  END IF;

  IF v_profile.is_super_admin THEN
    RETURN jsonb_build_object('ok', false, 'error', '🛡️ Super Admin Shield: Master Administrator PIN cannot be modified from public forms.');
  END IF;

  -- Verify registered name
  v_db_name := lower(trim(coalesce(v_profile.name, '')));
  IF v_db_name <> '' AND v_input_name <> '' 
     AND position(v_input_name in v_db_name) = 0 
     AND position(v_db_name in v_input_name) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', '❌ Security Verification Failed: Account holder name does not match our records. Please contact Admin.'
    );
  END IF;

  -- Update PIN
  UPDATE profiles
  SET pin = v_clean_pin, updated_at = now()
  WHERE id = v_profile.id;

  RETURN jsonb_build_object('ok', true, 'message', 'PIN updated successfully');
END;
$$;

-- ─────────────────────────────────────────────
-- 5. Safe Account Exists Check RPC (no sensitive data exposed)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_account_exists(p_identifier text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_id text := lower(trim(coalesce(p_identifier, '')));
  v_clean_phone text := right(regexp_replace(v_clean_id, '\D', '', 'g'), 10);
  v_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE lower(trim(email)) = v_clean_id
       OR (length(v_clean_phone) = 10 AND phone = v_clean_phone)
       OR (length(v_clean_phone) = 10 AND lower(trim(email)) = (v_clean_phone || '@greenvest.shop'))
  ) INTO v_exists;
  RETURN v_exists;
END;
$$;

-- ─────────────────────────────────────────────
-- 6. Permissions
-- ─────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.login_with_pin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_with_pin(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.register_customer_atomic(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_customer_atomic(text, text, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.reset_pin_with_verification(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_pin_with_verification(text, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.check_account_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_account_exists(text) TO anon, authenticated;

