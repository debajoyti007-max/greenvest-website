-- ============================================================
-- ROLE: SELLER
-- MODULE: Orders Management & Status Updates
-- File: supabase/sql/seller/02_seller_orders.sql
-- ============================================================
-- Description:
-- Provides store managers and staff with:
-- 1. update_order_status_admin (atomic status change with optional reason)
-- 2. get_staff_orders (secure gateway with item aggregation)
-- 3. delete_order_admin (cascade delete for test/cancelled orders)
-- ============================================================

-- 1. UPDATE ORDER STATUS (ADMIN / SELLER)
CREATE OR REPLACE FUNCTION public.update_order_status_admin(
  p_order_id text,
  p_status text,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET status = p_status,
      rejection_reason = COALESCE(p_reason, rejection_reason),
      updated_at = now()
  WHERE id = p_order_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', p_status);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Order not found');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_status_admin(text, text, text) TO anon, authenticated;


-- 2. GET STAFF ORDERS (LIVE SELLER FEED)
CREATE OR REPLACE FUNCTION public.get_staff_orders(
  p_caller_id text,
  p_caller_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_is_auth BOOLEAN := false;
  v_result jsonb;
BEGIN
  -- 1. Check Supabase Auth session (Super Admin)
  IF auth.uid() IS NOT NULL AND auth.uid()::text = p_caller_id THEN
    SELECT * INTO v_caller FROM public.profiles WHERE profiles.id = p_caller_id;
    IF FOUND AND (v_caller.role IN ('admin', 'seller', 'rider') OR v_caller.is_super_admin = true) THEN
      v_is_auth := true;
    END IF;
  END IF;

  -- 2. Check PIN session (Phone+PIN staff)
  IF NOT v_is_auth THEN
    SELECT * INTO v_caller FROM public.profiles WHERE profiles.id = p_caller_id;
    IF FOUND AND (v_caller.role IN ('admin', 'seller', 'rider') OR v_caller.is_super_admin = true) THEN
      IF v_caller.pin = p_caller_pin OR LPAD(p_caller_pin, 4, '0') = v_caller.pin THEN
        v_is_auth := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_auth THEN
    RAISE EXCEPTION 'Access Denied: Caller is not an authorized staff member';
  END IF;

  IF v_caller.role = 'rider' THEN
    -- Riders only see active orders (confirmed, out_for_delivery)
    SELECT coalesce(
      jsonb_agg(
        to_jsonb(o) || jsonb_build_object('order_items', coalesce(items.arr, '[]'::jsonb))
        ORDER BY o.created_at DESC
      ),
      '[]'::jsonb
    )
    INTO v_result
    FROM public.orders o
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(oi)) AS arr
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ) items ON true
    WHERE o.status IN ('confirmed', 'out_for_delivery');
  ELSE
    -- Admin and Seller see all orders
    SELECT coalesce(
      jsonb_agg(
        to_jsonb(o) || jsonb_build_object('order_items', coalesce(items.arr, '[]'::jsonb))
        ORDER BY o.created_at DESC
      ),
      '[]'::jsonb
    )
    INTO v_result
    FROM public.orders o
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(oi)) AS arr
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ) items ON true;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_orders(text, text) TO anon, authenticated;


-- 3. DELETE ORDER (ADMIN / SELLER CLEANUP)
CREATE OR REPLACE FUNCTION public.delete_order_admin(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.order_messages WHERE order_id = p_order_id;
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true, 'deleted_order_id', p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_order_admin(text) TO anon, authenticated;
