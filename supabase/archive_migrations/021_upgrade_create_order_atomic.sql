-- Migration 021: Upgrade create_order_atomic to natively accept geo coordinates, payer upi name, and delivery notes in one atomic call

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
  p_delivery_date text DEFAULT 'standard'::text,
  p_geo_lat double precision DEFAULT NULL,
  p_geo_lng double precision DEFAULT NULL,
  p_payer_upi_name text DEFAULT NULL,
  p_delivery_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
  v_clean_utr text;
BEGIN
  v_clean_utr := UPPER(TRIM(COALESCE(p_utr, '')));

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
    v_calculated_advance := CASE 
      WHEN v_calculated_total > 0 THEN GREATEST(1, CEIL(v_calculated_total * 0.1)) 
      ELSE 0 
    END;
  END IF;

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

  INSERT INTO public.orders (
    id, user_id, user_name, user_email, subtotal, delivery_fee, discount, total,
    advance_amount, payment_type, utr, utr_verified, status, address, phone, pin,
    delivery_slot, delivery_date, geo_lat, geo_lng, payer_upi_name, delivery_notes,
    created_at, updated_at
  ) VALUES (
    p_id, p_user_id, p_user_name, p_user_email, v_calculated_subtotal,
    COALESCE(p_delivery_fee, 0), COALESCE(p_discount, 0), v_calculated_total,
    v_calculated_advance, COALESCE(p_payment_type, 'advance'), v_clean_utr, false,
    'pending',
    p_address, p_phone, p_pin, p_delivery_slot, COALESCE(p_delivery_date, 'standard'),
    p_geo_lat, p_geo_lng, p_payer_upi_name, p_delivery_notes,
    now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    advance_amount = EXCLUDED.advance_amount,
    delivery_date = COALESCE(EXCLUDED.delivery_date, orders.delivery_date),
    geo_lat = COALESCE(EXCLUDED.geo_lat, orders.geo_lat),
    geo_lng = COALESCE(EXCLUDED.geo_lng, orders.geo_lng),
    payer_upi_name = COALESCE(EXCLUDED.payer_upi_name, orders.payer_upi_name),
    delivery_notes = COALESCE(EXCLUDED.delivery_notes, orders.delivery_notes),
    updated_at = now();

  DELETE FROM public.order_items WHERE order_id = p_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := v_item->>'productId';
    v_grade := UPPER(COALESCE(v_item->>'grade', 'B'));
    v_qty := (v_item->>'qty')::numeric;
    v_weight_mult := COALESCE((v_item->>'weightMultiplier')::numeric, 1);
    v_weight_lbl := COALESCE(v_item->>'weightLabel', '1 kg');
    v_prod_name := COALESCE(v_item->>'name', 'Product');
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
      order_id, product_id, name, emoji, grade, qty, unit_price, weight_multiplier, weight_label
    ) VALUES (
      p_id, v_prod_id, v_prod_name, v_prod_emoji, v_grade, v_qty, v_line_unit_price, v_weight_mult, v_weight_lbl
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_id,
    'subtotal', v_calculated_subtotal,
    'total', v_calculated_total,
    'advance_amount', v_calculated_advance
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_order_atomic(
  text, text, text, text, text, text, text, text, text, numeric, numeric, text, jsonb, text, double precision, double precision, text, text
) TO anon, authenticated, service_role;
