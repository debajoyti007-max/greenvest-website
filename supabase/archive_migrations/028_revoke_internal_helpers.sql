-- ============================================================================
-- Migration 028: Revoke Direct Public Execution on Internal Database Routines
-- ============================================================================
-- Ensures sensitive internal helper functions and trigger procedures cannot be
-- called directly from PostgREST/anon/authenticated client endpoints.
-- All calls must pass through official, authenticated RPC gates (e.g. login_with_pin,
-- reset_pin_with_verification, upgrade_staff_password, update_user_pin_admin).
-- ============================================================================

-- 1. Internal credential helpers
REVOKE EXECUTE ON FUNCTION public.set_profile_pin_hash(text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.record_auth_attempt(text, boolean) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.auth_is_locked(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.verify_staff_caller(text, text, text[]) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.verify_customer_caller(text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.profile_pin_matches(public.profiles, text) FROM anon, authenticated, public;

-- 2. Trigger functions (should never be called directly via RPC)
REVOKE EXECUTE ON FUNCTION public.trg_prevent_role_escalation() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_super_admin_col() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_escalation() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_order_security() FROM anon, authenticated, public;
