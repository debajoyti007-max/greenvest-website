-- ============================================================
-- GreenVest Security Fixes: Migration 005
-- Fixes flagged by Supabase Security Advisor via MCP scan:
-- 1. Revoke anon/public EXECUTE on admin-only SECURITY DEFINER RPCs
-- 2. Set immutable search_path on all 15 public functions
-- 3. Add missing RLS SELECT policy on product_reviews
-- ============================================================

-- ── 1. Revoke anon EXECUTE on admin-only SECURITY DEFINER functions ──
-- These functions were callable by any anonymous visitor via /rest/v1/rpc/*
-- which allowed unauthenticated deletion of orders, users, and products.
REVOKE EXECUTE ON FUNCTION public.delete_order_admin(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_user_admin(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_user_role_admin(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_order_status_admin(text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_coupon_admin(text, text, numeric, numeric, boolean, timestamp with time zone) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_product_admin(text, text, text, numeric, numeric, numeric, boolean, text, text, text, text, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_utr_admin(text, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_role() FROM anon, authenticated;

-- Re-grant only to authenticated users (customers still allowed for order placement & coupon validation)
GRANT EXECUTE ON FUNCTION public.create_order_atomic(text, text, text, text, text, text, text, text, text, numeric, numeric, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text, numeric) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verify_delivery_handover(text, text) TO authenticated, anon;

-- ── 2. Fix mutable search_path on all flagged functions ──
-- Prevents schema injection attacks where a malicious search_path could
-- redirect function calls to attacker-controlled schemas.
ALTER FUNCTION public.create_order_with_items(jsonb) SET search_path = public;
ALTER FUNCTION public.protect_profile_role() SET search_path = public;
ALTER FUNCTION public.protect_order_status() SET search_path = public;
ALTER FUNCTION public.check_order_rate_limit() SET search_path = public;
ALTER FUNCTION public.verify_utr_admin(text, boolean) SET search_path = public;
ALTER FUNCTION public.enforce_profile_security() SET search_path = public;
ALTER FUNCTION public.enforce_order_security() SET search_path = public;
ALTER FUNCTION public.update_user_role_admin(text, text) SET search_path = public;
ALTER FUNCTION public.save_coupon_admin(text, text, numeric, numeric, boolean, timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.delete_user_admin(text) SET search_path = public;
ALTER FUNCTION public.validate_coupon(text, numeric) SET search_path = public;
ALTER FUNCTION public.create_order_atomic(text, text, text, text, text, text, text, text, text, numeric, numeric, text, jsonb, text) SET search_path = public;
ALTER FUNCTION public.update_order_status_admin(text, text, text) SET search_path = public;
ALTER FUNCTION public.save_product_admin(text, text, text, numeric, numeric, numeric, boolean, text, text, text, text, boolean) SET search_path = public;
ALTER FUNCTION public.delete_order_admin(text) SET search_path = public;

-- ── 3. Add missing RLS policy on product_reviews ──
-- Table had RLS enabled but NO policies — meaning all operations were blocked.
-- Public customers should be able to read reviews; only authenticated users write.
CREATE POLICY "product_reviews_public_read"
  ON public.product_reviews
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "product_reviews_authenticated_insert"
  ON public.product_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "product_reviews_owner_update"
  ON public.product_reviews
  FOR UPDATE
  TO authenticated
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
