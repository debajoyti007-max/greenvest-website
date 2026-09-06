-- ============================================================
-- GreenVest Migration 012: Fix Block/Unblock & Khata Trigger Conflicts
-- Applied: September 2026
-- Fixes:
--   1. Admin cannot unblock users (trigger throws "Self-unblock denied")
--   2. Admin cannot approve Khata (trigger throws "Khata self-approval denied")
-- Solution: Dedicated SECURITY DEFINER RPCs that set the session flag
--           before updating, so the trigger recognises them as authorized.
-- ============================================================

-- 1. Update trigger to use unified flag name + allow for all protected fields
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

  -- Khata self-approval guard
  IF NEW.khata_approved IS DISTINCT FROM OLD.khata_approved
     AND NEW.khata_approved = TRUE AND OLD.khata_approved = FALSE THEN
    RAISE EXCEPTION 'Khata self-approval denied. Admin approval required.';
  END IF;

  IF NEW.khata_credit_limit IS DISTINCT FROM OLD.khata_credit_limit
     AND NEW.khata_credit_limit > COALESCE(OLD.khata_credit_limit, 0) THEN
    RAISE EXCEPTION 'Khata credit limit increase denied. Admin approval required.';
  END IF;

  -- Self-unblock guard
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
     AND OLD.is_blocked = TRUE AND NEW.is_blocked = FALSE THEN
    RAISE EXCEPTION 'Self-unblock denied. Contact support.';
  END IF;

  RETURN NEW;
END;
$func$;

-- 2. Admin RPC: Toggle block/unblock for a user
CREATE OR REPLACE FUNCTION public.update_user_block_admin(p_user_id text, p_is_blocked boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_clean_phone text;
BEGIN
  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);

  -- Cannot block the Super Admin
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (id = p_user_id OR email = lower(p_user_id) OR (phone IS NOT NULL AND v_clean_phone != '' AND phone = v_clean_phone))
      AND is_super_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot block Super Admin');
  END IF;

  -- Set session flag so trigger allows this
  PERFORM set_config('app.allow_profile_change', 'true', true);

  UPDATE public.profiles
  SET is_blocked = p_is_blocked, updated_at = now()
  WHERE (id = p_user_id
     OR (email IS NOT NULL AND email = lower(p_user_id))
     OR (phone IS NOT NULL AND v_clean_phone != '' AND phone = v_clean_phone))
    AND is_super_admin = false;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'is_blocked', p_is_blocked);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'User not found');
END;
$func$;

-- 3. Admin RPC: Approve or revoke Khata for a user
CREATE OR REPLACE FUNCTION public.update_user_khata_admin(p_user_id text, p_approved boolean, p_credit_limit integer DEFAULT 2000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_clean_phone text;
BEGIN
  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);

  -- Set session flag so trigger allows this
  PERFORM set_config('app.allow_profile_change', 'true', true);

  UPDATE public.profiles
  SET khata_approved = p_approved,
      khata_credit_limit = p_credit_limit,
      updated_at = now()
  WHERE (id = p_user_id
     OR (email IS NOT NULL AND email = lower(p_user_id))
     OR (phone IS NOT NULL AND v_clean_phone != '' AND phone = v_clean_phone));

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'khata_approved', p_approved, 'credit_limit', p_credit_limit);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'User not found');
END;
$func$;

-- 4. Also update update_user_role_admin to use the new unified flag name
CREATE OR REPLACE FUNCTION public.update_user_role_admin(p_user_id text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_clean_phone text;
BEGIN
  IF p_role NOT IN ('customer', 'seller', 'admin', 'rider') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);

  -- Super Admin Protection
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (id = p_user_id OR email = lower(p_user_id) OR (phone IS NOT NULL AND v_clean_phone != '' AND phone = v_clean_phone))
      AND is_super_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change role of Super Admin');
  END IF;

  -- Set session flag so trigger allows this
  PERFORM set_config('app.allow_profile_change', 'true', true);

  UPDATE public.profiles
  SET role = p_role, updated_at = now()
  WHERE (id = p_user_id
     OR (email IS NOT NULL AND email = lower(p_user_id))
     OR (phone IS NOT NULL AND v_clean_phone != '' AND phone = v_clean_phone))
    AND is_super_admin = false;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'role', p_role);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'User not found');
END;
$func$;

-- 5. Grant RPCs to authenticated users
GRANT EXECUTE ON FUNCTION public.update_user_block_admin(text, boolean) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_user_khata_admin(text, boolean, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_user_role_admin(text, text) TO authenticated, anon;
