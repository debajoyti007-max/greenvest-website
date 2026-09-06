-- ============================================================
-- GreenVest Migration 013: High-Performance Database Indexes
-- Applied: September 2026
-- Optimization: Speed up logins, phone lookups, order tracking,
--               chat messages, and notifications for Supabase Free Tier.
-- ============================================================

-- 1. Profiles lookup by phone (primary login & PIN lookup identifier)
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);

-- 2. Profiles lookup by email (fallback login & super admin check)
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 3. Orders lookup by phone (used by TrackOrder for fast lookup)
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(phone);

-- 4. Order messages lookup by order_id and created_at (fast chat loading)
CREATE INDEX IF NOT EXISTS idx_order_messages_order_created ON public.order_messages(order_id, created_at ASC);

-- 5. Notifications lookup by user_id and created_at (fast notification feed)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
