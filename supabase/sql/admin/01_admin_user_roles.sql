-- ============================================================
-- ROLE: ADMIN
-- MODULE: User Management, Role Assignments & Safe Deletion
-- File: supabase/sql/admin/01_admin_user_roles.sql
-- ============================================================
-- Description:
-- Administrator functions for managing store users:
-- 1. update_user_role_admin (Promote customer to rider/seller/admin)
-- 2. update_user_block_admin (Suspend abusive accounts)
-- 3. update_user_khata_admin (Approve Khata credit limits)
-- 4. delete_user_admin (Safe account deletion with balance guards)
-- 5. get_staff_customers (PIN-stripped customer list)
-- ============================================================

-- 1. UPDATE USER ROLE
CREATE OR REPLACE FUNCTION public.update_user_role_admin(
  p_user_id text,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_phone text;
BEGIN
  IF p_role NOT IN ('customer', 'seller', 'admin', 'rider') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (id = p_user_id OR email = lower(p_user_id) OR (phone IS NOT NULL AND v_clean_phone != '' AND phone = v_clean_phone))
      AND is_super_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change role of Super Admin');
  END IF;

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
$$;

GRANT EXECUTE ON FUNCTION public.update_user_role_admin(text, text) TO anon, authenticated;


-- 2. BLOCK / UNBLOCK USER
CREATE OR REPLACE FUNCTION public.update_user_block_admin(
  p_user_id text,
  p_is_blocked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_phone text;
BEGIN
  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (id = p_user_id OR email = lower(p_user_id) OR (phone IS NOT NULL AND v_clean_phone != '' AND phone = v_clean_phone))
      AND is_super_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot block Super Admin');
  END IF;

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
$$;

GRANT EXECUTE ON FUNCTION public.update_user_block_admin(text, boolean) TO anon, authenticated;


-- 3. APPROVE KHATA CREDIT & LIMIT
CREATE OR REPLACE FUNCTION public.update_user_khata_admin(
  p_user_id text,
  p_approved boolean,
  p_credit_limit integer DEFAULT 2000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_phone text;
BEGIN
  v_clean_phone := right(regexp_replace(p_user_id, '\D', '', 'g'), 10);

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
$$;

GRANT EXECUTE ON FUNCTION public.update_user_khata_admin(text, boolean, integer) TO anon, authenticated;


-- 4. SAFE USER DELETION WITH FINANCIAL GUARD
CREATE OR REPLACE FUNCTION public.delete_user_admin(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_email text;
  v_is_super boolean := false;
  v_due numeric := 0;
  v_active_orders int := 0;
BEGIN
  SELECT email, phone, coalesce(is_super_admin, false) INTO v_email, v_phone, v_is_super
  FROM public.profiles
  WHERE id = p_user_id;

  -- 1. Super Admin Shield (Prevents deleting the owner)
  IF v_is_super OR lower(coalesce(v_email, '')) LIKE '%debajoyti007%' THEN
    RETURN jsonb_build_object('ok', false, 'error', '🛡️ Super Admin Shield: Master Administrator account cannot be deleted.');
  END IF;

  -- 2. Safety Check: Block deletion if customer owes money
  SELECT coalesce(
    sum(CASE WHEN type = 'debit' THEN amount ELSE -amount END), 0
  ) INTO v_due
  FROM public.khata_ledger
  WHERE user_id = p_user_id;

  IF v_due > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', '⚠️ Cannot delete: Customer has an unpaid Khata balance of ₹' || v_due || '. Settle dues first.');
  END IF;

  -- 3. Safety Check: Block deletion if customer has orders in transit
  SELECT count(*) INTO v_active_orders
  FROM public.orders
  WHERE user_id = p_user_id
    AND status IN ('pending', 'advance_paid', 'confirmed', 'out_for_delivery');

  IF v_active_orders > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', '⚠️ Cannot delete: Customer has ' || v_active_orders || ' active order(s) in transit.');
  END IF;

  -- 4. Safe Cleanup: Clean addresses, notifications, and profile
  DELETE FROM public.addresses WHERE user_id = p_user_id;
  DELETE FROM public.notifications WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'message', 'User deleted successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_admin(text) TO anon, authenticated;


-- 5. GET STAFF CUSTOMERS (PIN COLUMNS STRIPPED)
CREATE OR REPLACE FUNCTION public.get_staff_customers(
  p_caller_id text,
  p_caller_pin text
)
RETURNS TABLE(
  id text,
  email text,
  name text,
  role text,
  phone text,
  is_super_admin boolean,
  is_blocked boolean,
  tier text,
  khata_approved boolean,
  khata_credit_limit numeric,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_is_auth BOOLEAN := false;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid()::text = p_caller_id THEN
    SELECT * INTO v_caller FROM public.profiles WHERE profiles.id = p_caller_id;
    IF FOUND AND (v_caller.role IN ('admin', 'seller') OR v_caller.is_super_admin = true) THEN
      v_is_auth := true;
    END IF;
  END IF;

  IF NOT v_is_auth THEN
    SELECT * INTO v_caller FROM public.profiles WHERE profiles.id = p_caller_id;
    IF FOUND AND (v_caller.role IN ('admin', 'seller') OR v_caller.is_super_admin = true) THEN
      IF v_caller.pin = p_caller_pin OR LPAD(p_caller_pin, 4, '0') = v_caller.pin THEN
        v_is_auth := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_auth THEN
    RAISE EXCEPTION 'Access Denied: Caller is not an authorized seller or administrator';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.name,
    p.role,
    p.phone,
    p.is_super_admin,
    p.is_blocked,
    p.tier,
    p.khata_approved,
    p.khata_credit_limit,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  ORDER BY p.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_customers(text, text) TO anon, authenticated;
