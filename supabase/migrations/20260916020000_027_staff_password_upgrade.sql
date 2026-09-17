-- ============================================================
-- Migration 027: Staff Password Upgrade & Transition Gate
-- 1. upgrade_staff_password RPC: Allows staff to upgrade from 4-digit PIN to 8+ char password
-- 2. login_with_pin update: Allows transition login for old 4-digit staff, flagging needs_password_upgrade
-- ============================================================

-- ── 1. upgrade_staff_password RPC ────────────────────────────
CREATE OR REPLACE FUNCTION public.upgrade_staff_password(
  p_caller_id text,
  p_old_secret text,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_clean_pass text := trim(coalesce(p_new_password, ''));
  v_old_secret text := trim(coalesce(p_old_secret, ''));
BEGIN
  -- 1. Locate caller
  SELECT * INTO v_caller FROM public.profiles WHERE id = p_caller_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User account not found.');
  END IF;

  -- 2. Check if caller is staff
  IF NOT (coalesce(v_caller.is_super_admin, false) = true OR v_caller.role IN ('admin', 'seller', 'rider')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Password upgrade is only applicable to staff and administrator accounts.');
  END IF;

  -- 3. Verify old credentials:
  --    Priority 1: Active Supabase session (auth.uid) matches caller — most trusted.
  --    Priority 2: profile_pin_matches verifies old_secret against bcrypt pin_hash OR plain pin.
  --    This handles staff with 4-digit PINs (plain/hashed) AND staff who partially upgraded to 8+ chars.
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid()::text = p_caller_id)
    OR
    (v_old_secret <> '' AND public.profile_pin_matches(v_caller, v_old_secret))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Current credentials are incorrect. Please re-enter your current PIN or password.');
  END IF;

  -- 4. Validate new password length
  IF length(v_clean_pass) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Staff password must be at least 8 characters long.');
  END IF;

  -- 5. Reject common weak passwords
  IF lower(v_clean_pass) IN ('12345678', 'password', 'password123', 'admin1234', 'qwerty1234', '1234567890') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please choose a stronger password (avoid common patterns like 12345678).');
  END IF;

  -- 6. Permanently set new bcrypt hash & wipe old 4-digit PIN
  PERFORM public.set_profile_pin_hash(p_caller_id, v_clean_pass);

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Staff password has been upgraded successfully! Your old 4-digit PIN has been permanently deactivated.'
  );
END;
$$;

-- ── 2. Update login_with_pin with needs_password_upgrade flag ──
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
  v_is_staff boolean;
  v_needs_upgrade boolean := false;
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

  v_is_staff := (v_profile.role IN ('admin', 'seller', 'rider') OR coalesce(v_profile.is_super_admin, false) = true);

  IF public.profile_pin_matches(v_profile, v_pin) THEN
    PERFORM public.record_auth_attempt(v_key, true);

    -- Flag if staff member is still on a legacy <= 4 character PIN
    IF v_is_staff THEN
      IF length(v_pin) <= 4 OR (v_profile.pin IS NOT NULL AND length(v_profile.pin) <= 4) THEN
        v_needs_upgrade := true;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'id', v_profile.id,
      'email', v_profile.email,
      'name', v_profile.name,
      'role', v_profile.role,
      'phone', v_profile.phone,
      'is_super_admin', coalesce(v_profile.is_super_admin, false),
      'is_blocked', coalesce(v_profile.is_blocked, false),
      'tier', coalesce(v_profile.tier, 'regular'),
      'needs_password_upgrade', v_needs_upgrade
    );
  END IF;

  PERFORM public.record_auth_attempt(v_key, false);

  -- Helpful hint if staff tries to enter a 4-digit PIN after upgrading to 8+ chars
  IF v_is_staff AND v_profile.pin IS NOT NULL AND length(v_profile.pin) >= 8 AND length(v_pin) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Staff login requires your 8+ character password.');
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'Invalid credentials');
END;
$$;

-- ── 3. Grants ─────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.upgrade_staff_password(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_with_pin(text, text) TO anon, authenticated;
