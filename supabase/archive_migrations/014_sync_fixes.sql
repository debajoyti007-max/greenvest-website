-- ============================================================
-- Migration 014 — Backend/Frontend Sync Fixes
-- Fixes 5 database-level issues found in the 2026-09-07 audit
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- FIX C1: Consolidate dual isBlocked columns on profiles
-- Legacy `isBlocked` (camelCase) and current `is_blocked` (snake_case)
-- Sync any rows where isBlocked=true but is_blocked=false, then drop old col
-- ─────────────────────────────────────────────────────────────
UPDATE public.profiles
SET is_blocked = TRUE
WHERE "isBlocked" = TRUE AND is_blocked = FALSE;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS "isBlocked";

-- ─────────────────────────────────────────────────────────────
-- FIX C2: Notifications INSERT policy — restrict to admin/seller only
-- Previously: any authenticated user could push broadcast notifications
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS notifications_insert_staff ON public.notifications;

CREATE POLICY notifications_insert_staff ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()::text
        AND role IN ('admin', 'seller')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- FIX C3: Upgrade save_product_admin RPC to include new product columns
-- Adds: mrp, available_grades, sold_as, gram_options, stock_qty
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.save_product_admin(text, text, text, numeric, numeric, numeric, boolean, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.save_product_admin(
  p_id              text,
  p_name            text,
  p_bn_name         text,
  p_p_a             numeric,
  p_p_b             numeric,
  p_p_c             numeric,
  p_in_stock        boolean,
  p_category        text,
  p_unit            text,
  p_image_url       text    DEFAULT NULL,
  p_emoji           text    DEFAULT '🥬',
  p_archived        boolean DEFAULT false,
  -- New columns added after original RPC creation:
  p_mrp             numeric DEFAULT NULL,
  p_available_grades text[]  DEFAULT ARRAY['A','B','C'],
  p_sold_as         text    DEFAULT 'loose',
  p_gram_options    integer[] DEFAULT NULL,
  p_stock_qty       numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

GRANT EXECUTE ON FUNCTION public.save_product_admin TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- FIX M2: Products — drop over-permissive SELECT policy that leaks
-- archived products publicly, keep the filtered one, add staff bypass
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS products_select_public ON public.products;

-- Ensure the good filtered policy exists (public sees only non-archived)
DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
  FOR SELECT TO anon, authenticated
  USING (archived = FALSE OR archived IS NULL);

-- Staff (admin/seller) can see ALL products including archived
DROP POLICY IF EXISTS products_staff_read_all ON public.products;
CREATE POLICY products_staff_read_all ON public.products
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()::text
        AND role IN ('admin', 'seller')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- FIX M5: product_reviews UPDATE policy — use auth.uid() not deprecated
-- current_setting() JWT approach which is fragile with Supabase auth changes
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS product_reviews_owner_update ON public.product_reviews;

CREATE POLICY product_reviews_owner_update ON public.product_reviews
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ─────────────────────────────────────────────────────────────
-- Verification — check the final state of fixed items
-- ─────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name='profiles' AND table_schema='public'
-- ORDER BY ordinal_position;
