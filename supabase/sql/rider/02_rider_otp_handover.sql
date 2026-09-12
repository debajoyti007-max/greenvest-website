-- ============================================================
-- ROLE: RIDER
-- MODULE: Delivery Handover & 4-Digit OTP Verification
-- File: supabase/sql/rider/02_rider_otp_handover.sql
-- ============================================================
-- Description:
-- Server-side atomic OTP verification function.
--
-- Security Features:
-- 1. Atomic row lock (FOR UPDATE) prevents double-delivery race conditions.
-- 2. Validates order status is 'confirmed' or 'out_for_delivery'.
-- 3. If delivery_otp column was not explicitly pre-seeded, computes the
--    exact same deterministic 4-digit code as the customer tracking screen
--    (seed = order_id + phone hash).
-- 4. Marks order as 'delivered' in the same transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION public.verify_delivery_handover(
  p_order_id text,
  p_otp text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order        RECORD;
  v_stored_otp   TEXT;
  v_seed         TEXT;
  v_hash         BIGINT := 0;
  v_char         INTEGER;
  i              INTEGER;
BEGIN
  SELECT id, status, delivery_otp, phone
  INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order not found');
  END IF;

  IF v_order.status = 'delivered' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order already delivered');
  END IF;

  IF v_order.status NOT IN ('confirmed', 'out_for_delivery') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order is not ready for delivery');
  END IF;

  v_stored_otp := v_order.delivery_otp;

  -- If no OTP stored, compute the same deterministic fallback as the customer UI
  IF v_stored_otp IS NULL OR v_stored_otp = '' THEN
    v_seed := p_order_id || '-' || COALESCE(v_order.phone, 'greenvest');
    FOR i IN 1 .. length(v_seed) LOOP
      v_char := ascii(substr(v_seed, i, 1));
      v_hash := ((v_hash * 31) + v_char) % (2^32)::BIGINT;
    END LOOP;
    v_stored_otp := (1000 + (v_hash % 9000))::TEXT;
  END IF;

  IF trim(p_otp) <> trim(v_stored_otp) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Incorrect OTP');
  END IF;

  UPDATE public.orders
  SET status = 'delivered', updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'message', 'Delivered successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_delivery_handover(text, text) TO anon, authenticated;
