-- ============================================================
-- GreenVest Migration 010: Landmark / Delivery Notes
-- Applied: September 2026
-- Adds delivery_notes column to orders for rural/landmark delivery
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_notes text;
