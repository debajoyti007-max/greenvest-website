-- ==============================================================================
-- GREENVEST: FIX SCHEDULED DELIVERY DATE PERSISTENCE
-- Run this once in your Supabase Project -> SQL Editor -> Run
-- ==============================================================================

-- 1. Ensure delivery_date column exists in public.orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_date text;

-- 2. Update create_order_atomic RPC to accept and store p_delivery_date
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_id text,
  p_user_id text,
  p_user_name text,
  p_user_email text,
  p_address text,
  p_phone text,
  p_pin text,
  p_delivery_slot text,
  p_utr text,
  p_delivery_fee numeric,
  p_discount numeric,
  p_payment_type text,
  p_items jsonb,
  p_delivery_date text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item jsonb;
  v_product record;
  v_unit_base_price numeric;
  v_line_unit_price numeric;
  v_calculated_subtotal numeric := 0;
  v_calculated_total numeric := 0;
  v_calculated_advance numeric := 0;
  v_weight_mult numeric;
  v_weight_lbl text;
  v_qty numeric;
  v_grade text;
  v_prod_id text;
  v_prod_name text;
  v_prod_emoji text;
BEGIN
  -- Validate UTR uniqueness on non-cancelled orders
  IF p_utr IS NOT NULL AND p_utr != '' THEN
    IF EXISTS (
      SELECT 1 FROM public.orders 
      WHERE utr = UPPER(TRIM(p_utr)) 
        AND id != p_id 
        AND status != 'cancelled'
    ) THEN
      RAISE EXCEPTION 'This UTR has already been used for another active order.';
    END IF;
  END IF;

  -- Iterate through items and compute verified pricing from products table
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := v_item->>'productId';
    v_grade := UPPER(COALESCE(v_item->>'grade', 'B'));
    v_qty := (v_item->>'qty')::numeric;
    v_weight_mult := COALESCE((v_item->>'weightMultiplier')::numeric, 1);
    v_weight_lbl := COALESCE(v_item->>'weightLabel', '1 kg');

    SELECT * INTO v_product FROM public.products WHERE id = v_prod_id;
    IF NOT FOUND THEN
      v_unit_base_price := COALESCE((v_item->>'unitPrice')::numeric, 40);
    ELSE
      IF v_grade = 'A' THEN
        v_unit_base_price := COALESCE(v_product.p_a, v_product.p_b);
      ELSIF v_grade = 'C' THEN
        v_unit_base_price := COALESCE(v_product.p_c, v_product.p_b);
      ELSE
        v_unit_base_price := v_product.p_b;
      END IF;
    END IF;

    v_line_unit_price := ROUND(v_unit_base_price * v_weight_mult);
    v_calculated_subtotal := v_calculated_subtotal + (v_line_unit_price * v_qty);
  END LOOP;

  v_calculated_total := GREATEST(0, v_calculated_subtotal + COALESCE(p_delivery_fee, 0) - COALESCE(p_discount, 0));

  IF p_payment_type = 'full' THEN
    v_calculated_advance := v_calculated_total;
  ELSE
    v_calculated_advance := CEIL(v_calculated_total * 0.5);
  END IF;

  -- Ensure profile exists
  INSERT INTO public.profiles (id, email, name, role, phone, created_at)
  VALUES (
    p_user_id,
    COALESCE(p_user_email, p_user_id || '@greenvest.shop'),
    COALESCE(p_user_name, 'Customer'),
    'customer',
    p_phone,
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert order with delivery_date
  INSERT INTO public.orders (
    id,
    user_id,
    user_name,
    user_email,
    subtotal,
    delivery_fee,
    discount,
    total,
    advance_amount,
    payment_type,
    utr,
    utr_verified,
    status,
    address,
    phone,
    pin,
    delivery_slot,
    delivery_date,
    created_at,
    updated_at
  ) VALUES (
    p_id,
    p_user_id,
    p_user_name,
    p_user_email,
    v_calculated_subtotal,
    COALESCE(p_delivery_fee, 0),
    COALESCE(p_discount, 0),
    v_calculated_total,
    v_calculated_advance,
    COALESCE(p_payment_type, 'advance'),
    UPPER(TRIM(COALESCE(p_utr, ''))),
    false,
    'pending',
    p_address,
    p_phone,
    p_pin,
    p_delivery_slot,
    p_delivery_date,
    now(),
    now()
  );

  -- Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := v_item->>'productId';
    v_grade := UPPER(COALESCE(v_item->>'grade', 'B'));
    v_qty := (v_item->>'qty')::numeric;
    v_weight_mult := COALESCE((v_item->>'weightMultiplier')::numeric, 1);
    v_weight_lbl := COALESCE(v_item->>'weightLabel', '1 kg');
    v_prod_name := v_item->>'name';
    v_prod_emoji := COALESCE(v_item->>'emoji', '🥬');

    SELECT * INTO v_product FROM public.products WHERE id = v_prod_id;
    IF NOT FOUND THEN
      v_unit_base_price := COALESCE((v_item->>'unitPrice')::numeric, 40);
    ELSE
      IF v_grade = 'A' THEN
        v_unit_base_price := COALESCE(v_product.p_a, v_product.p_b);
      ELSIF v_grade = 'C' THEN
        v_unit_base_price := COALESCE(v_product.p_c, v_product.p_b);
      ELSE
        v_unit_base_price := v_product.p_b;
      END IF;
    END IF;
    v_line_unit_price := ROUND(v_unit_base_price * v_weight_mult);

    INSERT INTO public.order_items (
      order_id,
      product_id,
      name,
      emoji,
      grade,
      qty,
      unit_price,
      weight_multiplier,
      weight_label
    ) VALUES (
      p_id,
      v_prod_id,
      v_prod_name,
      v_prod_emoji,
      v_grade,
      v_qty,
      v_line_unit_price,
      v_weight_mult,
      v_weight_lbl
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_id,
    'total', v_calculated_total,
    'advance_amount', v_calculated_advance,
    'delivery_date', p_delivery_date
  );
END;
$$;
