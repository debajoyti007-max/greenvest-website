-- ============================================================
-- Migration 029: Tiered Role Delegation & Admin Customer PIN Reset
-- 1. update_user_role_admin:
--    - Requires caller to be an admin (verify_staff_caller). Sellers CANNOT assign roles.
--    - Protects Super Admin: Nobody can modify Super Admin accounts.
--    - Admin Role Guard: Only Super Admin can promote someone to Admin or revoke Admin.
--    - Normal Admins CAN promote/demote Seller and Rider to/from Customer.
-- 2. update_user_pin_admin:
--    - Requires caller to be an admin (verify_staff_caller).
--    - Staff password reset: Allowed for Super Admin OR self-reset (caller resetting own password).
--    - Customer PIN reset: Allowed for any Admin (Normal Admin or Super Admin) (4 digits).
-- ============================================================

-- ── 1. update_user_role_admin ──────────────────────────────
CREATE OR REPLACE FUNCTION public.update_user_role_admin(
  p_caller_id text, p_caller_pin text, p_user_id text, p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_target public.profiles%ROWTYPE;
  v_clean_phone text;
BEGIN
  -- 1. Verify caller has admin privileges and valid credentials
  v_caller := public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin']);

  IF p_role NOT IN ('customer', 'seller', 'admin', 'rider') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role specified');
  END IF;

  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);
  SELECT * INTO v_target FROM public.profiles
  WHERE id = p_user_id
     OR (length(v_clean_phone) = 10 AND phone = v_clean_phone)
     OR lower(email) = lower(p_user_id)
     OR (length(v_clean_phone) = 10 AND lower(email) = (v_clean_phone || '@greenvest.shop'))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
  END IF;

  -- 2. Super Admin Shield: Master Administrator cannot be modified
  IF coalesce(v_target.is_super_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change role of Super Admin');
  END IF;

  -- 3. Admin Role Guard: ONLY Super Admin can grant or revoke the Admin role!
  -- Normal admins CANNOT make another admin, nor demote an existing admin.
  IF (p_role = 'admin' OR v_target.role = 'admin') AND NOT coalesce(v_caller.is_super_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only Super Admin can grant or revoke the Admin role.');
  END IF;

  -- 4. Tiered Delegation: Normal Admins CAN assign 'seller' and 'rider', and demote them to 'customer'
  PERFORM set_config('app.allow_profile_change', 'true', true);
  UPDATE public.profiles SET role = p_role, updated_at = now()
  WHERE id = v_target.id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_role_admin(text, text, text, text) TO anon, authenticated;

-- ── 2. update_user_pin_admin ──────────────────────────────
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
  -- Caller must be an admin (Normal Admin or Super Admin)
  v_caller := public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin']);
  v_clean_secret := trim(coalesce(p_new_pin, ''));
  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);

  SELECT * INTO v_target FROM public.profiles
  WHERE id = p_user_id
     OR (length(v_clean_phone) = 10 AND phone = v_clean_phone)
     OR lower(email) = lower(p_user_id)
     OR (length(v_clean_phone) = 10 AND lower(email) = (v_clean_phone || '@greenvest.shop'))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target user not found');
  END IF;

  -- If target is Staff (admin, seller, rider) or Super Admin:
  IF v_target.is_super_admin OR v_target.role IN ('admin', 'seller', 'rider') THEN
    -- Admin CAN reset their OWN password (v_target.id = v_caller.id)
    -- OR caller must be Super Admin to reset another staff member's password
    IF v_target.id <> v_caller.id AND NOT coalesce(v_caller.is_super_admin, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Only Super Admin can reset passwords for other staff members.');
    END IF;
    IF length(v_clean_secret) < 8 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Staff password must be at least 8 characters long.');
    END IF;
  ELSE
    -- Target is a Customer: Any admin (Normal or Super Admin) can reset customer PIN
    IF length(v_clean_secret) <> 4 OR v_clean_secret ~ '\D' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Customer PIN must be exactly 4 digits.');
    END IF;
  END IF;

  PERFORM public.set_profile_pin_hash(v_target.id, v_clean_secret);
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_pin_admin(text, text, text, text) TO anon, authenticated;
