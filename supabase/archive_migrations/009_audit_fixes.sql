-- ============================================================
-- GreenVest Migration 009: Full Audit Fix
-- Applied: September 2026
-- Fixes all issues found in post-008 senior dev audit
-- ============================================================

-- BLOCK 1: Function Grants
-- Migration 007 over-revoked all admin RPCs from authenticated.
GRANT EXECUTE ON FUNCTION public.delete_user_admin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_order_admin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_admin(text, text, text, numeric, numeric, numeric, boolean, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_coupon_admin(text, text, numeric, numeric, boolean, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status_admin(text, text, text) TO authenticated;

-- BLOCK 2: admin_otp_attempts RLS
-- Table had RLS ON but zero policies. SECURITY DEFINER functions bypass RLS.
-- Add admin read-only policy for audit purposes.
CREATE POLICY "otp_attempts_admin_read"
  ON public.admin_otp_attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::text AND role = 'admin'));

-- BLOCK 3: addresses RLS
-- Table only had anon-blocked. Customers need to save/read delivery addresses.
CREATE POLICY "addresses_select_own_or_staff" ON public.addresses FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::text AND role IN ('admin','seller','rider')));

CREATE POLICY "addresses_insert_own" ON public.addresses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "addresses_update_own" ON public.addresses FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "addresses_delete_own" ON public.addresses FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text);

-- BLOCK 4: coupons staff write
-- No INSERT/UPDATE policy for authenticated existed.
CREATE POLICY "coupons_staff_write" ON public.coupons FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::text AND role IN ('admin','seller')));

CREATE POLICY "coupons_staff_update" ON public.coupons FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::text AND role IN ('admin','seller')))
  WITH CHECK (true);

-- BLOCK 5: profiles DELETE for admins
-- No DELETE policy existed. Primary path is delete_user_admin RPC.
-- This policy covers the direct-delete fallback.
CREATE POLICY "profiles_delete_admin_only" ON public.profiles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid()::text AND p2.role = 'admin'));
