-- ==============================================================================
-- MIGRATION: 20260920190558_add_products_updated_at.sql
-- Description: Add missing updated_at column to public.products to resolve 
--              "column 'updated_at' of relation 'products' does not exist" 
--              when saving/editing vegetables via save_product_admin RPC.
-- ==============================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
