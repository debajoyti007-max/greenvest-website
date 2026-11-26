-- ==============================================================================
-- FIX LEGACY DISTRIBUTED FREE FIRE MAX CLIENTS & KEYAUTH CONNECT ISOLATION
-- Preserves Catch A (App Secret) & Catch B (App Name) for:
--   1. All requests hitting KeyAuth /connect Edge Gateway (api/connect.js & worker.js)
--   2. All custom applications (non-Free Fire MAX) & any request passing p_secret
-- While allowing legacy pre-installed Free Fire MAX binaries/APKs (which call
-- rpc_rymon_verify_license directly with empty p_secret) to authenticate
-- Free Fire MAX / Universal keys without breaking existing resellers/customers.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_rymon_verify_license(
    p_license_key TEXT,
    p_hwid        TEXT DEFAULT ''::TEXT,
    p_game        TEXT DEFAULT ''::TEXT,
    p_secret      TEXT DEFAULT ''::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_key         TEXT;
    v_clean_hwid        TEXT;
    v_norm_hwid         TEXT;
    v_req_game          TEXT;
    v_clean_secret      TEXT;
    v_expected_secret   TEXT;
    v_lic               public.rymon_licenses%ROWTYPE;
    v_calc_expiry       TIMESTAMPTZ;
    v_duration_interval INTERVAL := INTERVAL '30 days';
    v_lic_game          TEXT;
    v_effective_app     TEXT;
    v_is_legacy_ff      BOOLEAN := false;
    v_gf                TEXT := '0xAD68E18';
    v_hwid_parts        TEXT[];
    v_hwid_matched      BOOLEAN := false;
    v_part              TEXT;
    v_new_hwids         TEXT;
    v_used_count        INT := 1;
    v_apps              JSONB;
    v_app_elem          JSONB;
    v_app_status        TEXT;
    v_app_announcement  TEXT;
BEGIN
    v_clean_key    := UPPER(TRIM(COALESCE(p_license_key, '')));
    v_clean_hwid   := TRIM(COALESCE(p_hwid, ''));
    v_norm_hwid    := public.fn_rymon_normalize_hwid(v_clean_hwid);
    v_req_game     := TRIM(COALESCE(p_game, ''));
    v_clean_secret := TRIM(COALESCE(p_secret, ''));

    IF v_clean_key = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'License key cannot be empty.');
    END IF;

    IF v_clean_key = 'RYMON-MASTER-KEY' OR v_clean_key LIKE '%MASTER%' OR v_clean_key LIKE '%OWNER%' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Invalid license key. Master key bypass has been permanently revoked.');
    END IF;

    IF v_clean_hwid = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Device HWID is required for license verification.');
    END IF;

    -- Catch A + B validation when secret or custom app is supplied
    IF v_clean_secret != '' THEN
        IF v_req_game = '' THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'Application name (app) is required. Keys cannot be used without specifying a target app.'
            );
        END IF;
        v_expected_secret := public.fn_rymon_expected_app_secret(v_req_game);
        IF v_expected_secret = '' OR v_clean_secret != v_expected_secret THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'Invalid App Secret! Please verify your application secret credential.'
            );
        END IF;
    ELSIF v_req_game != '' AND LOWER(v_req_game) != 'free fire max' THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'Invalid App Secret! Custom applications must pass a valid secret credential.'
        );
    END IF;

    -- Lookup License Record before checking legacy Free Fire MAX backward compatibility
    SELECT * INTO v_lic FROM public.rymon_licenses WHERE license_key = v_clean_key;
    IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM public.rymon_streamer_controls WHERE license_key = v_clean_key) THEN
            INSERT INTO public.rymon_licenses (
                license_key, game, plan_duration, creator_username,
                devices_used, devices_max, device_hwid, status, expires_at, created_at, updated_at, is_paused
            )
            SELECT
                sc.license_key,
                COALESCE(NULLIF(sc.game_name, ''), 'Free Fire MAX'),
                COALESCE(NULLIF(sc.plan_duration, ''), '1 Day'),
                COALESCE(NULLIF(sc.creator, ''), 'debajoyti'),
                0,
                GREATEST(COALESCE(sc.devices_max, 1), 1),
                COALESCE(sc.device_hwid, ''),
                CASE WHEN sc.is_active THEN 'ACTIVE' ELSE 'BANNED' END,
                sc.expires_at,
                now(), now(), COALESCE(sc.is_paused, false)
            FROM public.rymon_streamer_controls sc
            WHERE sc.license_key = v_clean_key
            ON CONFLICT (license_key) DO UPDATE SET updated_at = now()
            RETURNING * INTO v_lic;
        ELSE
            RETURN jsonb_build_object('valid', false, 'error', 'License key not found. Check key string or generate a new key.');
        END IF;
    END IF;

    v_lic_game := TRIM(COALESCE(v_lic.game, 'Free Fire MAX'));
    IF v_lic_game = '' THEN v_lic_game := 'Free Fire MAX'; END IF;

    -- Legacy direct-RPC compatibility: only distributed Free Fire MAX binaries may omit p_secret for Free Fire MAX / Universal keys
    v_is_legacy_ff := (v_clean_secret = '')
                      AND (v_req_game = '' OR LOWER(v_req_game) = 'free fire max')
                      AND (LOWER(v_lic_game) = 'free fire max' OR UPPER(v_lic_game) IN ('UNIVERSAL', 'ALL', 'ANY', 'GLOBAL'));

    IF v_clean_secret = '' AND NOT v_is_legacy_ff THEN
        IF v_req_game = '' THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'Application name (app) is required. Custom-app keys cannot be used without app & secret credentials.'
            );
        END IF;
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'Invalid App Secret! Please verify your application secret credential.'
        );
    END IF;

    v_effective_app := COALESCE(NULLIF(v_req_game, ''), v_lic_game);

    -- Check App Maintenance Killswitch directly in DB
    SELECT value INTO v_apps
    FROM public.rymon_system_config
    WHERE key = 'registered_apps'
    LIMIT 1;

    IF v_apps IS NOT NULL AND jsonb_typeof(v_apps) = 'array' THEN
        FOR v_app_elem IN SELECT * FROM jsonb_array_elements(v_apps) LOOP
            IF LOWER(TRIM(COALESCE(v_app_elem->>'name', ''))) = LOWER(v_effective_app)
               OR LOWER(TRIM(COALESCE(v_app_elem->>'id', ''))) = LOWER(v_effective_app) THEN
                v_app_status := UPPER(TRIM(COALESCE(v_app_elem->>'status', 'ACTIVE')));
                v_app_announcement := TRIM(COALESCE(v_app_elem->>'announcement', ''));
                IF v_app_status IN ('MAINTENANCE', 'INACTIVE') THEN
                    RETURN jsonb_build_object(
                        'valid', false,
                        'maintenance', true,
                        'announcement', v_app_announcement,
                        'error', '🛠️ ' || COALESCE(NULLIF(v_app_elem->>'name', ''), v_effective_app) || ' is currently under maintenance. Please try again later.'
                    );
                END IF;
                EXIT;
            END IF;
        END LOOP;
    END IF;

    IF v_lic.status = 'BANNED' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'License key has been revoked/banned by administrator.');
    END IF;

    IF COALESCE(v_lic.is_paused, false) THEN
        RETURN jsonb_build_object('valid', false, 'is_paused', true, 'error', 'License key is paused by administrator.');
    END IF;

    -- Strict Cross-App Isolation whenever caller specifies target app
    IF v_req_game != ''
       AND UPPER(v_lic_game) NOT IN ('UNIVERSAL', 'ALL', 'ANY', 'GLOBAL')
       AND LOWER(v_lic_game) != LOWER(v_req_game) THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'App Mismatch! This key is only valid for "' || v_lic_game || '", not "' || v_req_game || '". Contact administrator for access.'
        );
    END IF;

    IF v_lic.plan_duration ILIKE '%hour%' THEN
        v_duration_interval := (COALESCE(NULLIF(SUBSTRING(v_lic.plan_duration FROM '([0-9]+)'), ''), '2') || ' hours')::INTERVAL;
    ELSIF v_lic.plan_duration ILIKE '%month%' THEN
        v_duration_interval := (COALESCE(NULLIF(SUBSTRING(v_lic.plan_duration FROM '([0-9]+)'), ''), '1') || ' months')::INTERVAL;
    ELSIF v_lic.plan_duration ILIKE '%year%' THEN
        v_duration_interval := (COALESCE(NULLIF(SUBSTRING(v_lic.plan_duration FROM '([0-9]+)'), ''), '1') || ' years')::INTERVAL;
    ELSE
        v_duration_interval := (COALESCE(NULLIF(SUBSTRING(v_lic.plan_duration FROM '([0-9]+)'), ''), '1') || ' days')::INTERVAL;
    END IF;

    IF v_lic.status = 'WAITING' OR v_lic.expires_at IS NULL THEN
        v_calc_expiry := now() + v_duration_interval;

        UPDATE public.rymon_licenses
        SET status = 'ACTIVE',
            expires_at = v_calc_expiry,
            devices_used = 1,
            device_hwid = v_clean_hwid,
            last_heartbeat = now(),
            updated_at = now()
        WHERE id = v_lic.id;

        UPDATE public.rymon_streamer_controls
        SET is_active = true,
            is_online = true,
            expires_at = v_calc_expiry,
            device_hwid = v_clean_hwid,
            devices_used = 1,
            last_heartbeat = now(),
            updated_at = now()
        WHERE license_key = v_clean_key;

        v_lic.status := 'ACTIVE';
        v_lic.expires_at := v_calc_expiry;
        v_lic.devices_used := 1;
        v_lic.device_hwid := v_clean_hwid;
    ELSE
        IF v_lic.expires_at < now() THEN
            UPDATE public.rymon_licenses SET status = 'EXPIRED', updated_at = now() WHERE id = v_lic.id;
            UPDATE public.rymon_streamer_controls SET is_active = false, is_online = false, updated_at = now() WHERE license_key = v_clean_key;
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'License key expired on ' || to_char(v_lic.expires_at, 'DD/MM/YYYY HH24:MI')
            );
        END IF;

        IF COALESCE(v_lic.device_hwid, '') != '' THEN
            v_hwid_parts := ARRAY(
                SELECT TRIM(x) FROM UNNEST(STRING_TO_ARRAY(v_lic.device_hwid, '|')) AS x
                WHERE TRIM(x) != ''
            );
            v_used_count := GREATEST(COALESCE(array_length(v_hwid_parts, 1), 0), COALESCE(v_lic.devices_used, 1));

            FOREACH v_part IN ARRAY v_hwid_parts LOOP
                IF public.fn_rymon_normalize_hwid(v_part) = v_norm_hwid THEN
                    v_hwid_matched := true;
                    EXIT;
                END IF;
            END LOOP;

            IF NOT v_hwid_matched THEN
                IF COALESCE(array_length(v_hwid_parts, 1), 0) < GREATEST(1, COALESCE(v_lic.devices_max, 1)) THEN
                    v_new_hwids := array_to_string(array_append(v_hwid_parts, v_clean_hwid), '|');
                    v_used_count := COALESCE(array_length(v_hwid_parts, 1), 0) + 1;
                    UPDATE public.rymon_licenses
                    SET device_hwid = v_new_hwids,
                        devices_used = v_used_count,
                        last_heartbeat = now(),
                        updated_at = now()
                    WHERE id = v_lic.id;

                    UPDATE public.rymon_streamer_controls
                    SET device_hwid = v_new_hwids,
                        devices_used = v_used_count,
                        last_heartbeat = now(),
                        is_online = true,
                        updated_at = now()
                    WHERE license_key = v_clean_key;

                    v_lic.device_hwid := v_new_hwids;
                    v_lic.devices_used := v_used_count;
                ELSE
                    RETURN jsonb_build_object(
                        'valid', false,
                        'error', 'HWID mismatch! Key is locked to another device. Reset via Telegram @Rymon007bot.'
                    );
                END IF;
            END IF;
        ELSE
            UPDATE public.rymon_licenses
            SET device_hwid = v_clean_hwid,
                devices_used = 1,
                last_heartbeat = now(),
                updated_at = now()
            WHERE id = v_lic.id;

            UPDATE public.rymon_streamer_controls
            SET device_hwid = v_clean_hwid,
                devices_used = 1,
                last_heartbeat = now(),
                is_online = true,
                updated_at = now()
            WHERE license_key = v_clean_key;

            v_lic.device_hwid := v_clean_hwid;
            v_lic.devices_used := 1;
        END IF;

        UPDATE public.rymon_licenses
        SET last_heartbeat = now(),
            devices_used = GREATEST(v_lic.devices_used, 1),
            updated_at = now()
        WHERE id = v_lic.id;

        UPDATE public.rymon_streamer_controls
        SET last_heartbeat = now(),
            is_online = true,
            devices_used = GREATEST(devices_used, 1),
            updated_at = now()
        WHERE license_key = v_clean_key;
    END IF;

    BEGIN
        SELECT value->>'game_facade' INTO v_gf
        FROM public.rymon_system_config
        WHERE key = 'sovereign_security_policy';
    EXCEPTION WHEN OTHERS THEN
        v_gf := '0xAD68E18';
    END;
    IF v_gf IS NULL OR v_gf = '' THEN
        v_gf := '0xAD68E18';
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'key', v_lic.license_key,
        'game', v_lic.game,
        'app', v_lic.game,
        'plan', v_lic.plan_duration,
        'creator', v_lic.creator_username,
        'status', v_lic.status,
        'is_paused', COALESCE(v_lic.is_paused, false),
        'expires_at', v_lic.expires_at,
        'devices_used', v_lic.devices_used,
        'devices_max', v_lic.devices_max,
        'gf', v_gf
    );
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_verify_license(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_verify_license(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
