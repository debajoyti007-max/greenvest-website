-- ============================================================
-- GreenVest / MS Vegetable Center Migration 017:
-- Fix Customer RLS, Anon Grants & Session Persistence
-- ============================================================

-- 1. Enable anon access to order creation RPC & coupon validation
GRANT EXECUTE ON FUNCTION public.create_order_atomic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text, numeric) TO anon, authenticated;

-- 2. Update create_order_atomic to have DEFAULT 'standard' on p_delivery_date
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
  p_delivery_date text DEFAULT 'standard'
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
  v_clean_utr text;
  v_is_khata boolean := false;
BEGIN
  v_clean_utr := UPPER(TRIM(COALESCE(p_utr, '')));
  v_is_khata := (p_payment_type = 'khata' OR v_clean_utr = 'KHATA-DEBIT');

  -- Price calculation directly from products
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

  -- 10% ADVANCE
  IF p_payment_type = 'full' THEN
    v_calculated_advance := v_calculated_total;
  ELSIF v_is_khata THEN
    v_calculated_advance := 0;
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
    delivery_slot, delivery_date, is_khata_order, created_at, updated_at
  ) VALUES (
    p_id, p_user_id, p_user_name, p_user_email, v_calculated_subtotal,
    COALESCE(p_delivery_fee, 0), COALESCE(p_discount, 0), v_calculated_total,
    v_calculated_advance, COALESCE(p_payment_type, 'advance'), v_clean_utr, v_is_khata,
    CASE WHEN v_is_khata THEN 'confirmed' ELSE 'pending' END,
    p_address, p_phone, p_pin, p_delivery_slot, COALESCE(p_delivery_date, 'standard'), v_is_khata, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total,
    advance_amount = EXCLUDED.advance_amount,
    delivery_date = COALESCE(EXCLUDED.delivery_date, orders.delivery_date),
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
$$;

GRANT EXECUTE ON FUNCTION public.create_order_atomic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb,text) TO anon, authenticated;

-- 3. Profiles RLS: Allow anon to SELECT profile
DROP POLICY IF EXISTS "profiles_select_authenticated_only" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
CREATE POLICY "profiles_select_public" ON public.profiles FOR SELECT TO anon, authenticated USING (true);

-- 4. Orders RLS: Allow anon to INSERT, SELECT, UPDATE orders
DROP POLICY IF EXISTS "orders_anon_blocked" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_authenticated" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_public" ON public.orders;
CREATE POLICY "orders_insert_public" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "orders_select_own_or_staff" ON public.orders;
DROP POLICY IF EXISTS "orders_select_public" ON public.orders;
CREATE POLICY "orders_select_public" ON public.orders FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "orders_update_own_or_staff" ON public.orders;
DROP POLICY IF EXISTS "orders_update_public" ON public.orders;
CREATE POLICY "orders_update_public" ON public.orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. Order Items RLS: Allow anon to INSERT, SELECT order_items
DROP POLICY IF EXISTS "order_items_anon_blocked" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_authenticated" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_authenticated" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_public" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_public" ON public.order_items;
CREATE POLICY "order_items_select_public" ON public.order_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "order_items_insert_public" ON public.order_items FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 6. Addresses RLS: Allow anon to manage addresses
DROP POLICY IF EXISTS "addresses_anon_blocked" ON public.addresses;
DROP POLICY IF EXISTS "addresses_select_own_or_staff" ON public.addresses;
DROP POLICY IF EXISTS "addresses_insert_own" ON public.addresses;
DROP POLICY IF EXISTS "addresses_update_own" ON public.addresses;
DROP POLICY IF EXISTS "addresses_delete_own" ON public.addresses;
DROP POLICY IF EXISTS "addresses_all_public" ON public.addresses;
CREATE POLICY "addresses_all_public" ON public.addresses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 7. Support & Order Messages RLS: Allow anon
DROP POLICY IF EXISTS "support_messages_anon_blocked" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_select_own_or_staff" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_update_own_or_staff" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_insert_authenticated" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_all_public" ON public.support_messages;
CREATE POLICY "support_messages_all_public" ON public.support_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "order_messages_anon_blocked" ON public.order_messages;
DROP POLICY IF EXISTS "order_messages_select_authenticated" ON public.order_messages;
DROP POLICY IF EXISTS "order_messages_insert_authenticated" ON public.order_messages;
DROP POLICY IF EXISTS "order_messages_all_public" ON public.order_messages;
CREATE POLICY "order_messages_all_public" ON public.order_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 8. Coupons & Reviews & Notifications & Khata RLS: Allow anon
DROP POLICY IF EXISTS "coupons_select_authenticated" ON public.coupons;
DROP POLICY IF EXISTS "coupons_select_public" ON public.coupons;
CREATE POLICY "coupons_select_public" ON public.coupons FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "product_reviews_authenticated_insert" ON public.product_reviews;
DROP POLICY IF EXISTS "product_reviews_public_insert" ON public.product_reviews;
CREATE POLICY "product_reviews_public_insert" ON public.product_reviews FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_staff" ON public.notifications;
DROP POLICY IF EXISTS "notifications_all_public" ON public.notifications;
CREATE POLICY "notifications_all_public" ON public.notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "khata_select_authenticated" ON public.khata_ledger;
DROP POLICY IF EXISTS "khata_insert_authenticated" ON public.khata_ledger;
DROP POLICY IF EXISTS "khata_select_public" ON public.khata_ledger;
DROP POLICY IF EXISTS "khata_insert_public" ON public.khata_ledger;
CREATE POLICY "khata_select_public" ON public.khata_ledger FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "khata_insert_public" ON public.khata_ledger FOR INSERT TO anon, authenticated WITH CHECK (true);
