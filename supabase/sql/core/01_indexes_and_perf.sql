-- ============================================================
-- MODULE: CORE DATABASE PERFORMANCE INDEXES
-- File: supabase/sql/core/01_indexes_and_perf.sql
-- ============================================================
-- Description:
-- Composite and high-traffic B-tree indexes ensuring sub-10ms
-- query times on high concurrency.
-- ============================================================

-- 1. PROFILES INDEXES
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles (phone);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

-- 2. ORDERS INDEXES
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_pin ON public.orders (pin);

-- 3. ORDER ITEMS INDEXES
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);

-- 4. PRODUCTS INDEXES
CREATE INDEX IF NOT EXISTS idx_products_stock ON public.products (in_stock, archived);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category);

-- 5. KHATA LEDGER INDEXES
CREATE INDEX IF NOT EXISTS idx_khata_user_created ON public.khata_ledger (user_id, created_at DESC);

-- 6. ADDRESSES & CHAT INDEXES
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_support_user_created ON public.support_messages (user_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_order_messages_order ON public.order_messages (order_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, read, created_at DESC);
