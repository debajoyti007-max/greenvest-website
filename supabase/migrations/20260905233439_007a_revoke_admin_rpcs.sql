-- Part 1: REVOKE admin RPCs from PUBLIC
DO $$
DECLARE
  sql_stmt TEXT;
BEGIN
  FOR sql_stmt IN
    SELECT format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC',
                  p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname NOT IN (
        'validate_coupon',
        'create_order_atomic',
        'create_order_with_items',
        'verify_delivery_handover',
        'login_with_pin'
      )
  LOOP
    BEGIN
      EXECUTE sql_stmt;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$;

DO $$ BEGIN EXECUTE 'GRANT EXECUTE ON FUNCTION public.validate_coupon(text, numeric) TO anon, authenticated'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'GRANT EXECUTE ON FUNCTION public.verify_delivery_handover(text, text) TO authenticated'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_order_with_items(jsonb) TO authenticated'; EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT 'admin RPC revoke done' AS status;
