-- 002_backend_features.sql

-- ## B1: UTR Server Validation Trigger
CREATE OR REPLACE FUNCTION validate_utr()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check UTR is 12+ digit numeric string
  IF NEW.utr IS NOT NULL THEN
    IF NEW.utr !~ '^[0-9]{12,}$' THEN
      RAISE EXCEPTION 'UTR must be at least 12 digits long and contain only numbers.';
    END IF;

    -- Check no other non-cancelled order has the same UTR
    IF EXISTS (
      SELECT 1 FROM orders 
      WHERE utr = NEW.utr 
      AND id != NEW.id 
      AND status != 'cancelled'
    ) THEN
      RAISE EXCEPTION 'This UTR has already been used for another active order.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_utr_trigger ON orders;
CREATE TRIGGER validate_utr_trigger
BEFORE INSERT OR UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION validate_utr();


-- ## B2: Order Amount Server Validation Trigger
CREATE OR REPLACE FUNCTION validate_order_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_calculated_subtotal numeric;
BEGIN
  -- Recalculate subtotal from order_items (sum of qty * unit_price)
  SELECT COALESCE(SUM(qty * unit_price), 0)
  INTO v_calculated_subtotal
  FROM order_items
  WHERE order_id = NEW.id;

  -- If calculated subtotal differs from orders.subtotal by more than ₹1, update orders.subtotal and total to correct values
  IF ABS(v_calculated_subtotal - NEW.subtotal) > 1 THEN
    UPDATE orders
    SET 
      subtotal = v_calculated_subtotal,
      total = v_calculated_subtotal + delivery_fee - discount,
      advance_amount = CEIL((v_calculated_subtotal + delivery_fee - discount) * 0.5)
    WHERE id = NEW.id;
  ELSE
    -- Ensure advance_amount = ceil(total * 0.5)
    IF NEW.advance_amount != CEIL(NEW.total * 0.5) THEN
      UPDATE orders
      SET advance_amount = CEIL(NEW.total * 0.5)
      WHERE id = NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_order_total_trigger ON orders;
CREATE TRIGGER validate_order_total_trigger
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION validate_order_total();


-- ## B3: Rate Limit Function
CREATE OR REPLACE FUNCTION check_order_rate_limit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  order_count int;
BEGIN
  -- Count orders by this user in last 1 hour
  SELECT COUNT(*)
  INTO order_count
  FROM orders
  WHERE user_id = p_user_id
  AND created_at >= NOW() - INTERVAL '1 hour';
  
  -- Return false if >= 5 orders in last hour
  IF order_count >= 5 THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;


-- ## B4: Auto-Cancel Unpaid Orders
CREATE OR REPLACE FUNCTION auto_cancel_stale_orders()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  stale_order RECORD;
  o_item RECORD;
BEGIN
  -- Finds orders where status = 'advance_paid' AND utr_verified = false AND created_at < now() - interval '24 hours'
  FOR stale_order IN 
    SELECT id 
    FROM orders 
    WHERE status = 'advance_paid' 
      AND utr_verified = false 
      AND created_at < NOW() - INTERVAL '24 hours'
  LOOP
    -- Updates their status to 'cancelled'
    UPDATE orders SET status = 'cancelled' WHERE id = stale_order.id;
    
    -- Restocks products (add back qty to stock_qty, set in_stock = true)
    FOR o_item IN SELECT product_id, grade, qty FROM order_items WHERE order_id = stale_order.id LOOP
      -- Update general stock and availability based on prompt logic
      UPDATE products 
      SET 
        stock_qty = stock_qty + o_item.qty,
        in_stock = true
      WHERE id = o_item.product_id;
    END LOOP;
  END LOOP;
END;
$$;

-- Wrap pg_cron in a DO block with exception handler in case pg_cron extension isn't enabled.
DO $$
BEGIN
  -- Attempt to schedule with pg_cron
  PERFORM cron.schedule('auto-cancel-stale', '0 * * * *', 'SELECT auto_cancel_stale_orders()');
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'pg_cron extension not found, skipping cron schedule creation.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Error setting up pg_cron schedule: %', SQLERRM;
END;
$$;


-- ## B5: Daily Reports Table
CREATE TABLE IF NOT EXISTS daily_reports (
  id bigserial PRIMARY KEY,
  report_date date NOT NULL UNIQUE,
  total_orders int NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  total_cancelled int NOT NULL DEFAULT 0,
  mandi_cost numeric NOT NULL DEFAULT 0,
  delivery_cost numeric NOT NULL DEFAULT 0,
  profit numeric GENERATED ALWAYS AS (total_revenue - mandi_cost - delivery_cost) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for daily_reports
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller_admin_all_daily_reports" 
ON daily_reports FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('seller', 'admin')
  )
);


-- ## B6: Customer Addresses Table
CREATE TABLE IF NOT EXISTS addresses (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Home',
  address text NOT NULL,
  phone text NOT NULL,
  pin text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

-- Users can CRUD their own addresses
CREATE POLICY "users_crud_own_addresses"
ON addresses FOR ALL
USING (user_id = auth.uid());

-- Seller/admin can read all
CREATE POLICY "seller_admin_read_all_addresses"
ON addresses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('seller', 'admin')
  )
);


-- ## B7: Order Status History Log
CREATE TABLE IF NOT EXISTS order_status_log (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_status_log ENABLE ROW LEVEL SECURITY;

-- seller/admin can read all
CREATE POLICY "seller_admin_read_order_log"
ON order_status_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('seller', 'admin')
  )
);

-- Customers can read their own order logs
CREATE POLICY "customer_read_own_order_log"
ON order_status_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_status_log.order_id
    AND orders.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status != NEW.status THEN
    INSERT INTO order_status_log (order_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_status_trigger ON orders;
CREATE TRIGGER order_status_trigger
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION log_order_status_change();


-- ## B9: Price History Table
CREATE TABLE IF NOT EXISTS price_history (
  id bigserial PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  grade text NOT NULL CHECK (grade IN ('A', 'B', 'C')),
  old_price numeric NOT NULL,
  new_price numeric NOT NULL,
  changed_by uuid REFERENCES profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller_admin_read_price_history"
ON price_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('seller', 'admin')
  )
);

CREATE OR REPLACE FUNCTION log_price_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If OLD.p_a != NEW.p_a, insert row for grade A
  IF OLD.p_a IS DISTINCT FROM NEW.p_a THEN
    INSERT INTO price_history (product_id, grade, old_price, new_price, changed_by)
    VALUES (NEW.id, 'A', OLD.p_a, NEW.p_a, auth.uid());
  END IF;
  
  -- If OLD.p_b != NEW.p_b, insert row for grade B
  IF OLD.p_b IS DISTINCT FROM NEW.p_b THEN
    INSERT INTO price_history (product_id, grade, old_price, new_price, changed_by)
    VALUES (NEW.id, 'B', OLD.p_b, NEW.p_b, auth.uid());
  END IF;
  
  -- If OLD.p_c != NEW.p_c, insert row for grade C
  IF OLD.p_c IS DISTINCT FROM NEW.p_c THEN
    INSERT INTO price_history (product_id, grade, old_price, new_price, changed_by)
    VALUES (NEW.id, 'C', OLD.p_c, NEW.p_c, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_price_trigger ON products;
CREATE TRIGGER product_price_trigger
AFTER UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION log_price_change();


-- ## B10: Delivery Zones Table
CREATE TABLE IF NOT EXISTS delivery_zones (
  id bigserial PRIMARY KEY,
  pin_prefix text NOT NULL UNIQUE,
  zone text NOT NULL DEFAULT 'standard',
  fee numeric NOT NULL DEFAULT 40,
  eta_hours text NOT NULL DEFAULT '12-24 hours',
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_delivery_zones"
ON delivery_zones FOR SELECT
USING (true);

CREATE POLICY "seller_admin_update_delivery_zones"
ON delivery_zones FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('seller', 'admin')
  )
);

-- Seed with initial data
INSERT INTO delivery_zones (pin_prefix, zone, fee, eta_hours)
VALUES 
  ('72163', 'local', 30, '6-8 hours'),
  ('7216', 'nearby', 50, '12-18 hours'),
  ('7211', 'nearby', 50, '12-18 hours'),
  ('721', 'nearby', 50, '12-18 hours'),
  ('700', 'nearby', 50, '12-18 hours'),
  ('711', 'nearby', 50, '12-18 hours'),
  ('71', 'nearby', 50, '18-24 hours'),
  ('72', 'nearby', 50, '18-24 hours')
ON CONFLICT (pin_prefix) DO NOTHING;


-- ## B11: Coupons Table
CREATE TABLE IF NOT EXISTS coupons (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'flat' CHECK (discount_type IN ('flat', 'percent')),
  discount_value numeric NOT NULL DEFAULT 0,
  min_order numeric NOT NULL DEFAULT 0,
  max_uses int,
  used_count int NOT NULL DEFAULT 0,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_active_coupons"
ON coupons FOR SELECT
USING (active = true);

CREATE POLICY "seller_admin_crud_coupons"
ON coupons FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('seller', 'admin')
  )
);

CREATE OR REPLACE FUNCTION validate_coupon(p_code text, p_order_total numeric)
RETURNS TABLE(valid boolean, discount numeric, message text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_coupon record;
  v_discount numeric := 0;
BEGIN
  -- Find coupon by code (case insensitive)
  SELECT * INTO v_coupon
  FROM coupons
  WHERE LOWER(code) = LOWER(p_code);

  -- Check if coupon exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::numeric, 'Invalid coupon code'::text;
    RETURN;
  END IF;

  -- Check active
  IF NOT v_coupon.active THEN
    RETURN QUERY SELECT false, 0::numeric, 'Coupon is inactive'::text;
    RETURN;
  END IF;

  -- Check within date range
  IF (v_coupon.valid_from IS NOT NULL AND NOW() < v_coupon.valid_from) OR
     (v_coupon.valid_until IS NOT NULL AND NOW() > v_coupon.valid_until) THEN
    RETURN QUERY SELECT false, 0::numeric, 'Coupon is expired or not yet valid'::text;
    RETURN;
  END IF;

  -- Check max_uses
  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
    RETURN QUERY SELECT false, 0::numeric, 'Coupon usage limit reached'::text;
    RETURN;
  END IF;

  -- Check min_order
  IF p_order_total < v_coupon.min_order THEN
    RETURN QUERY SELECT false, 0::numeric, 'Order total does not meet minimum requirement'::text;
    RETURN;
  END IF;

  -- Calculate discount (flat or percent, capped at order total)
  IF v_coupon.discount_type = 'flat' THEN
    v_discount := LEAST(v_coupon.discount_value, p_order_total);
  ELSIF v_coupon.discount_type = 'percent' THEN
    v_discount := LEAST((p_order_total * v_coupon.discount_value / 100), p_order_total);
  END IF;

  -- Return success
  RETURN QUERY SELECT true, v_discount, 'Coupon applied successfully'::text;
END;
$$;

-- Seed one welcome coupon: FRESH50, flat ₹50 off, min order ₹500, max 100 uses.
INSERT INTO coupons (code, discount_type, discount_value, min_order, max_uses)
VALUES ('FRESH50', 'flat', 50, 500, 100)
ON CONFLICT (code) DO NOTHING;
