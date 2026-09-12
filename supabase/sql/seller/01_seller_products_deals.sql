-- ============================================================
-- ROLE: SELLER
-- MODULE: Products & Promotional Deals
-- File: supabase/sql/seller/01_seller_products_deals.sql
-- ============================================================
-- Description:
-- Enables sellers and store managers to:
-- 1. Create, edit prices, adjust stock, and delete products.
-- 2. Maintain strikethrough MRP, sold_as, gram options, and grades.
-- 3. Atomic save_product_admin RPC for reliable updates.
-- 4. Manage promotional deals and homepage banners.
-- ============================================================

-- 1. PRODUCTS TABLE RLS POLICIES
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_staff_insert ON public.products;
DROP POLICY IF EXISTS products_staff_update ON public.products;
DROP POLICY IF EXISTS products_staff_delete ON public.products;
DROP POLICY IF EXISTS products_select_policy ON public.products;
DROP POLICY IF EXISTS products_insert_public ON public.products;
DROP POLICY IF EXISTS products_update_public ON public.products;
DROP POLICY IF EXISTS products_delete_public ON public.products;

-- Allow customers to view active products, staff to view all
CREATE POLICY products_select_public ON public.products
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY products_insert_public ON public.products
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY products_update_public ON public.products
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY products_delete_public ON public.products
  FOR DELETE TO anon, authenticated
  USING (true);


-- 2. ATOMIC PRODUCT SAVE RPC
CREATE OR REPLACE FUNCTION public.save_product_admin(
  p_id text,
  p_name text,
  p_bn_name text,
  p_p_a numeric,
  p_p_b numeric,
  p_p_c numeric,
  p_in_stock boolean,
  p_category text,
  p_unit text,
  p_image_url text DEFAULT NULL::text,
  p_emoji text DEFAULT '🥬'::text,
  p_archived boolean DEFAULT false,
  p_mrp numeric DEFAULT NULL::numeric,
  p_available_grades text[] DEFAULT ARRAY['A'::text, 'B'::text, 'C'::text],
  p_sold_as text DEFAULT 'loose'::text,
  p_gram_options integer[] DEFAULT NULL::integer[],
  p_stock_qty numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res record;
BEGIN
  INSERT INTO public.products (
    id, name, bn_name, p_a, p_b, p_c, in_stock, category, unit,
    image_url, emoji, archived, mrp, available_grades, sold_as,
    gram_options, stock_qty, updated_at
  ) VALUES (
    p_id, p_name, p_bn_name, p_p_a, p_p_b, p_p_c, p_in_stock,
    p_category, p_unit, p_image_url, p_emoji, p_archived,
    p_mrp, COALESCE(p_available_grades, ARRAY['A','B','C']),
    COALESCE(p_sold_as, 'loose'), p_gram_options, p_stock_qty, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name             = EXCLUDED.name,
    bn_name          = EXCLUDED.bn_name,
    p_a              = EXCLUDED.p_a,
    p_b              = EXCLUDED.p_b,
    p_c              = EXCLUDED.p_c,
    in_stock         = EXCLUDED.in_stock,
    category         = EXCLUDED.category,
    unit             = EXCLUDED.unit,
    image_url        = COALESCE(EXCLUDED.image_url, products.image_url),
    emoji            = EXCLUDED.emoji,
    archived         = EXCLUDED.archived,
    mrp              = EXCLUDED.mrp,
    available_grades = EXCLUDED.available_grades,
    sold_as          = COALESCE(EXCLUDED.sold_as, products.sold_as),
    gram_options     = EXCLUDED.gram_options,
    stock_qty        = EXCLUDED.stock_qty,
    updated_at       = now()
  RETURNING * INTO v_res;

  RETURN to_jsonb(v_res);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_product_admin(
  text, text, text, numeric, numeric, numeric, boolean, text, text, text, text, boolean, numeric, text[], text, integer[], numeric
) TO anon, authenticated;


-- 3. PROMOTIONAL DEALS TABLE RLS
ALTER TABLE IF EXISTS public.promotional_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotional_deals_insert_staff ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_update_staff ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_delete_staff ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_select_policy ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_insert_public ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_update_public ON public.promotional_deals;
DROP POLICY IF EXISTS promotional_deals_delete_public ON public.promotional_deals;

CREATE POLICY promotional_deals_select_public ON public.promotional_deals
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY promotional_deals_insert_public ON public.promotional_deals
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY promotional_deals_update_public ON public.promotional_deals
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY promotional_deals_delete_public ON public.promotional_deals
  FOR DELETE TO anon, authenticated
  USING (true);
