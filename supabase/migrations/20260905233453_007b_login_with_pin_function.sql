CREATE OR REPLACE FUNCTION public.login_with_pin(p_identifier text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE lower(email) = lower(trim(p_identifier))
     OR phone = regexp_replace(p_identifier, '\D', '', 'g')
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM pg_sleep(0.1);
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid credentials');
  END IF;

  IF v_profile.is_blocked THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account is blocked. Contact support.');
  END IF;

  IF v_profile.pin IS DISTINCT FROM p_pin THEN
    PERFORM pg_sleep(0.1);
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid credentials');
  END IF;

  RETURN jsonb_build_object(
    'ok',                 true,
    'id',                 v_profile.id,
    'email',              v_profile.email,
    'name',               v_profile.name,
    'role',               v_profile.role,
    'phone',              v_profile.phone,
    'is_super_admin',     v_profile.is_super_admin,
    'is_blocked',         v_profile.is_blocked,
    'tier',               v_profile.tier,
    'khata_approved',     v_profile.khata_approved,
    'khata_credit_limit', v_profile.khata_credit_limit,
    'avatar_url',         v_profile.avatar_url
  );
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.login_with_pin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_with_pin(text, text) TO anon, authenticated;

SELECT 'login_with_pin function created' AS status;
