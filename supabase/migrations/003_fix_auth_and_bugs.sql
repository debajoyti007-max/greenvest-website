-- 003_fix_auth_and_bugs_v2.sql
-- Fixed version: drops dependent policies first before altering column types
-- Run in Supabase → SQL Editor → Run

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Drop ALL policies on profiles (they block the column type change)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_own_or_staff" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update_roles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_anyone" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_anon_check" ON public.profiles;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Drop ALL FK constraints that reference profiles(id) or orders(user_id)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
ALTER TABLE public.addresses DROP CONSTRAINT IF EXISTS addresses_user_id_fkey;
ALTER TABLE public.order_status_log DROP CONSTRAINT IF EXISTS order_status_log_changed_by_fkey;
ALTER TABLE public.price_history DROP CONSTRAINT IF EXISTS price_history_changed_by_fkey;

-- Drop the original profiles PK + FK to auth.users
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Alter profiles.id to text
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.profiles ADD PRIMARY KEY (id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Add missing columns to profiles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS "isBlocked" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pin text NOT NULL DEFAULT '';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Alter orders.user_id to text and re-add FK
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Alter addresses.user_id to text and re-add FK
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.addresses ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.addresses
  ADD CONSTRAINT addresses_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: Alter order_status_log.changed_by to text and re-add FK
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_status_log ALTER COLUMN changed_by TYPE text USING changed_by::text;
ALTER TABLE public.order_status_log
  ADD CONSTRAINT order_status_log_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: Alter price_history.changed_by to text and re-add FK
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.price_history ALTER COLUMN changed_by TYPE text USING changed_by::text;
ALTER TABLE public.price_history
  ADD CONSTRAINT price_history_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9: Fix check_order_rate_limit function (uuid param → text)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_order_rate_limit(p_user_id text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  order_count int;
BEGIN
  SELECT COUNT(*)
  INTO order_count
  FROM orders
  WHERE user_id = p_user_id
  AND created_at >= NOW() - INTERVAL '1 hour';
  IF order_count >= 5 THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 10: Recreate ALL profiles RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Anon: can SELECT (needed for signup duplicate email check)
CREATE POLICY "profiles_select_anon_check" ON public.profiles
  FOR SELECT TO anon
  USING (true);

-- Authenticated: can select own row or if staff
CREATE POLICY "profiles_select_own_or_staff" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()::text
    OR public.current_role() IN ('seller', 'admin')
  );

-- Anyone (anon + authenticated): can INSERT (needed for custom auth signup)
CREATE POLICY "profiles_insert_anyone" ON public.profiles
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Authenticated: can update own profile (non-role fields)
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()::text)
  WITH CHECK (
    id = auth.uid()::text
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()::text)
  );

-- Admin: can update any profile (role changes)
CREATE POLICY "profiles_admin_update_roles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 11: Drop the old Supabase Auth trigger (no longer needed)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ─────────────────────────────────────────────────────────────────────────────
-- Done! New users can now sign up and log in from any device.
-- ─────────────────────────────────────────────────────────────────────────────
