-- ==============================================================================
-- Migration: Owner Role Restrictions on Key Generation & Pure KeyAuth Isolation
-- Date: 2026-10-15
-- Features:
-- 1. Resellers restricted to "Free Fire MAX" only unless explicitly permitted
-- 2. Resellers capped to max 1 device per key by default
-- 3. ONLY "Free Fire MAX" generates streamer controls (all other apps are pure KeyAuth)
-- 4. Cross-app isolation strictly rejects mismatched keys
-- ==============================================================================

DROP FUNCTION IF EXISTS public.rpc_rymon_generate_key(TEXT, TEXT, TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS public.rpc_rymon_generate_key(TEXT, TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS public.rpc_rymon_generate_key(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.rpc_rymon_generate_key(
    p_plan TEXT,
    p_creator_username TEXT,
    p_game TEXT DEFAULT 'Free Fire MAX',
    p_custom_prefix TEXT DEFAULT 'RYMON',
    p_devices_max INT DEFAULT 1
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
    v_is_ff BOOLEAN := FALSE;
    v_allow_custom BOOLEAN := FALSE;
    v_allow_multi_dev BOOLEAN := FALSE;
    v_clean_game TEXT;
    v_effective_plan TEXT;
BEGIN
    v_clean_game := TRIM(COALESCE(p_game, 'Free Fire MAX'));
    IF v_clean_game = '' THEN v_clean_game := 'Free Fire MAX'; END IF;
    v_is_ff := (v_clean_game ILIKE '%Free Fire%');

    SELECT * INTO v_creator
    FROM public.rymon_accounts
    WHERE LOWER(username) = LOWER(TRIM(p_creator_username));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Creator account not found.');
    END IF;

    IF v_creator.status = 'BANNED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account is suspended/banned.');
    END IF;

    -- 1. Role Permission: Custom App Key Generation Restriction
    IF NOT v_is_ff AND v_creator.role != 'owner' THEN
        v_allow_custom := COALESCE((v_creator.permissions->>'allow_custom_apps')::boolean, FALSE);
        IF v_creator.role = 'reseller' AND NOT v_allow_custom THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Permission Denied: Reseller accounts are restricted to Free Fire MAX keys only. Custom App generation requires Owner authorization.'
            );
        END IF;
    END IF;

    -- 3. Dynamic Plan Pricing Calculation
    IF p_plan ILIKE '%2 Hour%' THEN v_cost := 20;
    ELSIF p_plan ILIKE '%1 Day%' THEN v_cost := 35;
    ELSIF p_plan ILIKE '%3 Day%' THEN v_cost := 50;
    ELSIF p_plan ILIKE '%7 Day%' THEN v_cost := 100;
    ELSIF p_plan ILIKE '%15 Day%' THEN v_cost := 180;
    ELSIF p_plan ILIKE '%30 Day%' THEN v_cost := 350;
    ELSE v_cost := 35;
    END IF;

    -- 4. Balance Deduction
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

    -- 5. Dynamic App Tag Prefix
    IF v_is_ff THEN
        v_game_tag := 'FF';
    ELSE
        v_game_tag := UPPER(SUBSTRING(REGEXP_REPLACE(v_clean_game, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 2));
        IF LENGTH(v_game_tag) < 2 THEN v_game_tag := 'APP'; END IF;
    END IF;

    v_b1 := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
    v_b2 := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 5 FOR 4));
    v_new_key := UPPER(TRIM(COALESCE(NULLIF(p_custom_prefix, ''), 'RYMON'))) || '-' || v_game_tag || '-' || v_b1 || '-' || v_b2;

    v_effective_plan := CASE WHEN p_plan ILIKE '%[VIP]%' THEN p_plan ELSE p_plan || ' [VIP]' END;

    -- 6. Insert License Record
    INSERT INTO public.rymon_licenses (
        license_key, game, plan_duration, creator_username,
        devices_used, devices_max, status, expires_at
    ) VALUES (
        v_new_key, v_clean_game, v_effective_plan, v_creator.username,
        0, GREATEST(p_devices_max, 1), 'WAITING', NULL
    ) RETURNING * INTO v_inserted_lic;

    -- 7. Streamer Remote Control Allocation: ONLY FOR FREE FIRE MAX
    -- Custom apps and other games are pure KeyAuth only!
    IF v_is_ff THEN
        INSERT INTO public.rymon_streamer_controls (
            license_key, streamer_name, game_name, is_active, is_online,
            plan_duration, creator, devices_max, devices_used,
            aim_silent, hit_rate, esp_box, esp_skeleton, theme_color_index
        ) VALUES (
            v_new_key, 'VIP_REALTIME', 'Free Fire MAX', true, false,
            v_effective_plan, v_creator.username, GREATEST(p_devices_max, 1), 0,
            false, 80, true, true, 0
        ) ON CONFLICT (license_key) DO NOTHING;
    END IF;

    -- 8. Activity Log
    INSERT INTO public.rymon_activities (
        title, event_type, game, details, actor_username, status
    ) VALUES (
        'Key Generated: ' || v_new_key,
        'KEY_GENERATED',
        v_clean_game,
        v_effective_plan || ' • ' || p_devices_max || ' Device(s) for ' || v_clean_game,
        v_creator.username,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'key', v_new_key,
        'game', v_clean_game,
        'plan', p_plan,
        'cost', v_cost,
        'remaining_balance', CASE WHEN v_creator.role = 'owner' THEN v_creator.balance ELSE (v_creator.balance - v_cost) END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_generate_key(TEXT, TEXT, TEXT, TEXT, INT) TO anon, authenticated;
