-- Migration 026: Drop obsolete prototype RPC create_order_with_items
-- Modern checkout uses atomic, hardened public.create_order_atomic.

DROP FUNCTION IF EXISTS public.create_order_with_items(jsonb);
