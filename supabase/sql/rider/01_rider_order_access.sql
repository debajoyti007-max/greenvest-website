-- ============================================================
-- ROLE: RIDER
-- MODULE: Order Access & Live Dispatch View
-- File: supabase/sql/rider/01_rider_order_access.sql
-- ============================================================
-- Description:
-- Configures database columns, views, and policies for delivery
-- executives (riders).
--
-- Rider Business Rules:
-- 1. Riders ONLY see actionable orders (status = 'confirmed' or 'out_for_delivery').
-- 2. Pending unconfirmed orders or cancelled orders are hidden from riders.
-- 3. The delivery_otp column stores the customer handoff verification code.
-- ============================================================

-- 1. Ensure delivery_otp column exists on public.orders
ALTER TABLE IF EXISTS public.orders ADD COLUMN IF NOT EXISTS delivery_otp text;

-- 2. Rider active delivery view (convenience view for riders)
CREATE OR REPLACE VIEW public.rider_active_deliveries AS
SELECT 
  id,
  user_name,
  phone,
  address,
  pin,
  total,
  advance_amount,
  (total - advance_amount) AS balance_to_collect,
  status,
  delivery_slot,
  delivery_date,
  created_at,
  updated_at
FROM public.orders
WHERE status IN ('confirmed', 'out_for_delivery')
ORDER BY pin ASC, created_at ASC;

-- 3. Grant access to view
GRANT SELECT ON public.rider_active_deliveries TO anon, authenticated;
