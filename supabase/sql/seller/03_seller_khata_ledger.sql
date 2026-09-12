-- ============================================================
-- ROLE: SELLER
-- MODULE: Khata Credit Ledger & Account Settlements
-- File: supabase/sql/seller/03_seller_khata_ledger.sql
-- ============================================================
-- Description:
-- Manages the local store Khata (credit book):
-- 1. Append-only ledger policies (khata_select_public, khata_insert_public)
-- 2. get_staff_khata_ledger RPC for seller ledger view
-- 3. Offset recording for 1-tap debt clearing and order cancellations
-- ============================================================

-- 1. KHATA LEDGER TABLE RLS
ALTER TABLE IF EXISTS public.khata_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS khata_select_public ON public.khata_ledger;
DROP POLICY IF EXISTS khata_insert_public ON public.khata_ledger;

CREATE POLICY khata_select_public ON public.khata_ledger
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY khata_insert_public ON public.khata_ledger
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);


-- 2. GET STAFF KHATA LEDGER (AUTHENTICATED GATEWAY)
CREATE OR REPLACE FUNCTION public.get_staff_khata_ledger(
  p_caller_id text,
  p_caller_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_khata_ledger(text, text) TO anon, authenticated;
