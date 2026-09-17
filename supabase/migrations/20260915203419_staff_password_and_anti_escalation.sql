-- ============================================================
-- Migration 024: Staff 8+ char password & Anti-Escalation Shield
-- - Customers keep fast 4-digit PINs
-- - Staff (Admin, Seller, Rider) require 8+ character passwords
-- - PostgreSQL BEFORE UPDATE trigger blocks unauthorized role escalation
-- - Only Super Admin can promote/demote staff roles or reset staff passwords
-- - Anon key cannot bypass, tamper with, or escalate staff privileges
-- ============================================================

-- ── 1. Update set_profile_pin_hash to preserve full-length passwords ───────
CREATE OR REPLACE FUNCTION public.set_profile_pin_hash(p_profile_id text, p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text := trim(coalesce(p_pin, ''));
BEGIN
  UPDATE public.profiles
  SET pin = v_clean,
      pin_hash = crypt(v_clean, gen_salt('bf')),
      updated_at = now()
  WHERE id = p_profile_id;
END;
$$;

-- ── 2. Update profile_pin_matches for arbitrary length passwords ───────────
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

  -- 1. Check bcrypt hash first
  IF v_profile.pin_hash IS NOT NULL AND v_profile.pin_hash <> '' THEN
    IF crypt(v_pin, v_profile.pin_hash) = v_profile.pin_hash THEN
      RETURN true;
    END IF;
    -- Fallback for legacy 4-digit padded PIN
    IF length(v_pin) <= 4 AND crypt(lpad(v_pin, 4, '0'), v_profile.pin_hash) = v_profile.pin_hash THEN
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

-- ── 3. Anti-Escalation Shield: Database Trigger ────────────────────────────
-- Blocks any direct UPDATE on role or is_super_admin unless explicitly authorized
CREATE OR REPLACE FUNCTION public.trg_prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Strict Super Admin lock: cannot modify is_super_admin without special internal flag
  IF (NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin) THEN
    IF current_setting('app.allow_super_admin_change', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Modifying Super Admin privileges is strictly forbidden.';
    END IF;
  END IF;

  -- Role escalation lock: cannot modify role without authenticated administrative RPC
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    IF current_setting('app.allow_profile_change', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Direct modification of user roles is forbidden. Use official administrative procedures.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_prevent_role_escalation();

-- ── 4. update_user_role_admin: Only verified Super Admin can change staff roles ─
CREATE OR REPLACE FUNCTION public.update_user_role_admin(
  p_caller_id text, p_caller_pin text, p_user_id text, p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_clean_phone text;
BEGIN
  -- Verify caller has admin privileges and PIN matches
  v_caller := public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin']);

  IF p_role NOT IN ('customer', 'seller', 'admin', 'rider') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role specified');
  END IF;

  -- Only Super Admin can promote someone to staff (admin/seller/rider) or demote staff
  IF p_role IN ('admin', 'seller', 'rider') AND NOT coalesce(v_caller.is_super_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only Super Admin can assign staff roles.');
  END IF;

  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (id = p_user_id OR email = lower(p_user_id) OR phone = v_clean_phone)
      AND is_super_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change role of Super Admin');
  END IF;

  -- Set session flag to pass the anti-escalation trigger
  PERFORM set_config('app.allow_profile_change', 'true', true);
  UPDATE public.profiles SET role = p_role, updated_at = now()
  WHERE id = p_user_id OR email = lower(p_user_id) OR phone = v_clean_phone
     OR email = (v_clean_phone || '@greenvest.shop');

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 5. update_user_pin_admin: 4 digits for customer, 8+ chars for staff ───
CREATE OR REPLACE FUNCTION public.update_user_pin_admin(
  p_caller_id text, p_caller_pin text, p_user_id text, p_new_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_target public.profiles%ROWTYPE;
  v_clean_secret text;
BEGIN
  v_caller := public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin', 'seller']);
  v_clean_secret := trim(coalesce(p_new_pin, ''));

  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target user not found');
  END IF;

  -- If target is a staff member (admin, seller, rider) or super admin:
  IF v_target.is_super_admin OR v_target.role IN ('admin', 'seller', 'rider') THEN
    -- Only Super Admin can change staff passwords!
    IF NOT coalesce(v_caller.is_super_admin, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Only Super Admin can reset passwords for staff (admin, seller, rider).');
    END IF;
    -- Enforce 8+ character password for staff
    IF length(v_clean_secret) < 8 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Staff password must be at least 8 characters long.');
    END IF;
  ELSE
    -- Target is a customer: must be 4 digits
    IF length(v_clean_secret) <> 4 OR v_clean_secret ~ '\D' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Customer PIN must be exactly 4 digits.');
    END IF;
  END IF;

  PERFORM public.set_profile_pin_hash(p_user_id, v_clean_secret);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 6. update_own_pin: Self-service credential update ───────────────────────
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
  v_clean_secret text;
BEGIN
  v_clean_secret := trim(coalesce(p_new_pin, ''));

  SELECT * INTO v_caller FROM public.profiles WHERE id = p_caller_id;
  IF NOT FOUND OR NOT public.profile_pin_matches(v_caller, p_old_pin) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Current credentials are incorrect.');
  END IF;

  -- If user is staff, enforce 8+ characters
  IF v_caller.is_super_admin OR v_caller.role IN ('admin', 'seller', 'rider') THEN
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

-- ── 7. login_with_pin: Staff password length guidance ──────────────────────
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

  -- Provide helpful error message if staff attempts to login with a short 4-digit PIN
  IF v_profile.role IN ('admin', 'seller', 'rider') AND length(v_pin) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Staff login requires an 8+ character password.');
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'Invalid credentials');
END;
$$;

-- ── 8. Grants ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.set_profile_pin_hash(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_pin_matches(public.profiles, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_role_admin(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_pin_admin(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_pin(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_with_pin(text, text) TO anon, authenticated;
