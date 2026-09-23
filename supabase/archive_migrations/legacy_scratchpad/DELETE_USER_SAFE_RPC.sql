-- ============================================================================
-- GREENVEST — OPTIONAL BULLETPROOF USER DELETION RPC (WITH SAFETY GUARDS)
-- Run in Supabase SQL Editor if you want atomic database-level safeguards
-- ============================================================================

DROP FUNCTION IF EXISTS public.delete_user_admin(text) CASCADE;
DROP FUNCTION IF EXISTS public.delete_user_admin CASCADE;

CREATE OR REPLACE FUNCTION public.delete_user_admin(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phone text;
  v_email text;
  v_due numeric := 0;
  v_active_orders int := 0;
BEGIN
  -- 1. Check if user exists and fetch identifiers
  SELECT email, phone INTO v_email, v_phone
  FROM public.profiles
  WHERE id = p_user_id;

  -- 2. Super Admin Shield (Prevent deleting master admin)
  IF lower(coalesce(v_email, '')) LIKE '%debajoyti007%' 
     OR coalesce(v_phone, '') = '8170859653' 
     OR p_user_id = '8170859653' THEN
    RETURN jsonb_build_object('ok', false, 'error', '🛡️ Super Admin Shield: Master Administrator account cannot be deleted.');
  END IF;

  -- 3. Safety Check: Khata balance
  SELECT coalesce(
    sum(CASE WHEN type = 'debit' THEN amount ELSE -amount END), 0
  ) INTO v_due
  FROM public.khata_ledger
  WHERE user_id = p_user_id;

  IF v_due > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', '⚠️ Cannot delete: Customer has an unpaid Khata balance of ₹' || v_due || '. Settle dues first.');
  END IF;

  -- 4. Safety Check: In-transit orders
  SELECT count(*) INTO v_active_orders
  FROM public.orders
  WHERE user_id = p_user_id
    AND status IN ('pending', 'advance_paid', 'confirmed', 'out_for_delivery');

  IF v_active_orders > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', '⚠️ Cannot delete: Customer has ' || v_active_orders || ' active order(s) in transit.');
  END IF;

  -- 5. Safe Cleanup
  DELETE FROM public.addresses WHERE user_id = p_user_id;
  DELETE FROM public.notifications WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'message', 'User deleted successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_admin(text) TO anon, authenticated, service_role;
