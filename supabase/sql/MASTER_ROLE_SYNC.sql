-- ============================================================
-- MS VEGETABLE CENTER (greenvest.shop)
-- MASTER ROLE SYNC & PERMISSIONS REPAIR SCRIPT
-- File: supabase/sql/MASTER_ROLE_SYNC.sql
-- ============================================================
-- Description:
-- Idempotent, 1-click execution script that synchronizes all
-- tables, RLS policies, RPC functions, and execution permissions
-- across ALL user roles: Customer, Rider, Seller, Admin, and
-- Shadow Super Admin.
--
-- Can be safely run in Supabase Dashboard -> SQL Editor at any time.
-- ============================================================

-- ------------------------------------------------------------
-- PART 1: CUSTOMER ROLE POLICIES & PERMISSIONS
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_insert_public ON public.orders;
DROP POLICY IF EXISTS orders_select_public ON public.orders;
DROP POLICY IF EXISTS orders_update_public ON public.orders;
CREATE POLICY orders_insert_public ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY orders_select_public ON public.orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY orders_update_public ON public.orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS order_items_insert_public ON public.order_items;
DROP POLICY IF EXISTS order_items_select_public ON public.order_items;
CREATE POLICY order_items_insert_public ON public.order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY order_items_select_public ON public.order_items FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS addresses_all_public ON public.addresses;
CREATE POLICY addresses_all_public ON public.addresses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS product_reviews_public_read ON public.product_reviews;
DROP POLICY IF EXISTS product_reviews_public_insert ON public.product_reviews;
CREATE POLICY product_reviews_public_read ON public.product_reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY product_reviews_public_insert ON public.product_reviews FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS support_messages_all_public ON public.support_messages;
DROP POLICY IF EXISTS order_messages_all_public ON public.order_messages;
CREATE POLICY support_messages_all_public ON public.support_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY order_messages_all_public ON public.order_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS notifications_all_public ON public.notifications;
CREATE POLICY notifications_all_public ON public.notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- PART 2: SELLER ROLE POLICIES & PERMISSIONS
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.promotional_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_staff_insert ON public.products;
DROP POLICY IF EXISTS products_staff_update ON public.products;
DROP POLICY IF EXISTS products_staff_delete ON public.products;
DROP POLICY IF EXISTS products_select_policy ON public.products;
DROP POLICY IF EXISTS products_select_public ON public.products;
DROP POLICY IF EXISTS products_insert_public ON public.products;
DROP POLICY IF EXISTS products_update_public ON public.products;
DROP POLICY IF EXISTS products_delete_public ON public.products;

CREATE POLICY products_select_public ON public.products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY products_insert_public ON public.products FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY products_update_public ON public.products FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY products_delete_public ON public.products FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS promotional_deals_insert_staff ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_update_staff ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_delete_staff ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_select_policy ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_select_public ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_insert_public ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_update_public ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_delete_public ON public.promotional_deals;

CREATE POLICY promotional_deals_select_public ON public.promotional_deals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY promotional_deals_insert_public ON public.promotional_deals FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY promotional_deals_update_public ON public.promotional_deals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY promotional_deals_delete_public ON public.promotional_deals FOR DELETE TO anon, authenticated USING (true);

-- ------------------------------------------------------------
-- PART 3: ADMIN & PROFILES POLICIES
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_authenticated_only ON public.profiles;
DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_public ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own_or_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_admin_only ON public.profiles;
DROP POLICY IF EXISTS profiles_update_public ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_public ON public.profiles;

CREATE POLICY profiles_select_public ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY profiles_insert_public ON public.profiles FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY profiles_update_public ON public.profiles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY profiles_delete_public ON public.profiles FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS coupons_staff_write ON public.coupons;
DROP POLICY IF EXISTS coupons_staff_update ON public.coupons;
DROP POLICY IF EXISTS coupons_delete_public ON public.coupons;
DROP POLICY IF EXISTS coupons_select_public ON public.coupons;
DROP POLICY IF EXISTS coupons_insert_public ON public.coupons;
DROP POLICY IF EXISTS coupons_update_public ON public.coupons;

CREATE POLICY coupons_select_public ON public.coupons FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY coupons_insert_public ON public.coupons FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY coupons_update_public ON public.coupons FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY coupons_delete_public ON public.coupons FOR DELETE TO anon, authenticated USING (true);

-- ------------------------------------------------------------
-- PART 4: RPC EXECUTION GRANTS FOR ALL ROLES
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.check_account_exists(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_with_pin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_customer_atomic(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_pin_with_verification(text, text, text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.verify_delivery_handover(text, text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_product_admin(text, text, text, numeric, numeric, numeric, boolean, text, text, text, text, boolean, numeric, text[], text, integer[], numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status_admin(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_orders(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_order_admin(text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_user_role_admin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_block_admin(text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_admin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_customers(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_coupon_admin(text, text, numeric, numeric, boolean, timestamp with time zone) TO anon, authenticated;
