DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_safe" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated_only" ON public.profiles;

CREATE POLICY "profiles_select_authenticated_only"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

SELECT 'profiles RLS fixed' AS status;
