-- ==============================================================================
-- RYMON GHOST CONNECT - COMPLETE SOVEREIGN BACKEND & KEYAUTH DATABASE ENGINE
-- Project: greenvest.shop (Supabase zvjqpigduyvczidzafus)
-- Roles: OWNER, ADMIN, RESELLER, STREAMER
-- Features: Per-key verification, HWID device binding, real login, wallet balance,
--           Top-up balance, auto balance deduction on key generation, audit log
-- ==============================================================================

-- 1. Create Accounts Table (Owner, Admin, Reseller, Streamer)
CREATE TABLE IF NOT EXISTS public.rymon_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    email           TEXT DEFAULT '',
    role            TEXT NOT NULL DEFAULT 'reseller' CHECK (role IN ('owner', 'admin', 'reseller', 'streamer')),
    balance         NUMERIC NOT NULL DEFAULT 0,
    uplink          TEXT DEFAULT 'rymon',
    referral_code   TEXT DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BANNED')),
    expires_at      TIMESTAMPTZ DEFAULT (now() + INTERVAL '365 days'),
    permissions     JSONB DEFAULT '{"dashboard":true,"generate_key":true,"license_keys":true,"telegram_bot":true,"account_settings":true,"security":true}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create Licenses Table (Per-Key Verification & HWID Binding)
CREATE TABLE IF NOT EXISTS public.rymon_licenses (
    id                  BIGSERIAL PRIMARY KEY,
    license_key         TEXT UNIQUE NOT NULL,
    game                TEXT NOT NULL DEFAULT 'Free Fire MAX',
    plan_duration       TEXT NOT NULL DEFAULT '30 Days',
    creator_username    TEXT NOT NULL,
    devices_used        INT NOT NULL DEFAULT 0,
    devices_max         INT NOT NULL DEFAULT 1,
    device_hwid         TEXT DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('ACTIVE', 'WAITING', 'EXPIRED', 'BANNED')),
    expires_at          TIMESTAMPTZ,
    last_heartbeat      TIMESTAMPTZ DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create Streamer Controls & Telemetry Table (1:1 with license_key)
CREATE TABLE IF NOT EXISTS public.rymon_streamer_controls (
    license_key         TEXT PRIMARY KEY,
    streamer_name       TEXT NOT NULL DEFAULT 'VIP Streamer',
    game_name           TEXT NOT NULL DEFAULT 'Free Fire MAX',
    device_hwid         TEXT DEFAULT '',
    is_active           BOOLEAN NOT NULL DEFAULT true,
    is_online           BOOLEAN NOT NULL DEFAULT false,
    last_heartbeat      TIMESTAMPTZ DEFAULT now(),
    expires_at          TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
    plan_duration       TEXT DEFAULT '30 Days',
    creator             TEXT DEFAULT 'rymon',
    devices_max         INT DEFAULT 1,
    devices_used        INT DEFAULT 0,
    
    -- Aim Assist Telemetry
    aim_silent          BOOLEAN NOT NULL DEFAULT false,
    hit_rate            INT NOT NULL DEFAULT 80,
    ignore_knocked      BOOLEAN NOT NULL DEFAULT false,
    show_aim_line       BOOLEAN NOT NULL DEFAULT false,
    show_aim_fov        BOOLEAN NOT NULL DEFAULT false,
    aim_fov             FLOAT NOT NULL DEFAULT 90.0,
    
    -- ESP Visual Matrix
    esp_box             BOOLEAN NOT NULL DEFAULT true,
    esp_line            BOOLEAN NOT NULL DEFAULT false,
    esp_skeleton        BOOLEAN NOT NULL DEFAULT true,
    esp_name            BOOLEAN NOT NULL DEFAULT true,
    esp_distance        BOOLEAN NOT NULL DEFAULT true,
    esp_health          BOOLEAN NOT NULL DEFAULT true,
    esp_count           BOOLEAN NOT NULL DEFAULT true,
    esp_radar           BOOLEAN NOT NULL DEFAULT false,
    
    -- Kinematics & Weapons
    speed_hack          BOOLEAN NOT NULL DEFAULT false,
    speed_multiplier    FLOAT NOT NULL DEFAULT 1.50,
    ghost_hack          BOOLEAN NOT NULL DEFAULT false,
    no_reload           BOOLEAN NOT NULL DEFAULT false,
    no_recoil           BOOLEAN NOT NULL DEFAULT false,
    
    -- Theme & Emergency Safety
    theme_color_index   INT NOT NULL DEFAULT 0, -- 0=Cyber Blue, 1=Pink, 2=Emerald, 3=Violet, 4=Amber
    emergency_purge     BOOLEAN NOT NULL DEFAULT false, -- Remote panic switch
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create Activities / Audit Log Table
CREATE TABLE IF NOT EXISTS public.rymon_activities (
    id                  BIGSERIAL PRIMARY KEY,
    title               TEXT NOT NULL,
    event_type          TEXT NOT NULL DEFAULT 'KEY_GENERATED',
    game                TEXT DEFAULT 'Free Fire MAX',
    details             TEXT NOT NULL,
    actor_username      TEXT DEFAULT 'rymon',
    ip_address          TEXT DEFAULT '127.0.0.1',
    status              TEXT DEFAULT 'SUCCESS',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create System Config Table (Site config, advance settings)
CREATE TABLE IF NOT EXISTS public.rymon_system_config (
    key                 TEXT PRIMARY KEY,
    value               JSONB NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- RLS POLICIES (Allow public/anon & authenticated operations with high resilience)
-- ------------------------------------------------------------------------------
ALTER TABLE public.rymon_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rymon_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rymon_streamer_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rymon_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rymon_system_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rymon_accounts_all" ON public.rymon_accounts;
CREATE POLICY "rymon_accounts_all" ON public.rymon_accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "rymon_licenses_all" ON public.rymon_licenses;
CREATE POLICY "rymon_licenses_all" ON public.rymon_licenses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "rymon_streamer_controls_all" ON public.rymon_streamer_controls;
CREATE POLICY "rymon_streamer_controls_all" ON public.rymon_streamer_controls FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "rymon_activities_all" ON public.rymon_activities;
CREATE POLICY "rymon_activities_all" ON public.rymon_activities FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "rymon_system_config_all" ON public.rymon_system_config;
CREATE POLICY "rymon_system_config_all" ON public.rymon_system_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- ENABLE REALTIME ON TABLES
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rymon_streamer_controls;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rymon_licenses;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rymon_accounts;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rymon_activities;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- RPC 1: REAL LOGIN WITH USERNAME AND PASSWORD
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rymon_login(
    p_username TEXT,
    p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_acc public.rymon_accounts%ROWTYPE;
BEGIN
    -- Case insensitive lookup
    SELECT * INTO v_acc
    FROM public.rymon_accounts
    WHERE LOWER(username) = LOWER(TRIM(p_username));

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Account not found. Check username or register with an administrator.'
        );
    END IF;

    -- Validate Status
    IF v_acc.status = 'BANNED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Account suspended / banned by Administrator.'
        );
    END IF;

    -- Validate Expiration
    IF v_acc.expires_at IS NOT NULL AND v_acc.expires_at < now() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Account expired on ' || to_char(v_acc.expires_at, 'DD/MM/YYYY')
        );
    END IF;

    -- Password Check (accepts exact match or common staff fallback)
    IF v_acc.password_hash != p_password AND 
       v_acc.password_hash != LOWER(p_password) AND
       p_password != 'rymon@2026' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid password. Please try again.'
        );
    END IF;

    -- Log login activity
    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'User Sign In',
        'LOGIN',
        'Signed in as ' || v_acc.role || ' (' || v_acc.username || ')',
        v_acc.username,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'user', jsonb_build_object(
            'id', v_acc.id,
            'username', v_acc.username,
            'role', v_acc.role,
            'balance', v_acc.balance,
            'email', v_acc.email,
            'uplink', v_acc.uplink,
            'referral_code', v_acc.referral_code,
            'status', v_acc.status,
            'expires_at', v_acc.expires_at,
            'permissions', v_acc.permissions
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_login(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- RPC 2: PER-KEY VERIFICATION & DEVICE HWID BINDING
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rymon_verify_license(
    p_license_key TEXT,
    p_hwid TEXT DEFAULT ''
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
BEGIN
    v_clean_key := UPPER(TRIM(p_license_key));

    -- Master owner key bypass
    IF v_clean_key = 'RYMON-MASTER-KEY' OR v_clean_key LIKE '%MASTER%' OR v_clean_key LIKE '%OWNER%' THEN
        RETURN jsonb_build_object(
            'valid', true,
            'key', v_clean_key,
            'game', 'Free Fire MAX',
            'plan', 'Lifetime',
            'creator', 'rymon',
            'status', 'ACTIVE',
            'is_master', true,
            'expires_at', (now() + INTERVAL '10 years')
        );
    END IF;

    SELECT * INTO v_lic
    FROM public.rymon_licenses
    WHERE license_key = v_clean_key;

    IF NOT FOUND THEN
        -- Also check streamer controls table fallback
        IF EXISTS (SELECT 1 FROM public.rymon_streamer_controls WHERE license_key = v_clean_key) THEN
            RETURN jsonb_build_object(
                'valid', true,
                'key', v_clean_key,
                'game', 'Free Fire MAX',
                'plan', '30 Days',
                'status', 'ACTIVE',
                'expires_at', (now() + INTERVAL '30 days')
            );
        END IF;

        RETURN jsonb_build_object(
            'valid', false,
            'error', 'License key not found. Check key string or generate a new key.'
        );
    END IF;

    -- Check if Banned
    IF v_lic.status = 'BANNED' THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'License key has been revoked/banned by administrator.'
        );
    END IF;

    -- Parse Duration Interval
    IF v_lic.plan_duration ILIKE '%2 Hour%' THEN v_duration_interval := INTERVAL '2 hours';
    ELSIF v_lic.plan_duration ILIKE '%1 Day%' THEN v_duration_interval := INTERVAL '1 day';
    ELSIF v_lic.plan_duration ILIKE '%3 Day%' THEN v_duration_interval := INTERVAL '3 days';
    ELSIF v_lic.plan_duration ILIKE '%7 Day%' THEN v_duration_interval := INTERVAL '7 days';
    ELSIF v_lic.plan_duration ILIKE '%15 Day%' THEN v_duration_interval := INTERVAL '15 days';
    ELSIF v_lic.plan_duration ILIKE '%30 Day%' THEN v_duration_interval := INTERVAL '30 days';
    ELSE v_duration_interval := INTERVAL '30 days';
    END IF;

    -- First Time Activation: Only trigger when expires_at is NULL (key never activated)
    -- Do NOT re-activate based on status='WAITING' alone, as HWID reset sets WAITING on active keys
    IF v_lic.expires_at IS NULL THEN
        v_calc_expiry := now() + v_duration_interval;
        UPDATE public.rymon_licenses
        SET status = 'ACTIVE',
            expires_at = v_calc_expiry,
            devices_used = 1,
            device_hwid = COALESCE(NULLIF(p_hwid, ''), 'DEFAULT-DEVICE'),
            last_heartbeat = now(),
            updated_at = now()
        WHERE id = v_lic.id;

        -- Update controls
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

        -- HWID check (if HWID provided and already bound)
        IF p_hwid != '' AND v_lic.device_hwid != '' AND v_lic.device_hwid != p_hwid AND v_lic.devices_used >= v_lic.devices_max THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'HWID mismatch! Key is locked to another device. Reset via Telegram @Rymon007bot.'
            );
        END IF;

        -- Update heartbeat; increment devices_used for a new device binding (up to devices_max)
        UPDATE public.rymon_licenses
        SET last_heartbeat = now(),
            device_hwid = CASE WHEN v_lic.device_hwid = '' THEN p_hwid ELSE v_lic.device_hwid END,
            devices_used = CASE
                WHEN p_hwid != '' AND v_lic.device_hwid != p_hwid AND v_lic.device_hwid != ''
                    THEN LEAST(v_lic.devices_used + 1, v_lic.devices_max)
                ELSE GREATEST(v_lic.devices_used, 1)
            END,
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
        'plan', v_lic.plan_duration,
        'creator', v_lic.creator_username,
        'status', v_lic.status,
        'expires_at', v_lic.expires_at,
        'devices_used', v_lic.devices_used,
        'devices_max', v_lic.devices_max
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_verify_license(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- RPC 3: ATOMIC KEY GENERATION WITH WALLET BALANCE DEDUCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rymon_generate_key(
    p_creator_username  TEXT,
    p_game              TEXT DEFAULT 'Free Fire MAX',
    p_plan              TEXT DEFAULT '1 Day',
    p_custom_prefix     TEXT DEFAULT 'RYMON',
    p_devices_max       INT DEFAULT 1,
    p_quantity          INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_creator TEXT;
    v_creator public.rymon_accounts%ROWTYPE;
    v_unit_cost NUMERIC := 35;
    v_total_cost NUMERIC := 35;
    v_devices INT := 1;
    v_qty INT := 1;
    v_clean_game TEXT;
    v_is_ff BOOLEAN := FALSE;
    v_is_owner BOOLEAN := FALSE;
    v_game_tag TEXT := 'FF';
    v_keys TEXT[] := ARRAY[]::TEXT[];
    v_new_key TEXT;
    v_b1 TEXT;
    v_b2 TEXT;
    v_i INT;
    v_last_lic public.rymon_licenses%ROWTYPE;
BEGIN
    v_clean_creator := LOWER(TRIM(COALESCE(p_creator_username, 'debajoyti')));
    v_clean_game := TRIM(COALESCE(p_game, 'Free Fire MAX'));
    IF v_clean_game = '' THEN v_clean_game := 'Free Fire MAX'; END IF;
    v_is_ff := (v_clean_game ILIKE '%Free Fire%');
    v_devices := GREATEST(1, COALESCE(p_devices_max, 1));
    v_qty := GREATEST(1, LEAST(50, COALESCE(p_quantity, 1)));

    -- 1. Find creator account
    SELECT * INTO v_creator
    FROM public.rymon_accounts
    WHERE LOWER(username) = v_clean_creator;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Creator account not found: ' || p_creator_username);
    END IF;

    IF v_creator.status = 'BANNED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account is suspended/banned.');
    END IF;

    v_is_owner := (v_creator.role = 'owner' OR v_clean_creator IN ('debajoyti', 'ryzen'));

    -- Check Subscription Expiry
    IF NOT v_is_owner AND v_creator.expires_at IS NOT NULL AND v_creator.expires_at < now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Your ' || UPPER(v_creator.role) || ' subscription has expired. Please contact Admin/Owner to renew.');
    END IF;

    -- Exclusive Permission: Custom App Key Generation Restriction (Debajoyti Exclusively)
    IF NOT v_is_ff AND v_clean_creator != 'debajoyti' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Permission Denied: Custom App generation is exclusively restricted to Root Founder (@debajoyti).'
        );
    END IF;

    -- 2. Determine price from duration & devices
    IF p_plan ILIKE '%2 Hour%' THEN v_unit_cost := 20;
    ELSIF p_plan ILIKE '%1 Day%' THEN v_unit_cost := 35;
    ELSIF p_plan ILIKE '%3 Day%' THEN v_unit_cost := 50;
    ELSIF p_plan ILIKE '%7 Day%' THEN v_unit_cost := 100;
    ELSIF p_plan ILIKE '%15 Day%' THEN v_unit_cost := 180;
    ELSIF p_plan ILIKE '%30 Day%' THEN v_unit_cost := 350;
    ELSE v_unit_cost := 35;
    END IF;

    IF p_plan ILIKE '%[VIP]%' THEN
        v_unit_cost := ROUND(v_unit_cost * 1.5);
    END IF;

    v_total_cost := (v_unit_cost * v_devices) * v_qty;

    -- 3. Balance verification & Atomic Deduction
    IF NOT v_is_owner THEN
        IF v_creator.balance < v_total_cost THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Insufficient balance! ' || v_qty || ' key(s) require ₹' || v_total_cost || ', but your balance is ₹' || v_creator.balance
            );
        END IF;

        UPDATE public.rymon_accounts
        SET balance = balance - v_total_cost,
            updated_at = now()
        WHERE id = v_creator.id;

        v_creator.balance := v_creator.balance - v_total_cost;
    END IF;

    -- 4. Dynamic App Tag Prefix
    IF v_is_ff THEN
        v_game_tag := 'FF';
    ELSE
        v_game_tag := UPPER(SUBSTRING(REGEXP_REPLACE(v_clean_game, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 2));
        IF LENGTH(v_game_tag) < 2 THEN v_game_tag := 'APP'; END IF;
    END IF;

    -- 5. Generate and Insert Keys
    FOR v_i IN 1..v_qty LOOP
        v_b1 := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || v_i::TEXT) FROM 1 FOR 4));
        v_b2 := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || (v_i + 7)::TEXT) FROM 5 FOR 4));
        v_new_key := UPPER(TRIM(COALESCE(NULLIF(p_custom_prefix, ''), 'RYMON'))) || '-' || v_game_tag || '-' || v_b1 || '-' || v_b2;
        v_keys := array_append(v_keys, v_new_key);

        INSERT INTO public.rymon_licenses (
            license_key, game, plan_duration, creator_username,
            devices_used, devices_max, status, expires_at
        ) VALUES (
            v_new_key, v_clean_game, p_plan, v_creator.username,
            0, v_devices, 'WAITING', NULL
        ) RETURNING * INTO v_last_lic;

        IF v_is_ff AND (p_plan ILIKE '%VIP%' OR v_creator.role IN ('owner', 'admin', 'streamer')) THEN
            INSERT INTO public.rymon_streamer_controls (
                license_key, streamer_name, game_name, is_active, is_online,
                plan_duration, creator, devices_max, devices_used,
                aim_silent, hit_rate, esp_box, esp_skeleton, theme_color_index
            ) VALUES (
                v_new_key, 'VIP Streamer', 'Free Fire MAX', true, false,
                p_plan, v_creator.username, v_devices, 0,
                false, 80, true, true, 0
            ) ON CONFLICT (license_key) DO NOTHING;
        END IF;
    END LOOP;

    -- 6. Log Activity
    INSERT INTO public.rymon_activities (
        title, event_type, game, details, actor_username, status
    ) VALUES (
        'Key Generated: ' || v_keys[1] || CASE WHEN v_qty > 1 THEN ' (+' || (v_qty - 1) || ' more)' ELSE '' END,
        'KEY_GENERATED',
        v_clean_game,
        v_qty || 'x ' || p_plan || ' • ' || v_devices || ' Device(s) • Cost: ' || CASE WHEN v_is_owner THEN 'FREE' ELSE '₹' || v_total_cost END,
        v_creator.username,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'key', v_keys[1],
        'keys', v_keys,
        'game', v_clean_game,
        'plan', p_plan,
        'total_cost', v_total_cost,
        'license', row_to_json(v_last_lic),
        'remaining_balance', v_creator.balance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_generate_key(TEXT, TEXT, TEXT, TEXT, INT, INT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- RPC 4: TOP UP USER BALANCE (ADMIN & OWNER PRIVILEGE)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rymon_topup_balance(
    p_target_username TEXT,
    p_amount          NUMERIC,
    p_mode            TEXT DEFAULT 'set', -- 'set' or 'add'
    p_actor_username  TEXT DEFAULT 'rymon'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target public.rymon_accounts%ROWTYPE;
    v_new_bal NUMERIC;
BEGIN
    SELECT * INTO v_target
    FROM public.rymon_accounts
    WHERE LOWER(username) = LOWER(TRIM(p_target_username));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target user account not found.');
    END IF;

    IF p_mode = 'add' THEN
        v_new_bal := v_target.balance + p_amount;
    ELSE
        v_new_bal := p_amount;
    END IF;

    UPDATE public.rymon_accounts
    SET balance = v_new_bal,
        updated_at = now()
    WHERE id = v_target.id;

    -- Log Activity
    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Balance Top Up',
        'BALANCE_CREDIT',
        'Updated balance for ' || v_target.username || ' to ₹' || v_new_bal,
        p_actor_username,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'username', v_target.username,
        'balance', v_new_bal
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_topup_balance(TEXT, NUMERIC, TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- RPC 5: RESET HWID
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rymon_reset_hwid(
    p_license_key    TEXT,
    p_actor_username TEXT DEFAULT 'rymon'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Preserve ACTIVE/PAUSED status when the key still has a valid expiry (never activated keys get WAITING)
    UPDATE public.rymon_licenses
    SET device_hwid = '',
        devices_used = 0,
        status = CASE
            WHEN is_paused THEN 'PAUSED'
            WHEN expires_at IS NOT NULL AND expires_at > now() THEN 'ACTIVE'
            ELSE 'WAITING'
        END,
        updated_at = now()
    WHERE license_key = UPPER(TRIM(p_license_key));

    UPDATE public.rymon_streamer_controls
    SET device_hwid = '',
        devices_used = 0,
        is_online = false,
        updated_at = now()
    WHERE license_key = UPPER(TRIM(p_license_key));

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'HWID Reset',
        'HWID_RESET',
        'Device binding cleared for ' || UPPER(TRIM(p_license_key)),
        p_actor_username,
        'SUCCESS'
    );

    RETURN jsonb_build_object('success', true, 'message', 'HWID successfully reset.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_reset_hwid(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- RPC 6: BAN / UNBAN USER OR KEY
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rymon_ban_unban(
    p_target         TEXT,
    p_type           TEXT, -- 'user' or 'key'
    p_action         TEXT, -- 'ban' or 'unban'
    p_actor_username TEXT DEFAULT 'rymon'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
BEGIN
    v_status := CASE WHEN p_action = 'ban' THEN 'BANNED' ELSE 'ACTIVE' END;

    IF p_type = 'user' THEN
        UPDATE public.rymon_accounts
        SET status = v_status, updated_at = now()
        WHERE LOWER(username) = LOWER(TRIM(p_target));
    ELSE
        UPDATE public.rymon_licenses
        SET status = v_status, updated_at = now()
        WHERE license_key = UPPER(TRIM(p_target));

        UPDATE public.rymon_streamer_controls
        SET is_active = (p_action != 'ban'), updated_at = now()
        WHERE license_key = UPPER(TRIM(p_target));
    END IF;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Status Change (' || UPPER(p_action) || ')',
        'MODERATION',
        p_type || ' ' || p_target || ' marked as ' || v_status,
        p_actor_username,
        'SUCCESS'
    );

    RETURN jsonb_build_object('success', true, 'status', v_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_ban_unban(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- RPC 7: BULK DELETE USER KEYS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rymon_delete_keys(
    p_creator_username TEXT,
    p_key_type         TEXT DEFAULT 'expired', -- 'expired', 'unused', 'all'
    p_actor_username   TEXT DEFAULT 'rymon'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    IF p_key_type = 'expired' THEN
        DELETE FROM public.rymon_licenses
        WHERE LOWER(creator_username) = LOWER(TRIM(p_creator_username))
          AND (status = 'EXPIRED' OR (expires_at IS NOT NULL AND expires_at < now()));
    ELSIF p_key_type = 'unused' THEN
        DELETE FROM public.rymon_licenses
        WHERE LOWER(creator_username) = LOWER(TRIM(p_creator_username))
          AND status = 'WAITING' AND devices_used = 0;
    ELSE
        DELETE FROM public.rymon_licenses
        WHERE LOWER(creator_username) = LOWER(TRIM(p_creator_username));
    END IF;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Keys Purged',
        'CLEANUP',
        'Purged ' || v_deleted_count || ' ' || p_key_type || ' keys for user ' || p_creator_username,
        p_actor_username,
        'SUCCESS'
    );

    RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_delete_keys(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- RPC 8: EXTEND LICENSE KEY (ATOMIC WALLET DEDUCTION)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rymon_extend_key(
    p_license_key       TEXT,
    p_days              INT DEFAULT 30,
    p_actor_username    TEXT DEFAULT 'debajoyti'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_key TEXT;
    v_clean_actor TEXT;
    v_lic public.rymon_licenses%ROWTYPE;
    v_actor public.rymon_accounts%ROWTYPE;
    v_new_exp TIMESTAMPTZ;
    v_cost NUMERIC := 0;
    v_devices INT := 1;
    v_unit_cost NUMERIC := 0;
    v_is_owner BOOLEAN := FALSE;
    v_days INT;
    v_max_exp TIMESTAMPTZ;
BEGIN
    v_clean_key := UPPER(TRIM(p_license_key));
    v_clean_actor := LOWER(TRIM(COALESCE(p_actor_username, 'debajoyti')));
    v_days := GREATEST(1, LEAST(30, COALESCE(p_days, 30)));

    -- 1. Locate the license
    SELECT * INTO v_lic FROM public.rymon_licenses WHERE license_key = v_clean_key;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'License key not found: ' || v_clean_key);
    END IF;

    -- Check if Banned
    IF v_lic.status = 'BANNED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot extend a revoked/banned license.');
    END IF;

    -- 2. Locate actor account
    SELECT * INTO v_actor FROM public.rymon_accounts WHERE LOWER(username) = v_clean_actor;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Actor account not found: ' || p_actor_username);
    END IF;

    v_is_owner := (v_actor.role = 'owner' OR v_clean_actor IN ('debajoyti', 'ryzen'));

    -- 3. Downline Permission Check
    IF NOT v_is_owner THEN
        IF LOWER(COALESCE(v_lic.creator_username, '')) = 'debajoyti' AND v_clean_actor != 'debajoyti' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Permission Denied: Cannot extend keys outside your downline.');
        END IF;
    END IF;

    -- 4. Calculate Extension Cost
    v_devices := GREATEST(1, COALESCE(v_lic.devices_max, 1));
    
    IF v_is_owner THEN
        v_cost := 0;
    ELSE
        IF v_days = 1 THEN v_unit_cost := 35;
        ELSIF v_days = 3 THEN v_unit_cost := 50;
        ELSIF v_days = 7 THEN v_unit_cost := 100;
        ELSIF v_days = 15 THEN v_unit_cost := 180;
        ELSIF v_days = 30 THEN v_unit_cost := 350;
        ELSE v_unit_cost := ROUND(35 * v_days);
        END IF;
        v_cost := v_unit_cost * v_devices;
    END IF;

    -- 5. Wallet Balance Verification & Atomic Deduction
    IF NOT v_is_owner AND v_cost > 0 THEN
        IF v_actor.balance < v_cost THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Insufficient wallet balance! Extending ' || v_clean_key || ' by +' || v_days || ' day(s) costs ₹' || v_cost || ', but your balance is ₹' || v_actor.balance
            );
        END IF;

        UPDATE public.rymon_accounts
        SET balance = balance - v_cost,
            updated_at = now()
        WHERE id = v_actor.id;

        v_actor.balance := v_actor.balance - v_cost;
    END IF;

    -- 6. Apply New Expiration
    v_max_exp := now() + INTERVAL '30 days';
    v_new_exp := LEAST(GREATEST(COALESCE(v_lic.expires_at, now()), now()) + (v_days || ' days')::INTERVAL, v_max_exp);

    UPDATE public.rymon_licenses
    SET expires_at = v_new_exp,
        status = CASE WHEN is_paused THEN 'PAUSED' ELSE 'ACTIVE' END,
        updated_at = now()
    WHERE id = v_lic.id;

    UPDATE public.rymon_streamer_controls
    SET expires_at = v_new_exp,
        is_active = true,
        updated_at = now()
    WHERE license_key = v_clean_key;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Key Extended (+' || v_days || 'd)',
        'KEY_EXTEND',
        'License ' || v_clean_key || ' extended by +' || v_days || ' Day(s) • Cost: ' || CASE WHEN v_is_owner THEN 'FREE' ELSE '₹' || v_cost END,
        v_actor.username,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'license_key', v_clean_key,
        'days_added', v_days,
        'cost', v_cost,
        'new_expires_at', v_new_exp,
        'remaining_balance', v_actor.balance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_extend_key(TEXT, INT, TEXT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- RPC 9: BULK EXTEND KEYS (ATOMIC WALLET DEDUCTION)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rymon_bulk_extend_keys(
    p_days              INT DEFAULT 7,
    p_actor_username    TEXT DEFAULT 'debajoyti',
    p_creator_filter    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_actor TEXT;
    v_actor public.rymon_accounts%ROWTYPE;
    v_is_owner BOOLEAN := FALSE;
    v_days INT;
    v_total_cost NUMERIC := 0;
    v_count INT := 0;
    v_lic RECORD;
    v_unit_cost NUMERIC := 0;
    v_key_cost NUMERIC := 0;
    v_max_exp TIMESTAMPTZ;
    v_new_exp TIMESTAMPTZ;
BEGIN
    v_clean_actor := LOWER(TRIM(COALESCE(p_actor_username, 'debajoyti')));
    v_days := GREATEST(1, LEAST(30, COALESCE(p_days, 7)));

    SELECT * INTO v_actor FROM public.rymon_accounts WHERE LOWER(username) = v_clean_actor;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'count', 0, 'message', 'Actor account not found: ' || p_actor_username);
    END IF;

    v_is_owner := (v_actor.role = 'owner' OR v_clean_actor IN ('debajoyti', 'ryzen'));

    IF v_days = 1 THEN v_unit_cost := 35;
    ELSIF v_days = 3 THEN v_unit_cost := 50;
    ELSIF v_days = 7 THEN v_unit_cost := 100;
    ELSIF v_days = 15 THEN v_unit_cost := 180;
    ELSIF v_days = 30 THEN v_unit_cost := 350;
    ELSE v_unit_cost := ROUND(35 * v_days);
    END IF;

    FOR v_lic IN 
        SELECT id, license_key, creator_username, devices_max, expires_at, is_paused
        FROM public.rymon_licenses
        WHERE status != 'BANNED'
          AND (p_creator_filter IS NULL OR p_creator_filter = '' OR LOWER(creator_username) = LOWER(TRIM(p_creator_filter)))
          AND (v_is_owner OR (LOWER(creator_username) = v_clean_actor OR LOWER(creator_username) != 'debajoyti'))
    LOOP
        v_key_cost := v_unit_cost * GREATEST(1, COALESCE(v_lic.devices_max, 1));
        IF NOT v_is_owner THEN
            v_total_cost := v_total_cost + v_key_cost;
        END IF;
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN jsonb_build_object('success', true, 'count', 0, 'message', 'No active keys found to extend.');
    END IF;

    IF NOT v_is_owner AND v_total_cost > 0 THEN
        IF v_actor.balance < v_total_cost THEN
            RETURN jsonb_build_object(
                'success', false,
                'count', 0,
                'message', 'Insufficient wallet balance! Bulk extending ' || v_count || ' key(s) costs ₹' || v_total_cost || ', but your balance is ₹' || v_actor.balance
            );
        END IF;

        UPDATE public.rymon_accounts
        SET balance = balance - v_total_cost, updated_at = now()
        WHERE id = v_actor.id;

        v_actor.balance := v_actor.balance - v_total_cost;
    END IF;

    v_max_exp := now() + INTERVAL '30 days';
    FOR v_lic IN 
        SELECT id, license_key, expires_at, is_paused
        FROM public.rymon_licenses
        WHERE status != 'BANNED'
          AND (p_creator_filter IS NULL OR p_creator_filter = '' OR LOWER(creator_username) = LOWER(TRIM(p_creator_filter)))
          AND (v_is_owner OR (LOWER(creator_username) = v_clean_actor OR LOWER(creator_username) != 'debajoyti'))
    LOOP
        v_new_exp := LEAST(GREATEST(COALESCE(v_lic.expires_at, now()), now()) + (v_days || ' days')::INTERVAL, v_max_exp);

        UPDATE public.rymon_licenses
        SET expires_at = v_new_exp,
            status = CASE WHEN is_paused THEN 'PAUSED' ELSE 'ACTIVE' END,
            updated_at = now()
        WHERE id = v_lic.id;

        UPDATE public.rymon_streamer_controls
        SET expires_at = v_new_exp,
            is_active = true,
            updated_at = now()
        WHERE license_key = v_lic.license_key;
    END LOOP;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Bulk Key Extend (' || v_count || ' keys • +' || v_days || 'd)',
        'KEY_EXTEND',
        'Bulk extended ' || v_count || ' key(s) by +' || v_days || ' Day(s) • Total Cost: ' || CASE WHEN v_is_owner THEN 'FREE' ELSE '₹' || v_total_cost END,
        v_actor.username,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'count', v_count,
        'total_cost', v_total_cost,
        'remaining_balance', v_actor.balance,
        'message', 'Successfully extended ' || v_count || ' key(s) by +' || v_days || ' days.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_bulk_extend_keys(INT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- RPC 10: ATOMIC WALLET-TO-WALLET TRANSFER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rymon_transfer_balance(
    p_sender_username   TEXT,
    p_target_username   TEXT,
    p_amount            NUMERIC,
    p_mode              TEXT DEFAULT 'add'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sender public.rymon_accounts%ROWTYPE;
    v_target public.rymon_accounts%ROWTYPE;
    v_amount NUMERIC := COALESCE(p_amount, 0);
    v_is_owner BOOLEAN := FALSE;
    v_new_target_balance NUMERIC;
BEGIN
    SELECT * INTO v_sender FROM public.rymon_accounts WHERE LOWER(username) = LOWER(TRIM(p_sender_username));
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sender account not found.');
    END IF;

    SELECT * INTO v_target FROM public.rymon_accounts WHERE LOWER(username) = LOWER(TRIM(p_target_username));
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target account not found.');
    END IF;

    v_is_owner := (v_sender.role = 'owner' OR LOWER(v_sender.username) IN ('debajoyti', 'ryzen'));

    IF v_is_owner AND LOWER(COALESCE(p_mode, 'add')) = 'set' THEN
        IF v_amount < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Target balance cannot be negative.');
        END IF;

        v_new_target_balance := v_amount;

        UPDATE public.rymon_accounts
        SET balance = v_new_target_balance, updated_at = now()
        WHERE id = v_target.id;

        INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
        VALUES (
            'Owner Balance Adjustment',
            'BALANCE_CREDIT',
            '@' || v_sender.username || ' set exact balance for @' || v_target.username || ' to ₹' || v_new_target_balance,
            v_sender.username,
            'SUCCESS'
        );

        RETURN jsonb_build_object(
            'success', true,
            'sender_balance', v_sender.balance,
            'target_balance', v_new_target_balance,
            'amount', v_amount,
            'mode', 'set'
        );
    END IF;

    IF v_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transfer amount must be greater than 0.');
    END IF;

    IF NOT v_is_owner THEN
        IF v_sender.balance < v_amount THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'Insufficient wallet balance! You have ₹' || v_sender.balance || ' but tried to send ₹' || v_amount
            );
        END IF;

        UPDATE public.rymon_accounts
        SET balance = balance - v_amount, updated_at = now()
        WHERE id = v_sender.id;

        v_sender.balance := v_sender.balance - v_amount;
    END IF;

    v_new_target_balance := v_target.balance + v_amount;

    UPDATE public.rymon_accounts
    SET balance = v_new_target_balance, updated_at = now()
    WHERE id = v_target.id;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Balance Transfer',
        'BALANCE_CREDIT',
        '@' || v_sender.username || ' credited ₹' || v_amount || ' to @' || v_target.username || ' (New Target Bal: ₹' || v_new_target_balance || ')',
        v_sender.username,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'sender_balance', v_sender.balance,
        'target_balance', v_new_target_balance,
        'amount', v_amount,
        'mode', 'add'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_transfer_balance(TEXT, TEXT, NUMERIC, TEXT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- RPC 11: RENEW USER SUBSCRIPTION (ATOMIC ADMIN FEE DEDUCTION)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rymon_renew_subscription(
    p_target_username   TEXT,
    p_days              INT,
    p_actor_username    TEXT DEFAULT 'debajoyti',
    p_fee               NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_actor TEXT;
    v_clean_target TEXT;
    v_target public.rymon_accounts%ROWTYPE;
    v_actor public.rymon_accounts%ROWTYPE;
    v_new_exp TIMESTAMPTZ;
    v_is_owner BOOLEAN := FALSE;
    v_fee NUMERIC := COALESCE(p_fee, 0);
BEGIN
    v_clean_actor := LOWER(TRIM(COALESCE(p_actor_username, 'debajoyti')));
    v_clean_target := LOWER(TRIM(p_target_username));

    SELECT * INTO v_target FROM public.rymon_accounts WHERE LOWER(username) = v_clean_target;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
    END IF;

    SELECT * INTO v_actor FROM public.rymon_accounts WHERE LOWER(username) = v_clean_actor;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Actor account not found');
    END IF;

    v_is_owner := (v_actor.role = 'owner' OR v_clean_actor IN ('debajoyti', 'ryzen'));

    -- Deduct fee if not owner
    IF NOT v_is_owner AND v_fee > 0 THEN
        IF v_actor.balance < v_fee THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Insufficient wallet balance! Renewing subscription costs ₹' || v_fee || ', but your balance is ₹' || v_actor.balance
            );
        END IF;

        UPDATE public.rymon_accounts
        SET balance = balance - v_fee, updated_at = now()
        WHERE id = v_actor.id;

        v_actor.balance := v_actor.balance - v_fee;
    END IF;

    -- Stack renewal on remaining expiry (don't lose unused days)
    v_new_exp := GREATEST(now(), COALESCE(v_target.expires_at, now())) + (p_days || ' days')::INTERVAL;

    UPDATE public.rymon_accounts
    SET expires_at = v_new_exp,
        status = 'ACTIVE',
        updated_at = now()
    WHERE id = v_target.id;

    UPDATE public.rymon_licenses
    SET is_paused = false, status = 'ACTIVE', updated_at = now()
    WHERE LOWER(creator_username) = v_clean_target AND status = 'PAUSED';

    UPDATE public.rymon_streamer_controls
    SET is_paused = false, updated_at = now()
    WHERE LOWER(creator) = v_clean_target;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Subscription Renewed',
        'MODERATION',
        'Renewed @' || v_target.username || ' for ' || p_days || ' days • Fee: ' || CASE WHEN v_is_owner THEN 'FREE' ELSE '₹' || v_fee END,
        v_actor.username,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'expires_at', v_new_exp,
        'remaining_balance', v_actor.balance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_renew_subscription(TEXT, INT, TEXT, NUMERIC) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- RPC 12: CREATE REFERRAL / INVITE CODE (ATOMIC PRELOADED BALANCE DEDUCTION)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rymon_create_referral(
    p_code              TEXT,
    p_target_role       TEXT,
    p_initial_balance   NUMERIC DEFAULT 0,
    p_max_uses          INT DEFAULT 1,
    p_subscription_days INT DEFAULT 30,
    p_actor_username    TEXT DEFAULT 'debajoyti',
    p_actor_password    TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_actor TEXT;
    v_clean_code TEXT;
    v_clean_role TEXT;
    v_actor public.rymon_accounts%ROWTYPE;
    v_is_owner BOOLEAN := FALSE;
    v_total_cost NUMERIC := 0;
    v_init_bal NUMERIC := 0;
    v_uses INT := 1;
BEGIN
    v_clean_code := UPPER(TRIM(p_code));
    v_clean_role := LOWER(TRIM(p_target_role));
    v_clean_actor := LOWER(TRIM(COALESCE(p_actor_username, 'debajoyti')));
    v_init_bal := GREATEST(0, COALESCE(p_initial_balance, 0));
    v_uses := GREATEST(1, COALESCE(p_max_uses, 1));

    SELECT * INTO v_actor
    FROM public.rymon_accounts
    WHERE LOWER(username) = v_clean_actor;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Actor not found: ' || p_actor_username);
    END IF;

    v_is_owner := (v_actor.role = 'owner' OR v_clean_actor IN ('debajoyti', 'ryzen'));

    -- Only Owners can create Admin invite codes
    IF NOT v_is_owner AND v_clean_role = 'admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden: Only Owners (debajoyti & ryzen) can create Admin invite codes');
    END IF;

    -- Guard: Reject duplicate codes BEFORE any wallet deduction
    IF EXISTS (SELECT 1 FROM public.rymon_referrals WHERE code = v_clean_code) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral code already exists: ' || v_clean_code);
    END IF;

    -- Calculate total funding cost for non-owners
    IF NOT v_is_owner AND v_init_bal > 0 THEN
        v_total_cost := v_init_bal * v_uses;
        IF v_actor.balance < v_total_cost THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Insufficient wallet balance! Creating this code requires ₹' || v_total_cost || ' (₹' || v_init_bal || ' × ' || v_uses || ' uses), but your balance is ₹' || v_actor.balance
            );
        END IF;

        UPDATE public.rymon_accounts
        SET balance = balance - v_total_cost, updated_at = now()
        WHERE id = v_actor.id;

        v_actor.balance := v_actor.balance - v_total_cost;
    END IF;

    INSERT INTO public.rymon_referrals (
        code, target_role, initial_balance, max_uses, subscription_days, created_by, is_active, times_used, created_at, updated_at
    ) VALUES (
        v_clean_code, v_clean_role, v_init_bal, v_uses, COALESCE(p_subscription_days, 30), v_actor.username, true, 0, now(), now()
    );

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Invite Code Created (' || UPPER(v_clean_role) || ' • ' || COALESCE(p_subscription_days, 30) || 'D)',
        'REFERRAL_CREATE',
        'Code ' || v_clean_code || ' (' || COALESCE(p_subscription_days, 30) || ' Days Sub, ₹' || v_init_bal || ' start, ' || v_uses || 'x uses) created by @' || v_actor.username || ' • Cost: ' || CASE WHEN v_is_owner THEN 'FREE' ELSE '₹' || v_total_cost END,
        v_actor.username,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true, 
        'code', v_clean_code,
        'target_role', v_clean_role,
        'subscription_days', COALESCE(p_subscription_days, 30),
        'initial_balance', v_init_bal,
        'max_uses', v_uses,
        'remaining_balance', v_actor.balance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_create_referral(TEXT, TEXT, NUMERIC, INT, INT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- SEED DATA (REAL USERS, BALANCES, AND LICENSES MATCHING LIVE DASHBOARD)
-- ------------------------------------------------------------------------------

-- 1. Insert Sovereign Accounts
INSERT INTO public.rymon_accounts (username, password_hash, email, role, balance, uplink, referral_code, status, expires_at)
VALUES 
('debajoyti', 'debajoyti@2026', 'debajoyti@rymon.vip', 'owner', 999628464, 'SOVEREIGN_ROOT', 'ROOT001', 'ACTIVE', now() + INTERVAL '10 years')
ON CONFLICT (username) DO UPDATE
SET balance = EXCLUDED.balance,
    role = EXCLUDED.role,
    email = EXCLUDED.email,
    status = EXCLUDED.status;

-- 2. Insert Sovereign Licenses
INSERT INTO public.rymon_licenses (id, license_key, game, plan_duration, creator_username, devices_used, devices_max, status, expires_at)
VALUES
(38505, 'RYMON-PB-94A2-9981', 'PUBG', '1 Day', 'rymon', 2, 300, 'ACTIVE', now() + INTERVAL '1 day'),
(38504, 'RYMON-PB-4482-1092', 'PUBG', '30 Days', 'rymon', 0, 1, 'WAITING', NULL),
(38503, 'RYMON-PB-7719-2041', 'BGMI', '30 Days', 'rymon', 0, 1, 'WAITING', NULL),
(38502, 'RYMON-PB-3108-8842', 'Free Fire MAX', '1 Day', 'SK2020', 1, 1, 'ACTIVE', now() + INTERVAL '1 day'),
(38501, 'RYMON-PB-8491-3004', 'Free Fire MAX', '30 Days', 'rymon', 1, 1, 'ACTIVE', now() + INTERVAL '30 days'),
(38500, 'RYMON-PB-1190-7734', 'PUBG', '7 Days', 'rymon', 0, 1, 'WAITING', NULL),
(38499, 'RYMON-PB-9920-4100', 'BGMI', '1 Day', 'ROGER', 1, 1, 'ACTIVE', now() + INTERVAL '1 day'),
(38506, 'RYMON-FF-94A2-9981', 'Free Fire MAX', '30 Days', 'rymon', 1, 1, 'ACTIVE', now() + INTERVAL '30 days'),
(38507, 'RYMON-MASTER-KEY', 'Free Fire MAX', 'Lifetime', 'rymon', 1, 999, 'ACTIVE', now() + INTERVAL '10 years')
ON CONFLICT (license_key) DO UPDATE
SET status = EXCLUDED.status,
    devices_used = EXCLUDED.devices_used,
    devices_max = EXCLUDED.devices_max;

-- 3. Insert Telemetry Controls for seeded keys
INSERT INTO public.rymon_streamer_controls (
    license_key, streamer_name, game_name, is_active, is_online,
    plan_duration, creator, devices_max, devices_used,
    aim_silent, hit_rate, esp_box, esp_skeleton, theme_color_index
)
SELECT 
    l.license_key,
    CASE WHEN l.creator_username = 'rymon' THEN 'Rymon Master' ELSE 'VIP Streamer' END,
    l.game,
    true,
    (l.devices_used > 0),
    l.plan_duration,
    l.creator_username,
    l.devices_max,
    l.devices_used,
    false, 85, true, true, 0
FROM public.rymon_licenses l
ON CONFLICT (license_key) DO UPDATE
SET game_name = EXCLUDED.game_name,
    creator = EXCLUDED.creator;

-- 4. Insert Initial Audit Activities
INSERT INTO public.rymon_activities (title, event_type, game, details, actor_username, status)
VALUES
('Ticket #387', 'KEY_GENERATED', 'PUBG', '1 Day • 300 Device(s)', 'rymon', 'SUCCESS'),
('Ticket #386', 'KEY_GENERATED', 'Free Fire MAX', '30 Days • 1 Device(s)', 'rymon', 'SUCCESS'),
('Ticket #385', 'KEY_GENERATED', 'BGMI', '30 Days • 1 Device(s)', 'rymon', 'SUCCESS'),
('Ticket #384', 'KEY_GENERATED', 'PUBG', '7 Days • 1 Device(s)', 'ROGER', 'SUCCESS'),
('Ticket #383', 'KEY_GENERATED', 'Free Fire MAX', '1 Day • 1 Device(s)', 'SK2020', 'SUCCESS')
ON CONFLICT DO NOTHING;

-- 5. Insert System Configurations
INSERT INTO public.rymon_system_config (key, value)
VALUES
('single_device_login', '{"admin":false,"reseller":true}'::jsonb),
('trial_key_settings', '{"admin":true,"reseller":false}'::jsonb),
('site_branding', '{"panel_name":"Rymon","panel_sub":"CONTROL PANEL & TELEMETRY REMOTE","logo_url":"/rymon_logo.jpg"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ------------------------------------------------------------------------------
-- 6. COMMUNICATION, NOTIFICATIONS & TELEGRAM BOT GATEWAY
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rymon_notifications (
    id BIGSERIAL PRIMARY KEY,
    sender TEXT NOT NULL DEFAULT 'rymon',
    recipient TEXT NOT NULL DEFAULT 'ALL',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'INFO',
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rymon_notifications_recipient ON public.rymon_notifications (recipient);
CREATE INDEX IF NOT EXISTS idx_rymon_notifications_created ON public.rymon_notifications (created_at DESC);

ALTER TABLE public.rymon_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access to rymon_notifications" ON public.rymon_notifications;
CREATE POLICY "Public access to rymon_notifications" ON public.rymon_notifications FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rymon_notifications;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.rymon_telegram_config (
    id INT PRIMARY KEY DEFAULT 1,
    bot_token TEXT DEFAULT '',
    chat_id TEXT DEFAULT '',
    channel_username TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.rymon_telegram_config (id, bot_token, chat_id, channel_username, is_active)
VALUES (1, '', '', '@RymonGhostStreamer', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.rymon_telegram_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access to rymon_telegram_config" ON public.rymon_telegram_config;
CREATE POLICY "Public access to rymon_telegram_config" ON public.rymon_telegram_config FOR ALL USING (true) WITH CHECK (true);

-- RPC for dispatching broadcasts
CREATE OR REPLACE FUNCTION public.rpc_rymon_send_broadcast(
    p_sender TEXT,
    p_recipient TEXT,
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'INFO',
    p_is_pinned BOOLEAN DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_id BIGINT;
BEGIN
    INSERT INTO public.rymon_notifications (sender, recipient, title, message, type, is_pinned, created_at)
    VALUES (COALESCE(p_sender, 'rymon'), COALESCE(p_recipient, 'ALL'), p_title, p_message, COALESCE(p_type, 'INFO'), COALESCE(p_is_pinned, false), now())
    RETURNING id INTO v_new_id;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Broadcast Message Sent: ' || p_title,
        'COMMUNICATION_BROADCAST',
        'Target: ' || p_recipient || ' | Type: ' || p_type || ' | Pinned: ' || (CASE WHEN p_is_pinned THEN 'YES' ELSE 'NO' END),
        p_sender,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'notification_id', v_new_id,
        'message', 'Broadcast dispatched successfully to ' || p_recipient
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_rymon_send_broadcast(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

-- Seed initial announcements
INSERT INTO public.rymon_notifications (sender, recipient, title, message, type, is_pinned, created_at)
VALUES 
('rymon', 'ALL', '🚨 SYSTEM ACTIVE: Welcome to Rymon Sovereign Network', 'The sovereign portal is online on greenvest.shop with zero external latency. All reseller balances, key generators, and streamer telemetry are linked directly to database.', 'UPDATE', true, now()),
('rymon', 'ALL', '⚡ PUBG 3.7 & FreeFire Bypass Live', 'All memory injection modules and safe telemetry controls are updated. Ensure your streamers bind HWID before joining live matches.', 'INFO', false, now() - interval '2 hours'),
('rymon', 'ROGER', '💼 Reseller Tier Verified', 'Your reseller account has been credited. You can generate PUBG and FreeFire keys directly from the Generate Key panel.', 'INFO', false, now() - interval '1 hour')
ON CONFLICT DO NOTHING;

