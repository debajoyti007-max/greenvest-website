-- 004_fix_triggers_and_weights.sql
-- Fix broken triggers, coupon schema consistency, weight columns, and atomic order placement

-- 1. Drop broken order total validation trigger
DROP TRIGGER IF EXISTS validate_order_total_trigger ON orders;
DROP FUNCTION IF EXISTS validate_order_total();

-- 2. Add missing order columns
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'advance';

-- 3. Add weight columns to order_items
ALTER TABLE public.order_items 
  ADD COLUMN IF NOT EXISTS weight_multiplier numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS weight_label text NOT NULL DEFAULT '1 kg';

-- 4. Standardize Coupons Table Schema
-- Ensure coupons table exists with both naming conventions supported
CREATE TABLE IF NOT EXISTS public.coupons (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'flat' CHECK (discount_type IN ('flat', 'percent')),
  discount_value numeric NOT NULL DEFAULT 0,
  min_order numeric NOT NULL DEFAULT 0,
  max_uses int,
  used_count int NOT NULL DEFAULT 0,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  valid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add columns if coupons table was already created
ALTER TABLE public.coupons 
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS valid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS valid_until timestamptz;

-- Auto-sync valid <-> active and expires_at <-> valid_until
CREATE OR REPLACE FUNCTION public.sync_coupon_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.valid IS DISTINCT FROM OLD.valid OR OLD.valid IS NULL THEN
    NEW.active := NEW.valid;
  ELSIF NEW.active IS DISTINCT FROM OLD.active THEN
    NEW.valid := NEW.active;
  END IF;

  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at OR OLD.expires_at IS NULL THEN
    NEW.valid_until := NEW.expires_at;
  ELSIF NEW.valid_until IS DISTINCT FROM OLD.valid_until THEN
    NEW.expires_at := NEW.valid_until;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_coupon_fields ON public.coupons;
CREATE TRIGGER trg_sync_coupon_fields
BEFORE INSERT OR UPDATE ON public.coupons
FOR EACH ROW
EXECUTE FUNCTION public.sync_coupon_fields();

-- 5. Standardize isBlocked on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS "isBlocked" boolean NOT NULL DEFAULT false;

-- 6. Atomic Server-Side Order Creation Procedure
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_id text,
  p_user_id uuid,
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
  p_items jsonb
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
      RAISE EXCEPTION 'Product % not found.', v_prod_id;
    END IF;

    -- Base price for selected grade
    IF v_grade = 'A' THEN
      v_unit_base_price := COALESCE(v_product.p_a, v_product.p_b);
    ELSIF v_grade = 'C' THEN
      v_unit_base_price := COALESCE(v_product.p_c, v_product.p_b);
    ELSE
      v_unit_base_price := v_product.p_b;
    END IF;

    -- Unit price adjusted for weight
    v_line_unit_price := ROUND(v_unit_base_price * v_weight_mult);
    v_calculated_subtotal := v_calculated_subtotal + (v_line_unit_price * v_qty);
  END LOOP;

  -- Calculate total
  v_calculated_total := GREATEST(0, v_calculated_subtotal + COALESCE(p_delivery_fee, 0) - COALESCE(p_discount, 0));

  -- Calculate advance based on payment_type
  IF p_payment_type = 'full' THEN
    v_calculated_advance := v_calculated_total;
  ELSE
    v_calculated_advance := CEIL(v_calculated_total * 0.5);
  END IF;

  -- Insert master order
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
    IF v_grade = 'A' THEN
      v_unit_base_price := COALESCE(v_product.p_a, v_product.p_b);
    ELSIF v_grade = 'C' THEN
      v_unit_base_price := COALESCE(v_product.p_c, v_product.p_b);
    ELSE
      v_unit_base_price := v_product.p_b;
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
    'subtotal', v_calculated_subtotal,
    'total', v_calculated_total,
    'advance_amount', v_calculated_advance
  );
END;
$$;
