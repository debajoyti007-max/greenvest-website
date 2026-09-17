-- ============================================================
-- GreenVest Migration 006: Secure Super Admin DB Verification
-- Moves super admin identity from client-side VITE_ env vars
-- into the database, where it cannot be read from the JS bundle.
-- ============================================================

-- 1. Add is_super_admin column to profiles (DB owner only can set this)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. Set the store owner as Super Admin
UPDATE public.profiles SET is_super_admin = true, role = 'admin' WHERE email = 'debajoyti007@gmail.com';

-- 3. Protect the is_super_admin column from self-promotion by users
CREATE OR REPLACE FUNCTION public.protect_super_admin_col()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    RAISE EXCEPTION 'Unauthorized: is_super_admin can only be changed by the database owner';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_super_admin_trigger ON public.profiles;
CREATE TRIGGER protect_super_admin_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_col();

-- 4. OTP rate-limit tracking (locked to service role only via no RLS policies)
CREATE TABLE IF NOT EXISTS public.admin_otp_attempts (
  email TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ DEFAULT now(),
  locked_until TIMESTAMPTZ
);
ALTER TABLE public.admin_otp_attempts ENABLE ROW LEVEL SECURITY;
