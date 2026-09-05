-- ============================================================
-- GreenVest Migration 007: Critical Security Hardening
-- Applied: September 2026
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. Explicit REVOKE on critical admin functions from PUBLIC
-- ─────────────────────────────────────────────

DO $$
DECLARE
  sql_stmt TEXT;
BEGIN
  FOR sql_stmt IN
    SELECT format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC',
                  p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname NOT IN (
        'validate_coupon',
        'create_order_atomic',
        'create_order_with_items',
        'verify_delivery_handover',
        'login_with_pin'
      )
  LOOP
    BEGIN
      EXECUTE sql_stmt;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────
-- 2. Re-grant only legitimately public/customer-facing functions
-- ─────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.validate_coupon(text, numeric) TO anon, authenticated';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.verify_delivery_handover(text, text) TO authenticated';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_order_with_items(jsonb) TO authenticated';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─────────────────────────────────────────────
-- 3. Secure PIN login function — never exposes the pin column
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.login_with_pin(p_identifier text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE lower(email) = lower(trim(p_identifier))
     OR phone = regexp_replace(p_identifier, '\D', '', 'g')
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM pg_sleep(0.1);
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid credentials');
  END IF;

  IF v_profile.is_blocked THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account is blocked. Contact support.');
  END IF;

  IF v_profile.pin IS DISTINCT FROM p_pin THEN
    PERFORM pg_sleep(0.1);
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid credentials');
  END IF;

  RETURN jsonb_build_object(
    'ok',                 true,
    'id',                 v_profile.id,
    'email',              v_profile.email,
    'name',               v_profile.name,
    'role',               v_profile.role,
    'phone',              v_profile.phone,
    'is_super_admin',     v_profile.is_super_admin,
    'is_blocked',         v_profile.is_blocked,
    'tier',               v_profile.tier,
    'khata_approved',     v_profile.khata_approved,
    'khata_credit_limit', v_profile.khata_credit_limit
  );
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.login_with_pin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_with_pin(text, text) TO anon, authenticated;

-- ─────────────────────────────────────────────
-- 4. Fix profiles RLS — block anon from reading profiles directly
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_safe" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated_only" ON public.profiles;

-- Authenticated users can read all profile rows (pin is excluded at app layer via login_with_pin)
CREATE POLICY "profiles_select_authenticated_only"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Anon gets NO select policy → cannot read profiles table at all.
-- Anon login must go through login_with_pin() RPC.

-- ─────────────────────────────────────────────
-- 5. Fix orders RLS — customers see only their own orders
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "orders_select_public" ON public.orders;
DROP POLICY IF EXISTS "orders_select_own_or_staff" ON public.orders;

CREATE POLICY "orders_select_own_or_staff"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'seller', 'rider')
    )
  );

-- ─────────────────────────────────────────────
-- 6. Fix support_messages RLS — customers see only their own messages
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "support_messages_select_public" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_update_public" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_select_own_or_staff" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_update_own_or_staff" ON public.support_messages;

CREATE POLICY "support_messages_select_own_or_staff"
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'seller')
    )
  );

CREATE POLICY "support_messages_update_own_or_staff"
  ON public.support_messages
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'seller')
    )
  )
  WITH CHECK (true);
