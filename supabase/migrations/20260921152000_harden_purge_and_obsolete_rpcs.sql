-- Migration: 20260921152000_harden_purge_and_obsolete_rpcs.sql
-- Hardens database security: revokes unauthenticated / anonymous execution on database purging and obsolete RPCs.

-- 1. Lock down purge_stale_ephemeral_data so unauthenticated callers cannot purge notifications/support tickets
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'purge_stale_ephemeral_data' 
      AND pronamespace = 'public'::regnamespace
  ) THEN
    REVOKE ALL ON FUNCTION public.purge_stale_ephemeral_data(integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.purge_stale_ephemeral_data(integer) FROM anon;
    GRANT EXECUTE ON FUNCTION public.purge_stale_ephemeral_data(integer) TO authenticated, service_role;
  END IF;
END;
$$;

-- 2. Lock down obsolete legacy create_order_with_items function from anon/public
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'create_order_with_items' 
      AND pronamespace = 'public'::regnamespace
  ) THEN
    REVOKE ALL ON FUNCTION public.create_order_with_items(jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.create_order_with_items(jsonb) FROM anon;
  END IF;
END;
$$;
