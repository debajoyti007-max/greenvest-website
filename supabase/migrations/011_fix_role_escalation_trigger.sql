-- ============================================================
-- GreenVest Migration 011: Fix Role Escalation Trigger Conflict
-- Applied: September 2026
-- Fixes: prevent_profile_escalation trigger was inadvertently
-- blocking the legitimate update_user_role_admin RPC and admin users.
-- ============================================================

-- 1. Authorize transaction inside update_user_role_admin
CREATE OR REPLACE FUNCTION public.update_user_role_admin(p_user_id text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS 
DECLARE
  v_clean_phone text;
BEGIN
  IF p_role NOT IN ('customer', 'seller', 'admin', 'rider') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);

  -- 🛡️ Super Admin Protection
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (id = p_user_id OR email = lower(p_user_id) OR (phone IS NOT NULL AND v_clean_phone != '' AND phone = v_clean_phone))
      AND is_super_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change role of Super Admin');
  END IF;

  -- Set session flag so trigger knows this is legitimate admin RPC
  PERFORM set_config('app.allow_role_change', 'true', true);

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
;

-- 2. Update trigger to allow authorized RPC and admin callers
CREATE OR REPLACE FUNCTION public.prevent_profile_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS 
BEGIN
  -- If authorized by update_user_role_admin RPC, allow
  IF current_setting('app.allow_role_change', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- If caller is service_role or admin, allow
  IF auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()::text AND role = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  -- Block direct unprivileged escalation
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.role IN ('admin', 'seller', 'rider') AND OLD.role = 'customer' THEN
      RAISE EXCEPTION 'Role escalation denied. Use the admin panel to change roles.';
    END IF;
  END IF;

  IF NEW.khata_approved IS DISTINCT FROM OLD.khata_approved
     AND NEW.khata_approved = TRUE AND OLD.khata_approved = FALSE THEN
    RAISE EXCEPTION 'Khata self-approval denied. Admin approval required.';
  END IF;

  IF NEW.khata_credit_limit IS DISTINCT FROM OLD.khata_credit_limit
     AND NEW.khata_credit_limit > COALESCE(OLD.khata_credit_limit, 0) THEN
    RAISE EXCEPTION 'Khata credit limit increase denied. Admin approval required.';
  END IF;

  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
     AND OLD.is_blocked = TRUE AND NEW.is_blocked = FALSE THEN
    RAISE EXCEPTION 'Self-unblock denied. Contact support.';
  END IF;

  RETURN NEW;
END;
;

GRANT EXECUTE ON FUNCTION public.update_user_role_admin(text, text) TO authenticated, anon;
