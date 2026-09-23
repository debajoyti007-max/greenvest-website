-- ============================================================
-- Migration 031: Customer Addresses Security Definer RPCs
-- Allows PIN-authenticated and regular customers to securely
-- fetch, save, and delete delivery addresses without direct table RLS issues.
-- ============================================================

-- ── 1. Save / Upsert Customer Address ─────────────────────────
CREATE OR REPLACE FUNCTION public.save_customer_address(
  p_user_id text,
  p_address text,
  p_phone text DEFAULT '',
  p_label text DEFAULT 'Home',
  p_pin text DEFAULT NULL,
  p_is_default boolean DEFAULT true,
  p_geo_lat double precision DEFAULT NULL,
  p_geo_lng double precision DEFAULT NULL,
  p_landmark text DEFAULT NULL,
  p_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_res public.addresses%ROWTYPE;
  v_clean_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_pin text := trim(coalesce(p_pin, ''));
  v_addr text := trim(coalesce(p_address, ''));
  v_label text := trim(coalesce(p_label, 'Home'));
BEGIN
  IF trim(coalesce(p_user_id, '')) = '' OR v_addr = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User ID and address are required.');
  END IF;

  -- If this address is set as default, reset previous default
  IF coalesce(p_is_default, true) = true THEN
    UPDATE public.addresses
    SET is_default = false
    WHERE user_id = p_user_id;
  END IF;

  IF p_id IS NOT NULL AND p_id > 0 THEN
    UPDATE public.addresses
    SET label = v_label,
        address = v_addr,
        phone = coalesce(nullif(v_clean_phone, ''), phone),
        pin = coalesce(nullif(v_pin, ''), pin),
        is_default = coalesce(p_is_default, true),
        geo_lat = coalesce(p_geo_lat, geo_lat),
        geo_lng = coalesce(p_geo_lng, geo_lng),
        landmark = coalesce(p_landmark, landmark)
    WHERE id = p_id AND user_id = p_user_id
    RETURNING * INTO v_res;
  END IF;

  IF v_res.id IS NULL THEN
    INSERT INTO public.addresses (
      user_id, label, address, phone, pin, is_default, geo_lat, geo_lng, landmark, created_at
    ) VALUES (
      p_user_id,
      v_label,
      v_addr,
      coalesce(v_clean_phone, ''),
      nullif(v_pin, ''),
      coalesce(p_is_default, true),
      p_geo_lat,
      p_geo_lng,
      p_landmark,
      now()
    )
    RETURNING * INTO v_res;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'address', jsonb_build_object(
      'id', v_res.id,
      'user_id', v_res.user_id,
      'label', v_res.label,
      'address', v_res.address,
      'phone', v_res.phone,
      'pin', v_res.pin,
      'is_default', v_res.is_default,
      'geo_lat', v_res.geo_lat,
      'geo_lng', v_res.geo_lng,
      'landmark', v_res.landmark
    )
  );
END;
$$;

-- ── 2. Get Customer Addresses ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_customer_addresses(
  p_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF trim(coalesce(p_user_id, '')) = '' THEN
    RETURN jsonb_build_object('ok', true, 'addresses', '[]'::jsonb);
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'user_id', a.user_id,
        'label', a.label,
        'address', a.address,
        'phone', a.phone,
        'pin', a.pin,
        'is_default', a.is_default,
        'geo_lat', a.geo_lat,
        'geo_lng', a.geo_lng,
        'landmark', a.landmark
      )
      ORDER BY a.is_default DESC NULLS LAST, a.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_res
  FROM public.addresses a
  WHERE a.user_id = trim(p_user_id);

  RETURN jsonb_build_object('ok', true, 'addresses', v_res);
END;
$$;

-- ── 3. Delete Customer Address ────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_customer_address(
  p_user_id text,
  p_address_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM public.addresses
  WHERE id = p_address_id AND user_id = trim(p_user_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 4. Permissions ───────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.save_customer_address(text, text, text, text, text, boolean, double precision, double precision, text, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_addresses(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_customer_address(text, bigint) TO anon, authenticated;
