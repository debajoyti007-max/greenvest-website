-- ============================================================
-- GreenVest Migration 016: Database Maintenance, Advisor Cleanup & Performance
-- Applied: September 2026
-- ============================================================

-- 1. DROP DUPLICATE INDEXES (support_messages)
DROP INDEX IF EXISTS public.idx_support_messages_created;
DROP INDEX IF EXISTS public.idx_support_messages_user_id;

-- 2. ADD MISSING FOREIGN KEY INDEXES (product_reviews)
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON public.product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_user_id ON public.product_reviews(user_id);

-- 3. REVOKE PUBLIC RPC ACCESS ON INTERNAL TRIGGER FUNCTIONS
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_super_admin_col() FROM PUBLIC, anon, authenticated;

-- 4. CONSOLIDATE PERMISSIVE POLICIES & RESOLVE CONFLICTS

-- A. promotional_deals: Consolidate deals_public_read & promotional_deals_select_public
DROP POLICY IF EXISTS "deals_public_read" ON public.promotional_deals;
DROP POLICY IF EXISTS "promotional_deals_select_public" ON public.promotional_deals;
DROP POLICY IF EXISTS "promotional_deals_select_policy" ON public.promotional_deals;

CREATE POLICY "promotional_deals_select_policy"
  ON public.promotional_deals
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())::text
          AND profiles.role IN ('admin', 'seller')
      )
    )
  );

DROP POLICY IF EXISTS "promotional_deals_insert_staff" ON public.promotional_deals;
CREATE POLICY "promotional_deals_insert_staff"
  ON public.promotional_deals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller')
    )
  );

DROP POLICY IF EXISTS "promotional_deals_update_staff" ON public.promotional_deals;
CREATE POLICY "promotional_deals_update_staff"
  ON public.promotional_deals
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller')
    )
  )
  WITH CHECK (true);

-- B. coupons: Consolidate conflicting coupons_anon_blocked & coupons_select_public
DROP POLICY IF EXISTS "coupons_anon_blocked" ON public.coupons;
DROP POLICY IF EXISTS "coupons_select_public" ON public.coupons;
DROP POLICY IF EXISTS "coupons_select_authenticated" ON public.coupons;

CREATE POLICY "coupons_select_authenticated"
  ON public.coupons
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "coupons_staff_write" ON public.coupons;
CREATE POLICY "coupons_staff_write"
  ON public.coupons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller')
    )
  );

DROP POLICY IF EXISTS "coupons_staff_update" ON public.coupons;
CREATE POLICY "coupons_staff_update"
  ON public.coupons
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller')
    )
  )
  WITH CHECK (true);

-- C. products: Consolidate products_public_read & products_staff_read_all
DROP POLICY IF EXISTS "products_public_read" ON public.products;
DROP POLICY IF EXISTS "products_staff_read_all" ON public.products;
DROP POLICY IF EXISTS "products_select_policy" ON public.products;

CREATE POLICY "products_select_policy"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (
    (archived IS NOT TRUE)
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())::text
          AND profiles.role IN ('admin', 'seller')
      )
    )
  );

DROP POLICY IF EXISTS "products_staff_insert" ON public.products;
CREATE POLICY "products_staff_insert"
  ON public.products
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    (SELECT auth.role()) = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('seller', 'admin')
    )
  );

DROP POLICY IF EXISTS "products_staff_update" ON public.products;
CREATE POLICY "products_staff_update"
  ON public.products
  FOR UPDATE
  TO authenticated, service_role
  USING (
    (SELECT auth.role()) = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('seller', 'admin')
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "products_staff_delete" ON public.products;
CREATE POLICY "products_staff_delete"
  ON public.products
  FOR DELETE
  TO authenticated, service_role
  USING (
    (SELECT auth.role()) = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role = 'admin'
    )
  );

-- 5. OPTIMIZE AUTH RLS INITPLANS ((SELECT auth.uid()))

-- orders
DROP POLICY IF EXISTS "orders_select_own_or_staff" ON public.orders;
CREATE POLICY "orders_select_own_or_staff"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller', 'rider')
    )
  );

DROP POLICY IF EXISTS "orders_update_own_or_staff" ON public.orders;
CREATE POLICY "orders_update_own_or_staff"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller', 'rider')
    )
  )
  WITH CHECK (true);

-- notifications
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller')
    )
  );

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid())::text)
  WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_insert_staff" ON public.notifications;
CREATE POLICY "notifications_insert_staff"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller')
    )
  );

-- profiles
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = (SELECT auth.uid())::text
        AND p2.role = 'admin'
    )
  )
  WITH CHECK (
    id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = (SELECT auth.uid())::text
        AND p2.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "profiles_delete_admin_only" ON public.profiles;
CREATE POLICY "profiles_delete_admin_only"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = (SELECT auth.uid())::text
        AND p2.role = 'admin'
    )
  );

-- support_messages
DROP POLICY IF EXISTS "support_messages_select_own_or_staff" ON public.support_messages;
CREATE POLICY "support_messages_select_own_or_staff"
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller')
    )
  );

DROP POLICY IF EXISTS "support_messages_update_own_or_staff" ON public.support_messages;
CREATE POLICY "support_messages_update_own_or_staff"
  ON public.support_messages
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller')
    )
  )
  WITH CHECK (true);

-- addresses
DROP POLICY IF EXISTS "addresses_select_own_or_staff" ON public.addresses;
CREATE POLICY "addresses_select_own_or_staff"
  ON public.addresses
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller', 'rider')
    )
  );

DROP POLICY IF EXISTS "addresses_insert_own" ON public.addresses;
CREATE POLICY "addresses_insert_own"
  ON public.addresses
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "addresses_update_own" ON public.addresses;
CREATE POLICY "addresses_update_own"
  ON public.addresses
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid())::text)
  WITH CHECK (user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "addresses_delete_own" ON public.addresses;
CREATE POLICY "addresses_delete_own"
  ON public.addresses
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid())::text);

-- daily_reports
DROP POLICY IF EXISTS "daily_reports_staff_only" ON public.daily_reports;
CREATE POLICY "daily_reports_staff_only"
  ON public.daily_reports
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role IN ('admin', 'seller')
    )
  );

-- admin_otp_attempts
DROP POLICY IF EXISTS "otp_attempts_admin_read" ON public.admin_otp_attempts;
CREATE POLICY "otp_attempts_admin_read"
  ON public.admin_otp_attempts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())::text
        AND profiles.role = 'admin'
    )
  );

-- product_reviews
DROP POLICY IF EXISTS "product_reviews_owner_update" ON public.product_reviews;
CREATE POLICY "product_reviews_owner_update"
  ON public.product_reviews
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid())::text)
  WITH CHECK (user_id = (SELECT auth.uid())::text);
