-- ==============================================================================
-- Migration: Multi-App KeyAuth Isolation & Dynamic App Verification
-- Date: 2026-10-15
-- Features:
-- 1. rpc_rymon_verify_license now accepts (p_license_key, p_hwid, p_game)
-- 2. Strict Cross-App Key Isolation:
--    - Keys generated for "Free Fire MAX" fail on "BGMI" or other apps
--    - Keys generated for "Universal" work on all apps
-- 3. rpc_rymon_generate_key supports dynamic game tag prefixes (FF, BG, UV, CD, etc.)
-- ==============================================================================

-- Drop overloaded variants first to avoid PostgreSQL function signature collision
DROP FUNCTION IF EXISTS public.rpc_rymon_verify_license(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_verify_license(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.rpc_rymon_verify_license(
    p_license_key TEXT,
    p_hwid TEXT DEFAULT '',
    p_game TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_key TEXT;
    v_lic public.rymon_licenses%ROWTYPE;
    v_calc_expiry TIMESTAMPTZ;
    v_duration_interval INTERVAL := INTERVAL '30 days';
    v_req_game TEXT;
    v_lic_game TEXT;
BEGIN
    v_clean_key := UPPER(TRIM(COALESCE(p_license_key, '')));
    v_req_game  := TRIM(COALESCE(p_game, ''));

    IF v_clean_key = '' THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'License key cannot be empty.'
        );
    END IF;

    -- 1. Master Owner Key Bypass
    IF v_clean_key = 'RYMON-MASTER-KEY' OR v_clean_key LIKE '%MASTER%' OR v_clean_key LIKE '%OWNER%' THEN
        RETURN jsonb_build_object(
            'valid', true,
            'key', v_clean_key,
            'game', CASE WHEN v_req_game != '' THEN v_req_game ELSE 'Universal' END,
            'plan', 'Lifetime',
            'creator', 'rymon',
            'status', 'ACTIVE',
            'is_master', true,
            'expires_at', (now() + INTERVAL '10 years'),
            'devices_used', 1,
            'devices_max', 999
        );
    END IF;

    -- 2. Lookup License Record
    SELECT * INTO v_lic
    FROM public.rymon_licenses
    WHERE license_key = v_clean_key;

    IF NOT FOUND THEN
        -- Check Streamer Controls table fallback
        IF EXISTS (SELECT 1 FROM public.rymon_streamer_controls WHERE license_key = v_clean_key) THEN
            RETURN jsonb_build_object(
                'valid', true,
                'key', v_clean_key,
                'game', CASE WHEN v_req_game != '' THEN v_req_game ELSE 'Free Fire MAX' END,
                'plan', '30 Days',
                'status', 'ACTIVE',
                'expires_at', (now() + INTERVAL '30 days'),
                'devices_used', 1,
                'devices_max', 1
            );
        END IF;

        RETURN jsonb_build_object(
            'valid', false,
            'error', 'License key not found. Check key string or generate a new key.'
        );
    END IF;

    -- 3. Check Status
    IF v_lic.status = 'BANNED' THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'License key has been revoked/banned by administrator.'
        );
    END IF;

    -- 4. Cross-App Isolation Enforcement
    v_lic_game := TRIM(COALESCE(v_lic.game, ''));
    IF v_req_game != '' 
       AND UPPER(v_lic_game) NOT IN ('UNIVERSAL', 'ALL', 'ANY', 'GLOBAL') 
       AND LOWER(v_lic_game) != LOWER(v_req_game) THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'App Mismatch! This key is only valid for "' || v_lic_game || '", not "' || v_req_game || '". Contact administrator for access.'
        );
    END IF;

    -- 5. Parse Duration Interval
    IF v_lic.plan_duration ILIKE '%2 Hour%' THEN v_duration_interval := INTERVAL '2 hours';
    ELSIF v_lic.plan_duration ILIKE '%1 Day%' THEN v_duration_interval := INTERVAL '1 day';
    ELSIF v_lic.plan_duration ILIKE '%3 Day%' THEN v_duration_interval := INTERVAL '3 days';
    ELSIF v_lic.plan_duration ILIKE '%7 Day%' THEN v_duration_interval := INTERVAL '7 days';
    ELSIF v_lic.plan_duration ILIKE '%15 Day%' THEN v_duration_interval := INTERVAL '15 days';
    ELSIF v_lic.plan_duration ILIKE '%30 Day%' THEN v_duration_interval := INTERVAL '30 days';
    ELSE v_duration_interval := INTERVAL '30 days';
    END IF;

    -- 6. First-time Activation (WAITING -> ACTIVE)
    IF v_lic.status = 'WAITING' OR v_lic.expires_at IS NULL THEN
        v_calc_expiry := now() + v_duration_interval;
        UPDATE public.rymon_licenses
        SET status = 'ACTIVE',
            expires_at = v_calc_expiry,
            devices_used = 1,
            device_hwid = COALESCE(NULLIF(p_hwid, ''), 'DEFAULT-DEVICE'),
            last_heartbeat = now(),
            updated_at = now()
        WHERE id = v_lic.id;

        UPDATE public.rymon_streamer_controls
        SET is_active = true,
            is_online = true,
            expires_at = v_calc_expiry,
            device_hwid = COALESCE(NULLIF(p_hwid, ''), 'DEFAULT-DEVICE'),
            devices_used = 1,
            last_heartbeat = now()
        WHERE license_key = v_clean_key;

        v_lic.status := 'ACTIVE';
        v_lic.expires_at := v_calc_expiry;
        v_lic.devices_used := 1;
    ELSE
        -- Check Expiration
        IF v_lic.expires_at < now() THEN
            UPDATE public.rymon_licenses SET status = 'EXPIRED' WHERE id = v_lic.id;
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'License key expired on ' || to_char(v_lic.expires_at, 'DD/MM/YYYY HH24:MI')
            );
        END IF;

        -- Check HWID binding
        IF p_hwid != '' AND v_lic.device_hwid != '' AND v_lic.device_hwid != p_hwid AND v_lic.devices_used >= v_lic.devices_max THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'HWID mismatch! Key is locked to another device. Reset via Telegram @Rymon007bot.'
            );
        END IF;

        -- Update heartbeat
        UPDATE public.rymon_licenses
        SET last_heartbeat = now(),
            device_hwid = CASE WHEN v_lic.device_hwid = '' THEN p_hwid ELSE v_lic.device_hwid END,
            devices_used = GREATEST(v_lic.devices_used, 1),
            updated_at = now()
        WHERE id = v_lic.id;

        UPDATE public.rymon_streamer_controls
        SET last_heartbeat = now(),
            is_online = true
        WHERE license_key = v_clean_key;
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'key', v_lic.license_key,
        'game', v_lic.game,
        'app', v_lic.game,
        'plan', v_lic.plan_duration,
        'creator', v_lic.creator_username,
        'status', v_lic.status,
        'expires_at', v_lic.expires_at,
        'devices_used', v_lic.devices_used,
        'devices_max', v_lic.devices_max
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_verify_license(TEXT, TEXT, TEXT) TO anon, authenticated;

-- Upgrade rpc_rymon_generate_key with multi-app tag support
CREATE OR REPLACE FUNCTION public.rpc_rymon_generate_key(
    p_creator_username  TEXT,
    p_game              TEXT DEFAULT 'Free Fire MAX',
    p_plan              TEXT DEFAULT '1 Day',
    p_custom_prefix     TEXT DEFAULT 'RYMON',
    p_devices_max       INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_creator public.rymon_accounts%ROWTYPE;
    v_cost NUMERIC := 35;
    v_new_key TEXT;
    v_game_tag TEXT := 'FF';
    v_b1 TEXT;
    v_b2 TEXT;
    v_inserted_lic public.rymon_licenses%ROWTYPE;
BEGIN
    SELECT * INTO v_creator
    FROM public.rymon_accounts
    WHERE LOWER(username) = LOWER(TRIM(p_creator_username));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Creator account not found.');
    END IF;

    -- Pricing
    IF p_plan ILIKE '%2 Hour%' THEN v_cost := 20;
    ELSIF p_plan ILIKE '%1 Day%' THEN v_cost := 35;
    ELSIF p_plan ILIKE '%3 Day%' THEN v_cost := 50;
    ELSIF p_plan ILIKE '%7 Day%' THEN v_cost := 100;
    ELSIF p_plan ILIKE '%15 Day%' THEN v_cost := 180;
    ELSIF p_plan ILIKE '%30 Day%' THEN v_cost := 350;
    ELSE v_cost := 35;
    END IF;

    -- Balance check
    IF v_creator.role != 'owner' THEN
        IF v_creator.balance < v_cost THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Insufficient balance! Key cost is ₹' || v_cost || ', but your balance is ₹' || v_creator.balance
            );
        END IF;

        UPDATE public.rymon_accounts
        SET balance = balance - v_cost,
            updated_at = now()
        WHERE id = v_creator.id;
    END IF;

    -- Dynamic App Tag Prefix
    IF p_game ILIKE '%Free Fire%' THEN v_game_tag := 'FF';
    ELSIF p_game ILIKE '%BGMI%' THEN v_game_tag := 'BG';
    ELSIF p_game ILIKE '%Universal%' THEN v_game_tag := 'UV';
    ELSIF p_game ILIKE '%Call of Duty%' OR p_game ILIKE '%CODM%' THEN v_game_tag := 'CD';
    ELSE
        v_game_tag := UPPER(SUBSTRING(REGEXP_REPLACE(p_game, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 2));
        IF LENGTH(v_game_tag) < 2 THEN v_game_tag := 'APP'; END IF;
    END IF;

    v_b1 := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
    v_b2 := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 5 FOR 4));
    v_new_key := UPPER(TRIM(COALESCE(NULLIF(p_custom_prefix, ''), 'RYMON'))) || '-' || v_game_tag || '-' || v_b1 || '-' || v_b2;

    -- Insert License Record
    INSERT INTO public.rymon_licenses (
        license_key, game, plan_duration, creator_username,
        devices_used, devices_max, status, expires_at
    ) VALUES (
        v_new_key, p_game, p_plan, v_creator.username,
        0, GREATEST(p_devices_max, 1), 'WAITING', NULL
    ) RETURNING * INTO v_inserted_lic;

    -- ONLY Free Fire MAX (and Universal) gets Streamer Controls (ESP/Aimbot/Telemetry)
    -- Other games/apps are pure KeyAuth only!
    IF p_game ILIKE '%Free Fire%' OR p_game ILIKE '%Universal%' THEN
        INSERT INTO public.rymon_streamer_controls (
            license_key, streamer_name, game_name, is_active, is_online,
            plan_duration, creator, devices_max, devices_used,
            aim_silent, hit_rate, esp_box, esp_skeleton, theme_color_index
        ) VALUES (
            v_new_key, 'VIP Streamer', p_game, true, false,
            p_plan, v_creator.username, GREATEST(p_devices_max, 1), 0,
            false, 80, true, true, 0
        ) ON CONFLICT (license_key) DO NOTHING;
    END IF;

    -- Log Activity
    INSERT INTO public.rymon_activities (
        title, event_type, game, details, actor_username, status
    ) VALUES (
        'Key Generated: ' || v_new_key,
        'KEY_GENERATED',
        p_game,
        p_plan || ' • ' || p_devices_max || ' Device(s) for ' || p_game,
        v_creator.username,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'key', v_new_key,
        'game', p_game,
        'plan', p_plan,
        'cost', v_cost,
        'remaining_balance', CASE WHEN v_creator.role = 'owner' THEN v_creator.balance ELSE (v_creator.balance - v_cost) END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_generate_key(TEXT, TEXT, TEXT, TEXT, INT) TO anon, authenticated;
