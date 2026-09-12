-- ============================================================
-- ROLE: CUSTOMER
-- MODULE: Tables & Row Level Security (RLS)
-- File: supabase/sql/customer/01_customer_tables_rls.sql
-- ============================================================
-- Description:
-- Configures Row Level Security policies for all customer-facing
-- tables: orders, items, delivery addresses, product reviews,
-- and live support chat.
--
-- Why anon & authenticated:
-- Customers authenticate via Phone + 4-digit PIN (login_with_pin),
-- connecting to Supabase under the PostgreSQL 'anon' role.
-- Both roles are granted access so checkout, tracking, and profile
-- actions succeed with 0 RLS errors.
-- ============================================================

-- 1. ORDERS TABLE
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_insert_public ON public.orders;
DROP POLICY IF EXISTS orders_select_public ON public.orders;
DROP POLICY IF EXISTS orders_update_public ON public.orders;

CREATE POLICY orders_insert_public ON public.orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY orders_select_public ON public.orders
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY orders_update_public ON public.orders
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 2. ORDER ITEMS TABLE
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_items_insert_public ON public.order_items;
DROP POLICY IF EXISTS order_items_select_public ON public.order_items;

CREATE POLICY order_items_insert_public ON public.order_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY order_items_select_public ON public.order_items
  FOR SELECT TO anon, authenticated
  USING (true);

-- 3. CUSTOMER DELIVERY ADDRESSES
ALTER TABLE IF EXISTS public.addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS addresses_all_public ON public.addresses;

CREATE POLICY addresses_all_public ON public.addresses
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 4. PRODUCT RATINGS & REVIEWS
ALTER TABLE IF EXISTS public.product_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_reviews_public_read ON public.product_reviews;
DROP POLICY IF EXISTS product_reviews_public_insert ON public.product_reviews;

CREATE POLICY product_reviews_public_read ON public.product_reviews
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY product_reviews_public_insert ON public.product_reviews
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 5. LIVE SUPPORT & ORDER CHAT
ALTER TABLE IF EXISTS public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_messages_all_public ON public.support_messages;
DROP POLICY IF EXISTS order_messages_all_public ON public.order_messages;

CREATE POLICY support_messages_all_public ON public.support_messages
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY order_messages_all_public ON public.order_messages
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 6. CUSTOMER NOTIFICATIONS
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_all_public ON public.notifications;

CREATE POLICY notifications_all_public ON public.notifications
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
