-- ============================================================
-- ROLE: ADMIN
-- MODULE: Promo Coupons & Discount Vouchers
-- File: supabase/sql/admin/02_admin_coupons.sql
-- ============================================================
-- Description:
-- Manages store promotional codes:
-- 1. coupons table RLS (coupons_select_public, coupons_insert_public, coupons_update_public, coupons_delete_public)
-- 2. save_coupon_admin RPC for atomic voucher creation and expiry dates
-- ============================================================

-- 1. COUPONS TABLE RLS
ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coupons_staff_write ON public.coupons;
DROP POLICY IF EXISTS coupons_staff_update ON public.coupons;
DROP POLICY IF EXISTS coupons_delete_public ON public.coupons;
DROP POLICY IF EXISTS coupons_select_public ON public.coupons;
DROP POLICY IF EXISTS coupons_insert_public ON public.coupons;
DROP POLICY IF EXISTS coupons_update_public ON public.coupons;

CREATE POLICY coupons_select_public ON public.coupons
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY coupons_insert_public ON public.coupons
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY coupons_update_public ON public.coupons
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY coupons_delete_public ON public.coupons
  FOR DELETE TO anon, authenticated
  USING (true);


-- 2. SAVE COUPON ADMIN RPC
CREATE OR REPLACE FUNCTION public.save_coupon_admin(
  p_code text,
  p_discount_type text,
  p_discount_value numeric,
  p_min_order numeric,
  p_valid boolean,
  p_expires_at timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.coupons (
    code, discount_type, discount_value, min_order, active, valid, expires_at, valid_until
  ) VALUES (
    UPPER(TRIM(p_code)), p_discount_type, p_discount_value, p_min_order, p_valid, p_valid, p_expires_at, p_expires_at
  )
  ON CONFLICT (code) DO UPDATE SET
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    min_order = EXCLUDED.min_order,
    active = EXCLUDED.active,
    valid = EXCLUDED.valid,
    expires_at = EXCLUDED.expires_at,
    valid_until = EXCLUDED.valid_until;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_coupon_admin(
  text, text, numeric, numeric, boolean, timestamp with time zone
) TO anon, authenticated;
