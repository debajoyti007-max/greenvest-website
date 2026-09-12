-- ============================================================
-- ROLE: ADMIN / SHADOW SUPER ADMIN
-- MODULE: Security Protections, Owner Shield & Anti-Escalation
-- File: supabase/sql/admin/03_shadow_admin_guards.sql
-- ============================================================
-- Description:
-- Core security triggers for database ownership:
-- 1. protect_super_admin_trigger: Prevents altering owner is_super_admin status
-- 2. trg_prevent_profile_escalation: Blocks self-promotion from customer to admin,
--    self-approving Khata credit limits, or unblocking oneself without admin RPC
-- ============================================================

-- 1. SUPER ADMIN COLUMN INTEGRITY TRIGGER
CREATE OR REPLACE FUNCTION public.protect_super_admin_col()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_super_admin_col();


-- 2. ANTI-ESCALATION GUARD TRIGGER
CREATE OR REPLACE FUNCTION public.prevent_profile_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If authorized by any admin RPC, allow everything
  IF current_setting('app.allow_profile_change', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- service_role always allowed
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Role escalation guard: Customers cannot self-elevate to admin/seller/rider
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.role IN ('admin', 'seller', 'rider') AND OLD.role = 'customer' THEN
      RAISE EXCEPTION 'Role escalation denied. Use the admin panel to change roles.';
    END IF;
  END IF;

  -- Khata self-approval guard
  IF NEW.khata_approved IS DISTINCT FROM OLD.khata_approved
     AND NEW.khata_approved = TRUE AND OLD.khata_approved = FALSE THEN
    RAISE EXCEPTION 'Khata self-approval denied. Admin approval required.';
  END IF;

  -- Khata credit limit increase guard
  IF NEW.khata_credit_limit IS DISTINCT FROM OLD.khata_credit_limit
     AND NEW.khata_credit_limit > COALESCE(OLD.khata_credit_limit, 0) THEN
    RAISE EXCEPTION 'Khata credit limit increase denied. Admin approval required.';
  END IF;

  -- Self-unblock guard
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
     AND OLD.is_blocked = TRUE AND NEW.is_blocked = FALSE THEN
    RAISE EXCEPTION 'Self-unblock denied. Contact support.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_escalation();
