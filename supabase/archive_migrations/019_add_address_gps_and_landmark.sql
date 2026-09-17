-- Migration 019: Add GPS coordinates and visual landmark to public.addresses
-- Enables cloud syncing of customer front door GPS pin for 1-tap re-ordering

ALTER TABLE public.addresses
ADD COLUMN IF NOT EXISTS geo_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS geo_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS landmark TEXT;
