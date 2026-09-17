-- ============================================================
-- Migration 015: Staff Security Gateway (Zero-Leak RPCs)
-- Applied: September 2026
-- Enables Sellers, sub-Admins, and Riders with Phone+PIN to view
-- appropriate data securely without exposing PINs or opening
-- raw tables to public web scrapers.
-- ============================================================

-- 1. Secure Staff Customers Gateway
CREATE OR REPLACE FUNCTION public.get_staff_customers(p_caller_id text, p_caller_pin text)
RETURNS TABLE (
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
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS \$\$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_is_auth BOOLEAN := false;
BEGIN
  -- 1. Check if caller is authenticated via Supabase Auth (e.g. Super Admin)
  IF auth.uid() IS NOT NULL AND auth.uid()::text = p_caller_id THEN
    SELECT * INTO v_caller FROM public.profiles WHERE profiles.id = p_caller_id;
    IF FOUND AND (v_caller.role IN ('admin', 'seller') OR v_caller.is_super_admin = true) THEN
      v_is_auth := true;
    END IF;
  END IF;

  -- 2. Check if caller matches by ID and PIN (Phone+PIN staff)
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

  -- Return all profiles WITHOUT the PIN column!
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
\$\$;

GRANT EXECUTE ON FUNCTION public.get_staff_customers(text, text) TO anon, authenticated;

-- 2. Secure Staff Orders Gateway
CREATE OR REPLACE FUNCTION public.get_staff_orders(p_caller_id text, p_caller_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS \$\$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_is_auth BOOLEAN := false;
  v_result jsonb;
BEGIN
  -- Check Supabase Auth session (Super Admin)
  IF auth.uid() IS NOT NULL AND auth.uid()::text = p_caller_id THEN
    SELECT * INTO v_caller FROM public.profiles WHERE profiles.id = p_caller_id;
    IF FOUND AND (v_caller.role IN ('admin', 'seller', 'rider') OR v_caller.is_super_admin = true) THEN
      v_is_auth := true;
    END IF;
  END IF;

  -- Check PIN session (Phone+PIN staff)
  IF NOT v_is_auth THEN
    SELECT * INTO v_caller FROM public.profiles WHERE profiles.id = p_caller_id;
    IF FOUND AND (v_caller.role IN ('admin', 'seller', 'rider') OR v_caller.is_super_admin = true) THEN
      IF v_caller.pin = p_caller_pin OR LPAD(p_caller_pin, 4, '0') = v_caller.pin THEN
        v_is_auth := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_auth THEN
    RAISE EXCEPTION 'Access Denied: Caller is not an authorized staff member';
  END IF;

  IF v_caller.role = 'rider' THEN
    -- Riders only see active orders (confirmed, out_for_delivery)
    SELECT coalesce(
      jsonb_agg(
        to_jsonb(o) || jsonb_build_object('order_items', coalesce(items.arr, '[]'::jsonb))
        ORDER BY o.created_at DESC
      ),
      '[]'::jsonb
    )
    INTO v_result
    FROM public.orders o
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(oi)) AS arr
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ) items ON true
    WHERE o.status IN ('confirmed', 'out_for_delivery');
  ELSE
    -- Admin and Seller see all orders
    SELECT coalesce(
      jsonb_agg(
        to_jsonb(o) || jsonb_build_object('order_items', coalesce(items.arr, '[]'::jsonb))
        ORDER BY o.created_at DESC
      ),
      '[]'::jsonb
    )
    INTO v_result
    FROM public.orders o
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(oi)) AS arr
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ) items ON true;
  END IF;

  RETURN v_result;
END;
\$\$;

GRANT EXECUTE ON FUNCTION public.get_staff_orders(text, text) TO anon, authenticated;

-- 3. Secure Khata Ledger Gateway
CREATE OR REPLACE FUNCTION public.get_staff_khata_ledger(p_caller_id text, p_caller_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS \$\$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_is_auth BOOLEAN := false;
  v_result jsonb;
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
    RAISE EXCEPTION 'Access Denied: Caller is not authorized to view Khata Ledger';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      to_jsonb(k)
      ORDER BY k.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.khata_ledger k;

  RETURN v_result;
END;
\$\$;

GRANT EXECUTE ON FUNCTION public.get_staff_khata_ledger(text, text) TO anon, authenticated;
