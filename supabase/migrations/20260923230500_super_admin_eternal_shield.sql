-- ============================================================
-- Migration 030: Super Admin Eternal Shield & Anti-Deletion Lock
-- 1. trg_prevent_super_admin_delete:
--    - BEFORE DELETE database trigger on public.profiles.
--    - Rejects ANY delete query on Super Admin (is_super_admin = true
--      OR email = 'debajoyti007@gmail.com').
-- 2. delete_user_admin:
--    - Strictly enforces that Super Admin cannot be deleted.
-- ============================================================

-- ── 1. Database-Level Trigger: Eternal Anti-Deletion Shield ──
CREATE OR REPLACE FUNCTION public.trg_prevent_super_admin_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF coalesce(OLD.is_super_admin, false) = true
     OR lower(trim(coalesce(OLD.email, ''))) = 'debajoyti007@gmail.com' THEN
    RAISE EXCEPTION 'Security Violation: Super Admin account cannot be deleted under any circumstances.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_super_admin_delete ON public.profiles;
CREATE TRIGGER trg_prevent_super_admin_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_prevent_super_admin_delete();

REVOKE EXECUTE ON FUNCTION public.trg_prevent_super_admin_delete() FROM anon, authenticated, public;

-- ── 2. Update delete_user_admin RPC with Strict Guard ───────
CREATE OR REPLACE FUNCTION public.delete_user_admin(
  p_caller_id text, p_caller_pin text, p_user_id text
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
  v_active_orders int;
BEGIN
  v_caller := public.verify_staff_caller(p_caller_id, p_caller_pin, ARRAY['admin']);
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

  -- Super Admin Shield: Cannot be deleted by anyone, ever
  IF coalesce(v_target.is_super_admin, false) = true
     OR lower(trim(coalesce(v_target.email, ''))) = 'debajoyti007@gmail.com' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Super Admin account cannot be deleted');
  END IF;

  -- Only Super Admin can delete other administrators
  IF v_target.role = 'admin' AND NOT coalesce(v_caller.is_super_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only Super Admin can delete an administrator account');
  END IF;

  SELECT count(*) INTO v_active_orders FROM public.orders
  WHERE user_id = v_target.id
    AND status IN ('pending', 'advance_paid', 'confirmed', 'out_for_delivery');

  IF v_active_orders > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Customer has active orders in transit');
  END IF;

  DELETE FROM public.addresses WHERE user_id = v_target.id;
  DELETE FROM public.notifications WHERE user_id = v_target.id;
  DELETE FROM public.profiles WHERE id = v_target.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_admin(text, text, text) TO anon, authenticated;
