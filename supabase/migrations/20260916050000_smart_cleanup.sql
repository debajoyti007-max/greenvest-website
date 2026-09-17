-- ==============================================================================
-- GreenVest: Automated Database Hygiene, Safe Foreign Keys & pg_cron Maintenance
-- Paste and Run in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ==============================================================================

-- 1. Ensure `last_active_at` column exists on profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now();

-- 2. Ensure Safe Foreign Key Constraints:
--    - When a user profile is removed, set `orders.user_id` to NULL to preserve sales & accounting history
--    - When an order is deleted, cascade delete `order_items`
DO $$
BEGIN
  -- Safe user_id foreign key on orders
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'orders_user_id_fkey' AND table_name = 'orders'
  ) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_user_id_fkey;
    ALTER TABLE public.orders 
      ADD CONSTRAINT orders_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) 
      ON DELETE SET NULL;
  END IF;

  -- Cascading order_items foreign key on order_id
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'order_items_order_id_fkey' AND table_name = 'order_items'
  ) THEN
    ALTER TABLE public.order_items DROP CONSTRAINT order_items_order_id_fkey;
    ALTER TABLE public.order_items 
      ADD CONSTRAINT order_items_order_id_fkey 
      FOREIGN KEY (order_id) REFERENCES public.orders(id) 
      ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Purge dead cancelled orders older than N days (default: 14 days)
CREATE OR REPLACE FUNCTION public.smart_purge_cancelled_orders(days_old int DEFAULT 14)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM public.order_items
  WHERE order_id IN (
    SELECT id FROM public.orders
    WHERE status = 'cancelled'
      AND created_at < (now() - (days_old || ' days')::interval)
  );

  WITH deleted AS (
    DELETE FROM public.orders
    WHERE status = 'cancelled'
      AND created_at < (now() - (days_old || ' days')::interval)
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

-- 4. Auto-cancel abandoned pending ghost orders older than N hours (default: 48 hours)
CREATE OR REPLACE FUNCTION public.smart_cancel_abandoned_pending(hours_old int DEFAULT 48)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count int;
BEGIN
  WITH updated AS (
    UPDATE public.orders
    SET status = 'cancelled', updated_at = now()
    WHERE status = 'pending'
      AND (utr IS NULL OR trim(utr) = '')
      AND created_at < (now() - (hours_old || ' hours')::interval)
    RETURNING id
  )
  SELECT count(*) INTO updated_count FROM updated;

  RETURN updated_count;
END;
$$;

-- 5. Purge old broadcast notifications older than N days (default: 30 days)
CREATE OR REPLACE FUNCTION public.smart_purge_old_notifications(days_old int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH deleted AS (
    DELETE FROM public.notifications
    WHERE created_at < (now() - (days_old || ' days')::interval)
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

-- 6. Purge inactive customer profiles older than N days (default: 60 days)
--    STRICTLY EXEMPTS Admin, Seller, and Rider staff accounts!
CREATE OR REPLACE FUNCTION public.smart_purge_inactive_customers(days_inactive int DEFAULT 60)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH deleted AS (
    DELETE FROM public.profiles
    WHERE role = 'customer'
      AND ("isBlocked" IS NULL OR "isBlocked" = false)
      AND coalesce(created_at, now()) < (now() - (days_inactive || ' days')::interval)
      -- Safeguard: do not delete users who have completed orders in the last 60 days
      AND id NOT IN (
        SELECT DISTINCT user_id FROM public.orders 
        WHERE user_id IS NOT NULL 
          AND created_at >= (now() - (days_inactive || ' days')::interval)
      )
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

-- 7. 🤖 Master Nightly Stored Procedure: clean_database_garbage()
CREATE OR REPLACE FUNCTION public.clean_database_garbage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ghost_cancelled int;
  cancelled_purged int;
  notifs_purged int;
  inactive_purged int;
BEGIN
  -- 1. Cancel abandoned pending ghost orders (>48h)
  ghost_cancelled := public.smart_cancel_abandoned_pending(48);

  -- 2. Purge dead cancelled orders (>14 days)
  cancelled_purged := public.smart_purge_cancelled_orders(14);

  -- 3. Purge old notifications (>30 days)
  notifs_purged := public.smart_purge_old_notifications(30);

  -- 4. Purge inactive customer accounts (>60 days)
  inactive_purged := public.smart_purge_inactive_customers(60);

  RETURN jsonb_build_object(
    'success', true,
    'timestamp', now(),
    'ghost_orders_cancelled', ghost_cancelled,
    'cancelled_orders_purged', cancelled_purged,
    'notifications_purged', notifs_purged,
    'inactive_customers_purged', inactive_purged
  );
END;
$$;

-- ==============================================================================
-- Optional: Schedule with pg_cron (Runs nightly at 3:00 AM IST / 21:30 UTC)
-- Run this if pg_cron extension is enabled on your Supabase project:
-- ==============================================================================
-- SELECT cron.schedule(
--   'nightly-database-cleanup',
--   '30 21 * * *',
--   'SELECT public.clean_database_garbage();'
-- );
