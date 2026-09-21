-- Migration 025: Relax UTR column requirements on orders table
-- Drops NOT NULL constraint on orders.utr, sets default to 'ONLINE', and drops obsolete verify_utr_admin RPC.

ALTER TABLE public.orders ALTER COLUMN utr DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN utr SET DEFAULT 'ONLINE';

DROP FUNCTION IF EXISTS public.verify_utr_admin(text, boolean);
