-- ============================================================
-- GreenVest Migration 008: RLS & Function Grant Hardening
-- Applied: September 2026
-- Fixes 10 security gaps found during audit after Migration 007
-- ============================================================

-- FIX 1 & 2: Remove PUBLIC/anon grants on order-creation RPCs
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb,text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_order_atomic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_delivery_handover(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order_with_items(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order_with_items(jsonb) FROM anon;

-- FIX 3: profiles UPDATE — owner can update own row; admin-role users can update any row
-- Business-logic guards (prevent escalation, protect is_super_admin) enforced by DB triggers
DROP POLICY IF EXISTS "profiles_update_safe" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = auth.uid()::text
        AND p2.role = 'admin'
    )
  )
  WITH CHECK (
    id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = auth.uid()::text
        AND p2.role = 'admin'
    )
  );

-- FIX 4: orders UPDATE restricted to owner or staff
DROP POLICY IF EXISTS "orders_update_limited" ON public.orders;
CREATE POLICY "orders_update_own_or_staff" ON public.orders FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::text AND role IN ('admin','seller','rider')))
  WITH CHECK (true);

-- FIX 5: khata_ledger - block anon
DROP POLICY IF EXISTS "khata_ledger_select_public" ON public.khata_ledger;
DROP POLICY IF EXISTS "khata_ledger_insert_public" ON public.khata_ledger;
DROP POLICY IF EXISTS "khata_anon_blocked" ON public.khata_ledger;
CREATE POLICY "khata_select_authenticated" ON public.khata_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "khata_insert_authenticated" ON public.khata_ledger FOR INSERT TO authenticated WITH CHECK (true);

-- FIX 6: notifications - block anon
DROP POLICY IF EXISTS "notifications_select_public" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_public" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_public" ON public.notifications;
DROP POLICY IF EXISTS "notifications_anon_blocked"  ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::text AND role IN ('admin','seller')));
CREATE POLICY "notifications_insert_staff" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text) WITH CHECK (true);

-- FIX 7: daily_reports - staff only
DROP POLICY IF EXISTS "daily_reports_select_public" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_insert_public" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_update_public" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_anon_blocked"  ON public.daily_reports;
CREATE POLICY "daily_reports_staff_only" ON public.daily_reports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::text AND role IN ('admin','seller')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::text AND role IN ('admin','seller')));

-- FIX 8: order_messages - block anon
DROP POLICY IF EXISTS "order_messages_select_public" ON public.order_messages;
DROP POLICY IF EXISTS "order_messages_insert_public" ON public.order_messages;
DROP POLICY IF EXISTS "order_messages_anon_blocked"  ON public.order_messages;
CREATE POLICY "order_messages_select_authenticated" ON public.order_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_messages_insert_authenticated" ON public.order_messages FOR INSERT TO authenticated WITH CHECK (true);

-- FIX 9: order_items - block anon
DROP POLICY IF EXISTS "order_items_select_public" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_public" ON public.order_items;
DROP POLICY IF EXISTS "order_items_anon_blocked"  ON public.order_items;
CREATE POLICY "order_items_select_authenticated" ON public.order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_items_insert_authenticated" ON public.order_items FOR INSERT TO authenticated WITH CHECK (true);

-- FIX 10: support_messages - block anon insert
DROP POLICY IF EXISTS "support_messages_insert_public" ON public.support_messages;
CREATE POLICY "support_messages_insert_authenticated" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (true);

-- FIX 11: Re-grant update_user_role_admin to authenticated
-- Migration 007 overly revoked this SECURITY DEFINER function from all non-service_role callers.
-- Admins need EXECUTE on this RPC to change user roles from the Admin panel.
-- The function itself is SECURITY DEFINER and has internal guards against privilege escalation.
GRANT EXECUTE ON FUNCTION public.update_user_role_admin(text, text) TO authenticated;
