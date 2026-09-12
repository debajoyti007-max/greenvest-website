-- Migration 018: Complete Role Wiring & RLS Permissions for PIN-Based Architecture

-- 1. Products: Allow insert, update, delete for anon & authenticated
DROP POLICY IF EXISTS products_staff_insert ON products;
DROP POLICY IF EXISTS products_staff_update ON products;
DROP POLICY IF EXISTS products_staff_delete ON products;

CREATE POLICY products_insert_public ON products FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY products_update_public ON products FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY products_delete_public ON products FOR DELETE TO anon, authenticated USING (true);

-- 2. Profiles: Allow update & delete for anon & authenticated
DROP POLICY IF EXISTS profiles_update_own_or_admin ON profiles;
DROP POLICY IF EXISTS profiles_delete_admin_only ON profiles;

CREATE POLICY profiles_update_public ON profiles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY profiles_delete_public ON profiles FOR DELETE TO anon, authenticated USING (true);

-- 3. Coupons: Allow insert, update, delete for anon & authenticated
DROP POLICY IF EXISTS coupons_staff_write ON coupons;
DROP POLICY IF EXISTS coupons_staff_update ON coupons;
DROP POLICY IF EXISTS coupons_delete_public ON coupons;

CREATE POLICY coupons_insert_public ON coupons FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY coupons_update_public ON coupons FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY coupons_delete_public ON coupons FOR DELETE TO anon, authenticated USING (true);

-- 4. Promotional Deals: Allow insert, update, delete for anon & authenticated
DROP POLICY IF EXISTS promotional_deals_insert_staff ON promotional_deals;
DROP POLICY IF EXISTS promotional_deals_update_staff ON promotional_deals;
DROP POLICY IF EXISTS promotional_deals_delete_staff ON promotional_deals;

CREATE POLICY promotional_deals_insert_public ON promotional_deals FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY promotional_deals_update_public ON promotional_deals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY promotional_deals_delete_public ON promotional_deals FOR DELETE TO anon, authenticated USING (true);

-- 5. Daily Reports & Telemetry: Allow staff writes for anon & authenticated
DROP POLICY IF EXISTS daily_reports_staff_only ON daily_reports;
CREATE POLICY daily_reports_all_public ON daily_reports FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 6. RPC Grants: Ensure all staff and customer RPCs have anon EXECUTE permissions
GRANT EXECUTE ON FUNCTION update_order_status_admin(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_order_admin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_user_admin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_coupon_admin(text, text, numeric, numeric, boolean, timestamp with time zone) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_utr_admin(text, boolean) TO anon, authenticated;
