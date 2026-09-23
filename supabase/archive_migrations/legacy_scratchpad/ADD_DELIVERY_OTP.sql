-- ==============================================================================
-- GREENVEST: DELIVERY HANDOVER OTP PERSISTENCE (OPTIONAL)
-- Run this in your Supabase Dashboard -> SQL Editor -> Run
-- Note: The website automatically calculates 4-digit OTPs deterministically
-- even without this column, so existing & new orders work seamlessly immediately.
-- Running this allows permanent column persistence in public.orders.
-- ==============================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_otp text;
