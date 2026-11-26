-- ==============================================================================
-- GREEN-VEST / RYMON SOVEREIGN SECURITY HARDENING MIGRATION
-- Closes unauthenticated SECURITY DEFINER RPCs, payment bypass, RLS exposures,
-- plaintext password drift, multi-device HWID gaps, and missing purge/CRUD RPCs.
-- Zero-breakage for live APK/client verification (rpc_rymon_verify_license).
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 0. Idempotent Schema & Column Prerequisites (safe on both full & partial DBs)
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
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ DEFAULT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.rymon_accounts
    ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL;

CREATE TABLE IF NOT EXISTS public.rymon_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID REFERENCES public.rymon_accounts(id) ON DELETE CASCADE,
    session_token   TEXT UNIQUE NOT NULL,
    ip_address      TEXT DEFAULT '127.0.0.1',
    user_agent      TEXT DEFAULT 'web',
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rymon_licenses (
    id                  BIGSERIAL PRIMARY KEY,
    license_key         TEXT UNIQUE NOT NULL,
    game                TEXT NOT NULL DEFAULT 'Free Fire MAX',
    plan_duration       TEXT NOT NULL DEFAULT '1 Day',
    creator_username    TEXT NOT NULL,
    devices_used        INT NOT NULL DEFAULT 0,
    devices_max         INT NOT NULL DEFAULT 1,
    device_hwid         TEXT DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'WAITING',
    is_paused           BOOLEAN NOT NULL DEFAULT false,
    paused_at           TIMESTAMPTZ DEFAULT NULL,
    expires_at          TIMESTAMPTZ,
    last_heartbeat      TIMESTAMPTZ DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.rymon_licenses
    ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE IF EXISTS public.rymon_licenses
    DROP CONSTRAINT IF EXISTS rymon_licenses_status_check;

ALTER TABLE IF EXISTS public.rymon_licenses
    ADD CONSTRAINT rymon_licenses_status_check
    CHECK (status IN ('ACTIVE', 'WAITING', 'EXPIRED', 'BANNED', 'PAUSED'));

CREATE TABLE IF NOT EXISTS public.rymon_streamer_controls (
    license_key         TEXT PRIMARY KEY,
    streamer_name       TEXT NOT NULL DEFAULT 'VIP Streamer',
    game_name           TEXT NOT NULL DEFAULT 'Free Fire MAX',
    device_hwid         TEXT DEFAULT '',
    is_active           BOOLEAN NOT NULL DEFAULT true,
    is_paused           BOOLEAN NOT NULL DEFAULT false,
    paused_at           TIMESTAMPTZ DEFAULT NULL,
    is_online           BOOLEAN NOT NULL DEFAULT false,
    last_heartbeat      TIMESTAMPTZ DEFAULT now(),
    expires_at          TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
    plan_duration       TEXT DEFAULT '30 Days',
    creator             TEXT DEFAULT 'rymon',
    devices_max         INT DEFAULT 1,
    devices_used        INT DEFAULT 0,
    aim_silent          BOOLEAN NOT NULL DEFAULT false,
    hit_rate            INT NOT NULL DEFAULT 80,
    ignore_knocked      BOOLEAN NOT NULL DEFAULT false,
    show_aim_line       BOOLEAN NOT NULL DEFAULT false,
    show_aim_fov        BOOLEAN NOT NULL DEFAULT false,
    aim_fov             FLOAT NOT NULL DEFAULT 90.0,
    esp_box             BOOLEAN NOT NULL DEFAULT true,
    esp_line            BOOLEAN NOT NULL DEFAULT false,
    esp_skeleton        BOOLEAN NOT NULL DEFAULT true,
    esp_name            BOOLEAN NOT NULL DEFAULT true,
    esp_distance        BOOLEAN NOT NULL DEFAULT true,
    esp_health          BOOLEAN NOT NULL DEFAULT true,
    esp_count           BOOLEAN NOT NULL DEFAULT true,
    esp_radar           BOOLEAN NOT NULL DEFAULT false,
    speed_hack          BOOLEAN NOT NULL DEFAULT false,
    speed_multiplier    FLOAT NOT NULL DEFAULT 1.50,
    ghost_hack          BOOLEAN NOT NULL DEFAULT false,
    no_reload           BOOLEAN NOT NULL DEFAULT false,
    no_recoil           BOOLEAN NOT NULL DEFAULT false,
    theme_color_index   INT NOT NULL DEFAULT 0,
    emergency_purge     BOOLEAN NOT NULL DEFAULT false,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.rymon_streamer_controls
    ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ DEFAULT NULL;

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

CREATE TABLE IF NOT EXISTS public.rymon_system_config (
    key                 TEXT PRIMARY KEY,
    value               JSONB NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rymon_referrals (
    id                  BIGSERIAL PRIMARY KEY,
    code                TEXT UNIQUE NOT NULL,
    target_role         TEXT NOT NULL DEFAULT 'reseller',
    initial_balance     NUMERIC NOT NULL DEFAULT 0,
    max_uses            INTEGER NOT NULL DEFAULT 1,
    times_used          INTEGER NOT NULL DEFAULT 0,
    subscription_days   INTEGER DEFAULT 30,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_by          TEXT DEFAULT 'rymon',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE IF EXISTS public.rymon_referrals
    ADD COLUMN IF NOT EXISTS subscription_days INTEGER DEFAULT 30,
    ADD COLUMN IF NOT EXISTS times_used INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.rymon_payments (
    id                  BIGSERIAL PRIMARY KEY,
    payment_id          TEXT UNIQUE,
    order_id            TEXT,
    signature           TEXT,
    username            TEXT NOT NULL,
    amount              NUMERIC NOT NULL,
    currency            TEXT DEFAULT 'INR',
    status              TEXT DEFAULT 'COMPLETED',
    actor_email         TEXT DEFAULT '',
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rymon_notifications (
    id                  BIGSERIAL PRIMARY KEY,
    sender              TEXT DEFAULT 'debajoyti',
    recipient           TEXT NOT NULL DEFAULT 'ALL',
    title               TEXT NOT NULL,
    message             TEXT NOT NULL,
    type                TEXT DEFAULT 'INFO',
    is_pinned           BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rymon_telegram_config (
    id                  INT PRIMARY KEY DEFAULT 1,
    bot_token           TEXT DEFAULT '',
    chat_id             TEXT DEFAULT '',
    channel_username    TEXT DEFAULT '',
    is_active           BOOLEAN NOT NULL DEFAULT false,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1. Upgrade any legacy plaintext passwords in rymon_accounts -> Salted Bcrypt
UPDATE public.rymon_accounts
SET password_hash = extensions.crypt(password_hash, extensions.gen_salt('bf', 8)),
    updated_at = now()
WHERE password_hash IS NOT NULL
  AND password_hash NOT LIKE '$2%'
  AND password_hash !~ '^[0-9a-fA-F]{64}$';

-- 2. Lock down sensitive tables via Row-Level Security & explicit REVOKE/GRANT
ALTER TABLE IF EXISTS public.rymon_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rymon_accounts FROM anon, authenticated, public;
GRANT ALL ON public.rymon_accounts TO service_role;
DROP POLICY IF EXISTS "rymon_accounts_all" ON public.rymon_accounts;
DROP POLICY IF EXISTS "rymon_accounts_deny_all" ON public.rymon_accounts;
CREATE POLICY "rymon_accounts_deny_all" ON public.rymon_accounts FOR ALL TO public USING (false);

ALTER TABLE IF EXISTS public.rymon_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rymon_sessions FROM anon, authenticated, public;
GRANT ALL ON public.rymon_sessions TO service_role;
DROP POLICY IF EXISTS "rymon_sessions_deny_all" ON public.rymon_sessions;
CREATE POLICY "rymon_sessions_deny_all" ON public.rymon_sessions FOR ALL TO public USING (false);

ALTER TABLE IF EXISTS public.rymon_licenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rymon_licenses FROM anon, authenticated, public;
GRANT ALL ON public.rymon_licenses TO service_role;
DROP POLICY IF EXISTS "rymon_licenses_all" ON public.rymon_licenses;
DROP POLICY IF EXISTS "rymon_licenses_deny_all" ON public.rymon_licenses;
CREATE POLICY "rymon_licenses_deny_all" ON public.rymon_licenses FOR ALL TO public USING (false);

ALTER TABLE IF EXISTS public.rymon_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rymon_referrals FROM anon, authenticated, public;
GRANT ALL ON public.rymon_referrals TO service_role;
DROP POLICY IF EXISTS "rymon_referrals_anon_check" ON public.rymon_referrals;
DROP POLICY IF EXISTS "rymon_referrals_all" ON public.rymon_referrals;
DROP POLICY IF EXISTS "rymon_referrals_deny_all" ON public.rymon_referrals;
CREATE POLICY "rymon_referrals_deny_all" ON public.rymon_referrals FOR ALL TO public USING (false);

ALTER TABLE IF EXISTS public.rymon_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rymon_payments FROM anon, authenticated, public;
GRANT ALL ON public.rymon_payments TO service_role;
DROP POLICY IF EXISTS "rymon_payments_deny_all" ON public.rymon_payments;
CREATE POLICY "rymon_payments_deny_all" ON public.rymon_payments FOR ALL TO public USING (false);

ALTER TABLE IF EXISTS public.rymon_telegram_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rymon_telegram_config FROM anon, authenticated, public;
GRANT ALL ON public.rymon_telegram_config TO service_role;
DROP POLICY IF EXISTS "Public access to rymon_telegram_config" ON public.rymon_telegram_config;
DROP POLICY IF EXISTS "rymon_telegram_config_deny_all" ON public.rymon_telegram_config;
CREATE POLICY "rymon_telegram_config_deny_all" ON public.rymon_telegram_config FOR ALL TO public USING (false);

ALTER TABLE IF EXISTS public.rymon_activities ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.rymon_activities FROM anon, authenticated, public;
GRANT ALL ON public.rymon_activities TO service_role;
DROP POLICY IF EXISTS "rymon_activities_all" ON public.rymon_activities;
DROP POLICY IF EXISTS "rymon_activities_deny_direct" ON public.rymon_activities;
CREATE POLICY "rymon_activities_deny_direct" ON public.rymon_activities FOR ALL TO public USING (false);

ALTER TABLE IF EXISTS public.rymon_system_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rymon_system_config FROM anon, authenticated, public;
GRANT SELECT (key, value, updated_at) ON public.rymon_system_config TO anon, authenticated;
GRANT ALL ON public.rymon_system_config TO service_role;
DROP POLICY IF EXISTS "rymon_system_config_all" ON public.rymon_system_config;
DROP POLICY IF EXISTS "rymon_system_config_public_read" ON public.rymon_system_config;
CREATE POLICY "rymon_system_config_public_read" ON public.rymon_system_config
FOR SELECT TO anon, authenticated
USING (
    key IN (
        'global_key_prices',
        'user_custom_prices',
        'sovereign_security_policy',
        'registered_apps',
        'paused_key_timestamps',
        'referral_subscription_days',
        'hwid_reset_daily_log',
        'site_branding',
        'single_device_login',
        'trial_key_settings'
    )
);

-- Prevent password hashes or private keys from leaking over Supabase Realtime
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.rymon_accounts;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.rymon_licenses;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Internal Auth, HWID Normalization, and Downline Hierarchy Helpers
CREATE OR REPLACE FUNCTION public.fn_rymon_normalize_hwid(p_hwid TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT REGEXP_REPLACE(
        LOWER(TRIM(COALESCE(p_hwid, ''))),
        '^(android_id:|install_id:|boot_fallback:|hwid:|device:)',
        ''
    );
$$;
REVOKE ALL ON FUNCTION public.fn_rymon_normalize_hwid(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_rymon_resolve_session(
    p_session_token TEXT DEFAULT '',
    p_claimed_actor TEXT DEFAULT ''
)
RETURNS public.rymon_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_acc public.rymon_accounts%ROWTYPE;
    v_clean_token TEXT := TRIM(COALESCE(p_session_token, ''));
    v_claimed TEXT := LOWER(TRIM(COALESCE(p_claimed_actor, '')));
BEGIN
    -- Trusted server/daemon callers authenticated with service_role key
    IF auth.role() = 'service_role' THEN
        IF v_claimed = '' THEN
            v_claimed := 'debajoyti';
        END IF;
        SELECT * INTO v_acc
        FROM public.rymon_accounts
        WHERE LOWER(username) = v_claimed
          AND status = 'ACTIVE'
          AND (role = 'owner' OR expires_at IS NULL OR expires_at > now())
        LIMIT 1;
        IF NOT FOUND THEN
            RETURN NULL;
        END IF;
        RETURN v_acc;
    END IF;

    -- Browser/anon callers MUST present a live session token from rymon_sessions
    IF v_clean_token = '' THEN
        RETURN NULL;
    END IF;

    SELECT a.* INTO v_acc
    FROM public.rymon_sessions s
    JOIN public.rymon_accounts a ON a.id = s.account_id
    WHERE s.session_token = v_clean_token
      AND s.expires_at > now()
      AND a.status = 'ACTIVE'
      AND (a.role = 'owner' OR a.expires_at IS NULL OR a.expires_at > now())
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN v_acc;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_rymon_resolve_session(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rymon_resolve_session(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_rymon_is_in_downline(
    p_actor TEXT,
    p_target TEXT,
    p_include_self BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor TEXT := LOWER(TRIM(COALESCE(p_actor, '')));
    v_target TEXT := LOWER(TRIM(COALESCE(p_target, '')));
    v_found BOOLEAN := false;
BEGIN
    IF v_actor = '' OR v_target = '' THEN
        RETURN false;
    END IF;
    IF v_actor = 'debajoyti' THEN
        RETURN p_include_self OR v_target != 'debajoyti';
    END IF;
    IF v_target = 'debajoyti' THEN
        RETURN false;
    END IF;
    IF p_include_self AND v_actor = v_target THEN
        RETURN true;
    END IF;

    WITH RECURSIVE dl AS (
        SELECT LOWER(username) AS uname
        FROM public.rymon_accounts
        WHERE LOWER(username) = v_actor
        UNION ALL
        SELECT LOWER(a.username)
        FROM public.rymon_accounts a
        JOIN dl ON LOWER(a.uplink) = dl.uname
        WHERE LOWER(a.username) != 'debajoyti'
    )
    SELECT EXISTS (
        SELECT 1 FROM dl
        WHERE uname = v_target
          AND (p_include_self OR uname != v_actor)
    ) INTO v_found;

    RETURN COALESCE(v_found, false);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_rymon_is_in_downline(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rymon_is_in_downline(TEXT, TEXT, BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_rymon_get_key_unit_cost(
    p_username  TEXT,
    p_plan      TEXT DEFAULT '1 Day',
    p_days      INT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_user TEXT;
    v_custom_all JSONB;
    v_user_map JSONB;
    v_global_map JSONB;
    v_slot TEXT := '1 Day';
    v_cost NUMERIC := NULL;
    v_is_vip BOOLEAN := FALSE;
    v_surcharge NUMERIC := 50;
    v_days_val INT;
BEGIN
    v_clean_user := LOWER(TRIM(COALESCE(p_username, '')));
    IF v_clean_user IN ('debajoyti', 'ryzen') THEN
        RETURN 0;
    END IF;

    v_is_vip := (COALESCE(p_plan, '') ILIKE '%[VIP]%');

    IF p_days IS NOT NULL AND p_days > 0 THEN
        v_days_val := p_days;
        IF v_days_val = 1 THEN v_slot := '1 Day';
        ELSIF v_days_val = 3 THEN v_slot := '3 Days';
        ELSIF v_days_val = 7 THEN v_slot := '7 Days';
        ELSIF v_days_val = 15 THEN v_slot := '15 Days';
        ELSIF v_days_val = 30 THEN v_slot := '30 Days';
        ELSE v_slot := 'CUSTOM_DAYS';
        END IF;
    ELSE
        IF p_plan ILIKE '%2 Hour%' THEN v_slot := '2 Hours';
        ELSIF p_plan ILIKE '%1 Day%' THEN v_slot := '1 Day';
        ELSIF p_plan ILIKE '%3 Day%' THEN v_slot := '3 Days';
        ELSIF p_plan ILIKE '%7 Day%' THEN v_slot := '7 Days';
        ELSIF p_plan ILIKE '%15 Day%' THEN v_slot := '15 Days';
        ELSIF p_plan ILIKE '%30 Day%' THEN v_slot := '30 Days';
        ELSE v_slot := '1 Day';
        END IF;
    END IF;

    SELECT value INTO v_custom_all FROM public.rymon_system_config WHERE key = 'user_custom_prices';
    SELECT value INTO v_global_map FROM public.rymon_system_config WHERE key = 'global_key_prices';

    IF v_custom_all IS NOT NULL AND jsonb_typeof(v_custom_all) = 'object' THEN
        v_user_map := v_custom_all->v_clean_user;
        IF v_user_map IS NULL THEN
            SELECT value INTO v_user_map
            FROM jsonb_each(v_custom_all)
            WHERE LOWER(key) = v_clean_user
            LIMIT 1;
        END IF;
    END IF;

    IF v_slot = 'CUSTOM_DAYS' THEN
        IF v_user_map IS NOT NULL AND (v_user_map->>'1 Day') IS NOT NULL THEN
            v_cost := (v_user_map->>'1 Day')::NUMERIC;
        ELSIF v_global_map IS NOT NULL AND (v_global_map->>'1 Day') IS NOT NULL THEN
            v_cost := (v_global_map->>'1 Day')::NUMERIC;
        ELSE
            v_cost := 35;
        END IF;
        v_cost := ROUND(v_cost * v_days_val);
    ELSE
        IF v_user_map IS NOT NULL THEN
            IF (v_user_map->>v_slot) IS NOT NULL THEN
                v_cost := (v_user_map->>v_slot)::NUMERIC;
            ELSIF v_slot = '2 Hours' AND (v_user_map->>'2 Hour') IS NOT NULL THEN
                v_cost := (v_user_map->>'2 Hour')::NUMERIC;
            ELSIF v_slot = '1 Day' AND (v_user_map->>'1 Days') IS NOT NULL THEN
                v_cost := (v_user_map->>'1 Days')::NUMERIC;
            ELSIF v_slot = '3 Days' AND (v_user_map->>'3 Day') IS NOT NULL THEN
                v_cost := (v_user_map->>'3 Day')::NUMERIC;
            ELSIF v_slot = '7 Days' AND (v_user_map->>'7 Day') IS NOT NULL THEN
                v_cost := (v_user_map->>'7 Day')::NUMERIC;
            ELSIF v_slot = '15 Days' AND (v_user_map->>'15 Day') IS NOT NULL THEN
                v_cost := (v_user_map->>'15 Day')::NUMERIC;
            ELSIF v_slot = '30 Days' AND (v_user_map->>'30 Day') IS NOT NULL THEN
                v_cost := (v_user_map->>'30 Day')::NUMERIC;
            END IF;
        END IF;

        IF v_cost IS NULL AND v_global_map IS NOT NULL THEN
            IF (v_global_map->>v_slot) IS NOT NULL THEN
                v_cost := (v_global_map->>v_slot)::NUMERIC;
            ELSIF v_slot = '2 Hours' AND (v_global_map->>'2 Hour') IS NOT NULL THEN
                v_cost := (v_global_map->>'2 Hour')::NUMERIC;
            ELSIF v_slot = '1 Day' AND (v_global_map->>'1 Days') IS NOT NULL THEN
                v_cost := (v_global_map->>'1 Days')::NUMERIC;
            ELSIF v_slot = '3 Days' AND (v_global_map->>'3 Day') IS NOT NULL THEN
                v_cost := (v_global_map->>'3 Day')::NUMERIC;
            ELSIF v_slot = '7 Days' AND (v_global_map->>'7 Day') IS NOT NULL THEN
                v_cost := (v_global_map->>'7 Day')::NUMERIC;
            ELSIF v_slot = '15 Days' AND (v_global_map->>'15 Day') IS NOT NULL THEN
                v_cost := (v_global_map->>'15 Day')::NUMERIC;
            ELSIF v_slot = '30 Days' AND (v_global_map->>'30 Day') IS NOT NULL THEN
                v_cost := (v_global_map->>'30 Day')::NUMERIC;
            END IF;
        END IF;

        IF v_cost IS NULL THEN
            IF v_slot = '2 Hours' THEN v_cost := 20;
            ELSIF v_slot = '1 Day' THEN v_cost := 35;
            ELSIF v_slot = '3 Days' THEN v_cost := 50;
            ELSIF v_slot = '7 Days' THEN v_cost := 100;
            ELSIF v_slot = '15 Days' THEN v_cost := 180;
            ELSIF v_slot = '30 Days' THEN v_cost := 350;
            ELSE v_cost := 35;
            END IF;
        END IF;
    END IF;

    IF v_is_vip THEN
        SELECT COALESCE((value->>'vip_price_surcharge_percent')::NUMERIC, 50) INTO v_surcharge
        FROM public.rymon_system_config
        WHERE key = 'sovereign_security_policy';

        IF v_surcharge IS NULL THEN v_surcharge := 50; END IF;
        v_cost := ROUND(v_cost * (1.0 + (v_surcharge / 100.0)));
    END IF;

    RETURN GREATEST(0, v_cost);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_rymon_get_key_unit_cost(TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rymon_get_key_unit_cost(TEXT, TEXT, INT) TO service_role;

-- 4. Auth RPCs: Login (no raw plaintext checks) & Logout (server-side revocation)
CREATE OR REPLACE FUNCTION public.rpc_rymon_login(
    p_username TEXT,
    p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_acc public.rymon_accounts%ROWTYPE;
    v_input_hash TEXT;
    v_input_hash_raw TEXT;
    v_is_valid BOOLEAN := false;
    v_new_attempts INT;
    v_session_token TEXT;
    v_rem_secs INT;
BEGIN
    UPDATE public.rymon_licenses
    SET status = 'EXPIRED', updated_at = now()
    WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= now();

    UPDATE public.rymon_streamer_controls
    SET is_active = false, is_online = false, updated_at = now()
    WHERE expires_at IS NOT NULL AND expires_at <= now() AND is_active = true;

    SELECT * INTO v_acc
    FROM public.rymon_accounts
    WHERE LOWER(username) = LOWER(TRIM(COALESCE(p_username, '')));

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Account not found. Check username or register with an administrator.'
        );
    END IF;

    IF v_acc.status = 'BANNED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Account suspended / banned by Administrator.'
        );
    END IF;

    IF v_acc.role != 'owner' AND v_acc.expires_at IS NOT NULL AND v_acc.expires_at < now() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Account expired on ' || to_char(v_acc.expires_at, 'DD/MM/YYYY')
        );
    END IF;

    IF v_acc.locked_until IS NOT NULL AND v_acc.locked_until > now() THEN
        v_rem_secs := CEIL(EXTRACT(EPOCH FROM (v_acc.locked_until - now())));
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Account temporarily locked due to consecutive failed attempts. Please try again in ' || CEIL(v_rem_secs / 60.0) || ' minute(s).'
        );
    END IF;

    IF v_acc.password_hash LIKE '$2%' THEN
        v_is_valid := (
            extensions.crypt(p_password, v_acc.password_hash) = v_acc.password_hash OR
            extensions.crypt(TRIM(p_password), v_acc.password_hash) = v_acc.password_hash
        );
    ELSIF v_acc.password_hash ~ '^[0-9a-fA-F]{64}$' THEN
        v_input_hash := encode(extensions.digest(TRIM(p_password), 'sha256'), 'hex');
        v_input_hash_raw := encode(extensions.digest(p_password, 'sha256'), 'hex');
        v_is_valid := (
            LOWER(v_acc.password_hash) = LOWER(v_input_hash) OR
            LOWER(v_acc.password_hash) = LOWER(v_input_hash_raw)
        );
    END IF;

    IF NOT v_is_valid THEN
        v_new_attempts := COALESCE(v_acc.failed_attempts, 0) + 1;
        IF v_new_attempts >= 5 THEN
            UPDATE public.rymon_accounts
            SET failed_attempts = v_new_attempts,
                locked_until = now() + INTERVAL '5 minutes',
                updated_at = now()
            WHERE id = v_acc.id;
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Invalid password. Account locked for 5 minutes due to 5 consecutive failed attempts.'
            );
        ELSE
            UPDATE public.rymon_accounts
            SET failed_attempts = v_new_attempts,
                updated_at = now()
            WHERE id = v_acc.id;
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Invalid password. Please try again. (' || (5 - v_new_attempts) || ' attempts remaining before 5-minute security lockout).'
            );
        END IF;
    END IF;

    IF v_acc.password_hash NOT LIKE '$2%' THEN
        UPDATE public.rymon_accounts
        SET password_hash = extensions.crypt(TRIM(p_password), extensions.gen_salt('bf', 8)),
            failed_attempts = 0,
            locked_until = NULL,
            updated_at = now()
        WHERE id = v_acc.id;
    ELSE
        UPDATE public.rymon_accounts
        SET failed_attempts = 0,
            locked_until = NULL,
            updated_at = now()
        WHERE id = v_acc.id;
    END IF;

    v_session_token := encode(extensions.gen_random_bytes(32), 'hex');
    DELETE FROM public.rymon_sessions WHERE expires_at <= now();
    INSERT INTO public.rymon_sessions (account_id, session_token, expires_at)
    VALUES (v_acc.id, v_session_token, now() + INTERVAL '7 days');

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
            'permissions', v_acc.permissions,
            'session_token', v_session_token
        )
    );
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_login(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_login(TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_rymon_logout(
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TRIM(COALESCE(p_session_token, '')) != '' THEN
        DELETE FROM public.rymon_sessions WHERE session_token = TRIM(p_session_token);
    END IF;
    RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_logout(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_logout(TEXT) TO anon, authenticated, service_role;

-- 5. License Verification (APK/Client Path + Web Key Console Path)
DROP FUNCTION IF EXISTS public.rpc_rymon_verify_license(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_verify_license(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_verify_license(
    p_license_key TEXT,
    p_hwid TEXT DEFAULT ''::TEXT,
    p_game TEXT DEFAULT ''::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_key TEXT;
    v_clean_hwid TEXT;
    v_norm_hwid TEXT;
    v_lic public.rymon_licenses%ROWTYPE;
    v_calc_expiry TIMESTAMPTZ;
    v_duration_interval INTERVAL := INTERVAL '30 days';
    v_req_game TEXT;
    v_lic_game TEXT;
    v_gf TEXT := '0xAD68E18';
    v_hwid_parts TEXT[];
    v_hwid_matched BOOLEAN := false;
    v_part TEXT;
    v_new_hwids TEXT;
    v_used_count INT := 1;
BEGIN
    v_clean_key := UPPER(TRIM(COALESCE(p_license_key, '')));
    v_clean_hwid := TRIM(COALESCE(p_hwid, ''));
    v_norm_hwid := public.fn_rymon_normalize_hwid(v_clean_hwid);
    v_req_game  := TRIM(COALESCE(p_game, ''));

    IF v_clean_key = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'License key cannot be empty.');
    END IF;

    IF v_clean_key = 'RYMON-MASTER-KEY' OR v_clean_key LIKE '%MASTER%' OR v_clean_key LIKE '%OWNER%' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Invalid license key. Master key bypass has been permanently revoked.');
    END IF;

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
                COALESCE(NULLIF(sc.plan_duration, ''), '1 Day [VIP]'),
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

    IF v_lic.status = 'BANNED' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'License key has been revoked/banned by administrator.');
    END IF;

    IF COALESCE(v_lic.is_paused, false) THEN
        RETURN jsonb_build_object('valid', false, 'is_paused', true, 'error', 'License key is paused by administrator.');
    END IF;

    v_lic_game := TRIM(COALESCE(v_lic.game, 'Free Fire MAX'));
    IF v_lic_game = '' THEN v_lic_game := 'Free Fire MAX'; END IF;

    IF v_req_game = '' THEN
        IF UPPER(v_lic_game) NOT IN ('UNIVERSAL', 'ALL', 'ANY', 'GLOBAL')
           AND NOT (v_lic_game ILIKE '%Free Fire%') THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'App Mismatch! This key is reserved for "' || v_lic_game || '" (Pure KeyAuth) and cannot be used in Free Fire MAX.'
            );
        END IF;
    ELSE
        IF UPPER(v_lic_game) NOT IN ('UNIVERSAL', 'ALL', 'ANY', 'GLOBAL')
           AND NOT (v_lic_game ILIKE '%Free Fire%' AND v_req_game ILIKE '%Free Fire%')
           AND LOWER(v_lic_game) != LOWER(v_req_game) THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'App Mismatch! This key is only valid for "' || v_lic_game || '", not "' || v_req_game || '". Contact administrator for access.'
            );
        END IF;
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

    IF v_clean_hwid = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Device HWID is required for license verification.');
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
REVOKE ALL ON FUNCTION public.rpc_rymon_verify_license(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_verify_license(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_rymon_verify_web_key(
    p_license_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_key TEXT := UPPER(TRIM(COALESCE(p_license_key, '')));
    v_lic public.rymon_licenses%ROWTYPE;
    v_lic_game TEXT;
BEGIN
    IF v_clean_key = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'License key is required.');
    END IF;
    IF v_clean_key = 'RYMON-MASTER-KEY' OR v_clean_key LIKE '%MASTER%' OR v_clean_key LIKE '%OWNER%' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Master key login is disabled. Use a valid generated license key.');
    END IF;

    SELECT * INTO v_lic FROM public.rymon_licenses WHERE UPPER(license_key) = v_clean_key LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Invalid license key. Check key string or generate a new key.');
    END IF;

    IF v_lic.status = 'BANNED' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'License key has been banned by Administrator.');
    END IF;
    IF v_lic.expires_at IS NOT NULL AND v_lic.expires_at < now() THEN
        RETURN jsonb_build_object('valid', false, 'error', 'License key expired on ' || to_char(v_lic.expires_at, 'DD/MM/YYYY'));
    END IF;

    v_lic_game := TRIM(COALESCE(v_lic.game, 'Free Fire MAX'));
    IF LOWER(v_lic_game) NOT IN ('universal', 'all', 'any', 'global') AND NOT (v_lic_game ILIKE '%Free Fire%') THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'App Mismatch: This key is registered for "' || v_lic_game || '" (Pure KeyAuth). The Streamer Remote HUD is exclusively available for Free Fire MAX.'
        );
    END IF;

    IF EXISTS (SELECT 1 FROM public.rymon_streamer_controls WHERE license_key = v_lic.license_key) THEN
        UPDATE public.rymon_streamer_controls
        SET is_active = (v_lic.status != 'BANNED' AND v_lic.status != 'EXPIRED'),
            is_paused = COALESCE(v_lic.is_paused, false),
            emergency_purge = false,
            plan_duration = v_lic.plan_duration,
            creator = v_lic.creator_username,
            devices_max = COALESCE(v_lic.devices_max, 1),
            devices_used = COALESCE(v_lic.devices_used, 0),
            updated_at = now()
        WHERE license_key = v_lic.license_key;
    ELSE
        INSERT INTO public.rymon_streamer_controls (
            license_key, streamer_name, game_name, is_active, is_paused, is_online,
            plan_duration, creator, devices_max, devices_used,
            aim_silent, hit_rate, ignore_knocked, show_aim_line, show_aim_fov, aim_fov,
            esp_box, esp_line, esp_skeleton, esp_name, esp_distance, esp_health, esp_count, esp_radar,
            speed_hack, speed_multiplier, ghost_hack, no_reload, no_recoil, theme_color_index, emergency_purge,
            expires_at, updated_at
        ) VALUES (
            v_lic.license_key, 'VIP Streamer', v_lic_game, true, COALESCE(v_lic.is_paused, false), false,
            v_lic.plan_duration, v_lic.creator_username, COALESCE(v_lic.devices_max, 1), COALESCE(v_lic.devices_used, 0),
            false, 100, true, false, true, 120,
            true, false, true, true, true, true, true, false,
            false, 1.5, false, false, false, 0, false,
            v_lic.expires_at, now()
        ) ON CONFLICT (license_key) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'key', v_lic.license_key,
        'game', v_lic_game,
        'plan', v_lic.plan_duration,
        'status', v_lic.status,
        'expires_at', v_lic.expires_at,
        'devices_used', v_lic.devices_used,
        'devices_max', v_lic.devices_max
    );
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_verify_web_key(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_verify_web_key(TEXT) TO anon, authenticated, service_role;

-- 6. Session-Authenticated Account, License, Activity, and Referral Readers
DROP FUNCTION IF EXISTS public.rpc_rymon_get_account(TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_get_account(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_get_account(
    p_username TEXT,
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_acc public.rymon_accounts%ROWTYPE;
    v_clean_target TEXT := LOWER(TRIM(COALESCE(p_username, '')));
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('found', false, 'auth_error', true, 'error', 'Unauthorized: Valid session required.');
    END IF;

    IF v_clean_target = '' THEN
        v_clean_target := LOWER(v_actor.username);
    END IF;

    IF LOWER(v_actor.username) != v_clean_target THEN
        IF LOWER(v_actor.username) != 'debajoyti' THEN
            IF v_actor.role = 'owner' THEN
                IF v_clean_target = 'debajoyti' THEN
                    RETURN jsonb_build_object('found', false, 'error', 'Forbidden');
                END IF;
            ELSIF v_actor.role = 'admin' THEN
                IF NOT public.fn_rymon_is_in_downline(v_actor.username, v_clean_target, true) THEN
                    RETURN jsonb_build_object('found', false, 'error', 'Forbidden');
                END IF;
            ELSE
                RETURN jsonb_build_object('found', false, 'error', 'Forbidden');
            END IF;
        END IF;
    END IF;

    SELECT * INTO v_acc FROM public.rymon_accounts WHERE LOWER(username) = v_clean_target LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'id', v_acc.id,
        'username', v_acc.username,
        'email', v_acc.email,
        'role', v_acc.role,
        'balance', v_acc.balance,
        'uplink', v_acc.uplink,
        'referral_code', v_acc.referral_code,
        'status', v_acc.status,
        'expires_at', v_acc.expires_at,
        'permissions', v_acc.permissions
    );
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_get_account(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_get_account(TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_get_accounts();
DROP FUNCTION IF EXISTS public.rpc_rymon_get_accounts(TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_get_accounts(
    p_session_token TEXT DEFAULT ''
)
RETURNS TABLE (
    id UUID,
    username TEXT,
    email TEXT,
    role TEXT,
    balance NUMERIC,
    uplink TEXT,
    referral_code TEXT,
    status TEXT,
    expires_at TIMESTAMPTZ,
    permissions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, '');
    IF v_actor.id IS NULL THEN
        RETURN;
    END IF;
    IF v_actor.role IN ('reseller', 'streamer', 'user') THEN
        RETURN;
    END IF;

    IF LOWER(v_actor.username) = 'debajoyti' THEN
        RETURN QUERY
        SELECT a.id, a.username, a.email, a.role, a.balance, a.uplink, a.referral_code, a.status, a.expires_at, a.permissions
        FROM public.rymon_accounts a
        ORDER BY a.balance DESC;
    ELSIF v_actor.role = 'owner' THEN
        RETURN QUERY
        SELECT a.id, a.username, a.email, a.role, a.balance, a.uplink, a.referral_code, a.status, a.expires_at, a.permissions
        FROM public.rymon_accounts a
        WHERE LOWER(a.username) != 'debajoyti'
        ORDER BY a.balance DESC;
    ELSE
        RETURN QUERY
        WITH RECURSIVE dl AS (
            SELECT LOWER(a.username) AS uname FROM public.rymon_accounts a WHERE LOWER(a.username) = LOWER(v_actor.username)
            UNION ALL
            SELECT LOWER(c.username) FROM public.rymon_accounts c JOIN dl ON LOWER(c.uplink) = dl.uname
            WHERE LOWER(c.username) != 'debajoyti'
        )
        SELECT a.id, a.username, a.email, a.role, a.balance, a.uplink, a.referral_code, a.status, a.expires_at, a.permissions
        FROM public.rymon_accounts a
        WHERE LOWER(a.username) IN (SELECT uname FROM dl)
          AND LOWER(a.username) != 'debajoyti'
        ORDER BY a.balance DESC;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_get_accounts(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_get_accounts(TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_get_licenses(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_get_licenses(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_get_licenses(
    p_actor_username TEXT DEFAULT '',
    p_actor_password TEXT DEFAULT '',
    p_session_token TEXT DEFAULT ''
)
RETURNS SETOF public.rymon_licenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL OR v_actor.role = 'streamer' THEN
        RETURN;
    END IF;

    IF LOWER(v_actor.username) = 'debajoyti' THEN
        RETURN QUERY SELECT * FROM public.rymon_licenses ORDER BY created_at DESC;
        RETURN;
    END IF;

    IF v_actor.role IN ('owner', 'admin') THEN
        RETURN QUERY
        WITH RECURSIVE downline AS (
            SELECT LOWER(username) AS uname FROM public.rymon_accounts WHERE LOWER(username) = LOWER(v_actor.username)
            UNION ALL
            SELECT LOWER(a.username) FROM public.rymon_accounts a INNER JOIN downline d ON LOWER(a.uplink) = d.uname
            WHERE LOWER(a.username) != 'debajoyti'
        )
        SELECT l.*
        FROM public.rymon_licenses l
        WHERE LOWER(l.creator_username) IN (SELECT uname FROM downline)
          AND LOWER(l.creator_username) != 'debajoyti'
        ORDER BY l.created_at DESC;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT * FROM public.rymon_licenses
    WHERE LOWER(creator_username) = LOWER(v_actor.username)
    ORDER BY created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_get_licenses(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_get_licenses(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_get_referrals(TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_get_referrals(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_get_referrals(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_get_referrals(
    p_actor_username TEXT DEFAULT '',
    p_actor_password TEXT DEFAULT '',
    p_session_token TEXT DEFAULT ''
)
RETURNS SETOF public.rymon_referrals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL OR v_actor.role NOT IN ('owner', 'admin') THEN
        RETURN;
    END IF;

    IF v_actor.role = 'owner' OR LOWER(v_actor.username) = 'debajoyti' THEN
        RETURN QUERY SELECT * FROM public.rymon_referrals ORDER BY created_at DESC;
    ELSE
        RETURN QUERY
        SELECT * FROM public.rymon_referrals
        WHERE public.fn_rymon_is_in_downline(v_actor.username, created_by, true)
        ORDER BY created_at DESC;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_get_referrals(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_get_referrals(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_get_activities(TEXT, INT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_get_activities(
    p_session_token TEXT DEFAULT '',
    p_limit INT DEFAULT 30
)
RETURNS SETOF public.rymon_activities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_lim INT := GREATEST(1, LEAST(100, COALESCE(p_limit, 30)));
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, '');
    IF v_actor.id IS NULL OR v_actor.role = 'streamer' THEN
        RETURN;
    END IF;

    IF LOWER(v_actor.username) = 'debajoyti' THEN
        RETURN QUERY SELECT * FROM public.rymon_activities ORDER BY created_at DESC LIMIT v_lim;
    ELSIF v_actor.role = 'reseller' THEN
        RETURN QUERY
        SELECT * FROM public.rymon_activities
        WHERE LOWER(actor_username) = LOWER(v_actor.username)
        ORDER BY created_at DESC LIMIT v_lim;
    ELSE
        RETURN QUERY
        SELECT * FROM public.rymon_activities
        WHERE LOWER(actor_username) != 'debajoyti'
          AND public.fn_rymon_is_in_downline(v_actor.username, actor_username, true)
        ORDER BY created_at DESC LIMIT v_lim;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_get_activities(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_get_activities(TEXT, INT) TO anon, authenticated, service_role;

-- 7. Key Generation, Transfers, Extensions, Pause & Bonus Time (Session Enforced + Atomic)
DROP FUNCTION IF EXISTS public.rpc_rymon_generate_key(TEXT, TEXT, TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS public.rpc_rymon_generate_key(TEXT, TEXT, TEXT, TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_generate_key(TEXT, TEXT, TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.rpc_rymon_generate_key(TEXT, TEXT, TEXT, TEXT, INT, INT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_generate_key(
    p_creator_username  TEXT,
    p_game              TEXT DEFAULT 'Free Fire MAX',
    p_plan              TEXT DEFAULT '1 Day',
    p_custom_prefix     TEXT DEFAULT 'RYMON',
    p_devices_max       INT DEFAULT 1,
    p_quantity          INT DEFAULT 1,
    p_session_token     TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
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
    v_policy JSONB := '{}'::jsonb;
    v_max_dev INT := 1;
    v_max_bulk INT := 10;
    v_new_balance NUMERIC;
BEGIN
    v_creator := public.fn_rymon_resolve_session(p_session_token, p_creator_username);
    IF v_creator.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'error', 'Unauthorized: Valid session required to generate keys.');
    END IF;
    IF v_creator.role NOT IN ('owner', 'admin', 'reseller', 'streamer') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized role.');
    END IF;

    v_clean_game := TRIM(COALESCE(p_game, 'Free Fire MAX'));
    IF v_clean_game = '' THEN v_clean_game := 'Free Fire MAX'; END IF;
    v_is_ff := (v_clean_game ILIKE '%Free Fire%');
    v_devices := GREATEST(1, LEAST(500, COALESCE(p_devices_max, 1)));
    v_qty := GREATEST(1, LEAST(50, COALESCE(p_quantity, 1)));
    v_is_owner := (v_creator.role = 'owner' OR LOWER(v_creator.username) IN ('debajoyti', 'ryzen'));

    SELECT value INTO v_policy FROM public.rymon_system_config WHERE key = 'sovereign_security_policy';

    IF v_creator.role = 'reseller' THEN
        v_max_dev := GREATEST(1, COALESCE((v_policy->>'reseller_max_devices_limit')::INT, 1));
        v_max_bulk := GREATEST(1, COALESCE((v_policy->>'reseller_max_bulk_limit')::INT, 10));
        IF v_devices > v_max_dev THEN
            RETURN jsonb_build_object('success', false, 'error', 'Strict Policy Violation: Reseller device limit is capped at ' || v_max_dev || ' device(s) per key.');
        END IF;
        IF v_qty > v_max_bulk THEN
            RETURN jsonb_build_object('success', false, 'error', 'Strict Policy Violation: Reseller batch limit is capped at ' || v_max_bulk || ' keys per generation.');
        END IF;
    END IF;

    IF NOT v_is_ff AND LOWER(v_creator.username) != 'debajoyti' AND COALESCE((v_creator.permissions->>'allow_custom_apps')::BOOLEAN, false) = false THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission Denied: Custom App generation is restricted to Root Founder (@debajoyti).');
    END IF;

    IF v_is_owner THEN
        v_unit_cost := 0;
        v_total_cost := 0;
        v_new_balance := v_creator.balance;
    ELSE
        v_unit_cost := public.fn_rymon_get_key_unit_cost(v_creator.username, p_plan, NULL);
        v_total_cost := (v_unit_cost * v_devices) * v_qty;

        UPDATE public.rymon_accounts
        SET balance = balance - v_total_cost, updated_at = now()
        WHERE id = v_creator.id AND balance >= v_total_cost
        RETURNING balance INTO v_new_balance;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Insufficient balance! ' || v_qty || ' key(s) require ₹' || v_total_cost || ', but your balance is ₹' || v_creator.balance
            );
        END IF;
        v_creator.balance := v_new_balance;
    END IF;

    IF v_is_ff THEN
        v_game_tag := 'FF';
    ELSE
        v_game_tag := UPPER(SUBSTRING(REGEXP_REPLACE(v_clean_game, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 2));
        IF LENGTH(v_game_tag) < 2 THEN v_game_tag := 'APP'; END IF;
    END IF;

    FOR v_i IN 1..v_qty LOOP
        v_b1 := UPPER(SUBSTRING(encode(extensions.gen_random_bytes(3), 'hex') FROM 1 FOR 4));
        v_b2 := UPPER(SUBSTRING(encode(extensions.gen_random_bytes(3), 'hex') FROM 1 FOR 4));
        v_new_key := UPPER(REGEXP_REPLACE(TRIM(COALESCE(NULLIF(p_custom_prefix, ''), 'RYMON')), '[^A-Za-z0-9]', '', 'g')) || '-' || v_game_tag || '-' || v_b1 || '-' || v_b2;
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
                aim_silent, hit_rate, esp_box, esp_skeleton, theme_color_index,
                expires_at
            ) VALUES (
                v_new_key, 'VIP Streamer', 'Free Fire MAX', true, false,
                p_plan, v_creator.username, v_devices, 0,
                false, 80, true, true, 0,
                NULL
            ) ON CONFLICT (license_key) DO NOTHING;
        END IF;
    END LOOP;

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
REVOKE ALL ON FUNCTION public.rpc_rymon_generate_key(TEXT, TEXT, TEXT, TEXT, INT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_generate_key(TEXT, TEXT, TEXT, TEXT, INT, INT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_transfer_balance(TEXT, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_transfer_balance(TEXT, TEXT, NUMERIC, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_transfer_balance(
    p_sender_username   TEXT,
    p_target_username   TEXT,
    p_amount            NUMERIC,
    p_mode              TEXT DEFAULT 'add',
    p_session_token     TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sender public.rymon_accounts%ROWTYPE;
    v_target public.rymon_accounts%ROWTYPE;
    v_amount NUMERIC := COALESCE(p_amount, 0);
    v_is_root BOOLEAN := FALSE;
    v_is_owner BOOLEAN := FALSE;
    v_new_sender_balance NUMERIC;
    v_new_target_balance NUMERIC;
BEGIN
    v_sender := public.fn_rymon_resolve_session(p_session_token, p_sender_username);
    IF v_sender.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'error', 'Unauthorized: Valid session required.');
    END IF;
    IF v_sender.role NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden: Only Owner or Admin can transfer or credit funds.');
    END IF;

    v_is_root := (LOWER(v_sender.username) = 'debajoyti');
    v_is_owner := (v_sender.role = 'owner' OR LOWER(v_sender.username) IN ('debajoyti', 'ryzen'));

    SELECT * INTO v_target FROM public.rymon_accounts WHERE LOWER(username) = LOWER(TRIM(COALESCE(p_target_username, '')));
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target account not found.');
    END IF;
    IF LOWER(v_target.username) = 'debajoyti' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Root Owner balance cannot be altered.');
    END IF;

    IF NOT v_is_root AND NOT public.fn_rymon_is_in_downline(v_sender.username, v_target.username, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Power restriction: @' || v_target.username || ' is outside your downline.');
    END IF;

    IF v_is_owner AND LOWER(COALESCE(p_mode, 'add')) = 'set' THEN
        IF NOT v_is_root AND LOWER(v_target.role) = 'owner' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Permission Denied.');
        END IF;
        IF v_amount < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Target balance cannot be negative.');
        END IF;
        UPDATE public.rymon_accounts
        SET balance = v_amount, updated_at = now()
        WHERE id = v_target.id
        RETURNING balance INTO v_new_target_balance;

        INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
        VALUES ('Owner Balance Adjustment', 'BALANCE_CREDIT', '@' || v_sender.username || ' set exact balance for @' || v_target.username || ' to ₹' || v_new_target_balance, v_sender.username, 'SUCCESS');

        RETURN jsonb_build_object('success', true, 'sender_balance', v_sender.balance, 'target_balance', v_new_target_balance, 'amount', v_amount, 'mode', 'set');
    END IF;

    IF v_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transfer amount must be greater than 0.');
    END IF;

    IF NOT v_is_owner THEN
        UPDATE public.rymon_accounts
        SET balance = balance - v_amount, updated_at = now()
        WHERE id = v_sender.id AND balance >= v_amount
        RETURNING balance INTO v_new_sender_balance;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance! You have ₹' || v_sender.balance || ' but tried to send ₹' || v_amount);
        END IF;
        v_sender.balance := v_new_sender_balance;
    END IF;

    UPDATE public.rymon_accounts
    SET balance = balance + v_amount, updated_at = now()
    WHERE id = v_target.id
    RETURNING balance INTO v_new_target_balance;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Balance Transfer', 'BALANCE_CREDIT', '@' || v_sender.username || ' credited ₹' || v_amount || ' to @' || v_target.username || ' (New Target Bal: ₹' || v_new_target_balance || ')', v_sender.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'sender_balance', v_sender.balance, 'target_balance', v_new_target_balance, 'amount', v_amount, 'mode', 'add');
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_transfer_balance(TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_transfer_balance(TEXT, TEXT, NUMERIC, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_topup_balance(TEXT, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_topup_balance(TEXT, NUMERIC, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_topup_balance(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_topup_balance(
    p_target_username TEXT,
    p_amount          NUMERIC,
    p_mode            TEXT DEFAULT 'set',
    p_actor_username  TEXT DEFAULT 'debajoyti',
    p_session_token   TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN public.rpc_rymon_transfer_balance(p_actor_username, p_target_username, p_amount, p_mode, p_session_token);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_topup_balance(TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_topup_balance(TEXT, NUMERIC, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- 8. Password Reset, Permissions, Subscription Renewal, Account Deletion
DROP FUNCTION IF EXISTS public.rpc_rymon_reset_password(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_reset_password(TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_reset_password(
    p_target_username TEXT,
    p_new_password    TEXT,
    p_actor_username  TEXT DEFAULT 'debajoyti',
    p_session_token   TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_target public.rymon_accounts%ROWTYPE;
    v_clean_pass TEXT := TRIM(COALESCE(p_new_password, ''));
    v_hash TEXT;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'message', 'Unauthorized: Valid session required.');
    END IF;

    IF LENGTH(v_clean_pass) < 4 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Password must be at least 4 characters long.');
    END IF;

    SELECT * INTO v_target FROM public.rymon_accounts WHERE LOWER(username) = LOWER(TRIM(COALESCE(p_target_username, ''))) LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found.');
    END IF;

    IF LOWER(v_target.username) != LOWER(v_actor.username) THEN
        IF LOWER(v_target.username) = 'debajoyti' AND LOWER(v_actor.username) != 'debajoyti' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Forbidden: Only the Root Owner can modify Root Owner password.');
        END IF;
        IF LOWER(v_actor.username) != 'debajoyti' THEN
            IF v_actor.role = 'owner' THEN
                IF v_target.role = 'owner' THEN
                    RETURN jsonb_build_object('success', false, 'message', 'Forbidden: Cannot reset another Owner password.');
                END IF;
            ELSIF v_actor.role = 'admin' THEN
                IF NOT public.fn_rymon_is_in_downline(v_actor.username, v_target.username, false) OR v_target.role = 'owner' THEN
                    RETURN jsonb_build_object('success', false, 'message', 'Power restriction: You can only reset passwords for accounts in your downline.');
                END IF;
            ELSE
                RETURN jsonb_build_object('success', false, 'message', 'Permission Denied.');
            END IF;
        END IF;
    END IF;

    v_hash := extensions.crypt(v_clean_pass, extensions.gen_salt('bf', 8));
    UPDATE public.rymon_accounts
    SET password_hash = v_hash,
        failed_attempts = 0,
        locked_until = NULL,
        updated_at = now()
    WHERE id = v_target.id;

    -- Invalidate existing sessions for target user (except actor's active self-session)
    DELETE FROM public.rymon_sessions
    WHERE account_id = v_target.id
      AND session_token != TRIM(COALESCE(p_session_token, ''));

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('User Password Reset', 'PASSWORD_RESET', 'Password reset for @' || v_target.username || ' by @' || v_actor.username, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'message', 'Password updated.');
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_reset_password(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_reset_password(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_update_password(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_update_password(TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_update_password(
    p_username TEXT,
    p_new_password TEXT,
    p_actor_username TEXT DEFAULT 'debajoyti',
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN public.rpc_rymon_reset_password(p_username, p_new_password, p_actor_username, p_session_token);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_update_password(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_update_password(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_update_permissions(TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_update_permissions(TEXT, JSONB, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_update_permissions(
    p_username TEXT,
    p_permissions JSONB,
    p_actor_username TEXT DEFAULT 'debajoyti',
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_target public.rymon_accounts%ROWTYPE;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'error', 'Unauthorized: Valid session required.');
    END IF;
    IF v_actor.role NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission Denied.');
    END IF;

    SELECT * INTO v_target FROM public.rymon_accounts WHERE LOWER(username) = LOWER(TRIM(COALESCE(p_username, ''))) LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found.');
    END IF;

    IF LOWER(v_target.username) = 'debajoyti' AND LOWER(v_actor.username) != 'debajoyti' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Root Owner permissions cannot be modified.');
    END IF;
    IF LOWER(v_actor.username) != 'debajoyti' AND NOT public.fn_rymon_is_in_downline(v_actor.username, v_target.username, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission Denied: Target user is outside your downline.');
    END IF;

    UPDATE public.rymon_accounts
    SET permissions = COALESCE(p_permissions, '{}'::jsonb), updated_at = now()
    WHERE id = v_target.id;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Permissions Updated', 'MODERATION', 'Updated permissions for @' || v_target.username || ' by @' || v_actor.username, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_update_permissions(TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_update_permissions(TEXT, JSONB, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_renew_subscription(TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_renew_subscription(TEXT, INT, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS public.rpc_rymon_renew_subscription(TEXT, INT, TEXT, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_renew_subscription(
    p_target_username   TEXT,
    p_days              INT,
    p_actor_username    TEXT DEFAULT 'debajoyti',
    p_fee               NUMERIC DEFAULT 0,
    p_session_token     TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_target public.rymon_accounts%ROWTYPE;
    v_new_exp TIMESTAMPTZ;
    v_is_owner BOOLEAN := FALSE;
    v_days INT := CASE WHEN p_days = 60 THEN 60 ELSE 30 END;
    v_fee NUMERIC := 0;
    v_policy JSONB := '{}'::jsonb;
    v_new_bal NUMERIC;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'error', 'Unauthorized: Valid session required.');
    END IF;
    IF v_actor.role NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission Denied.');
    END IF;

    SELECT * INTO v_target FROM public.rymon_accounts WHERE LOWER(username) = LOWER(TRIM(COALESCE(p_target_username, ''))) LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
    END IF;
    IF LOWER(v_target.username) = 'debajoyti' OR v_target.role = 'owner' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Owner account does not use a reseller subscription.');
    END IF;

    v_is_owner := (v_actor.role = 'owner' OR LOWER(v_actor.username) IN ('debajoyti', 'ryzen'));
    IF LOWER(v_actor.username) != 'debajoyti' AND NOT public.fn_rymon_is_in_downline(v_actor.username, v_target.username, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Power restriction: @' || v_target.username || ' is outside your downline.');
    END IF;

    IF NOT v_is_owner THEN
        SELECT value INTO v_policy FROM public.rymon_system_config WHERE key = 'sovereign_security_policy';
        v_fee := GREATEST(0, COALESCE(
            CASE WHEN v_days = 60 THEN (v_policy->>'admin_sub_renew_fee_60d')::NUMERIC ELSE (v_policy->>'admin_sub_renew_fee_30d')::NUMERIC END,
            0
        ));
        IF v_fee > 0 THEN
            UPDATE public.rymon_accounts
            SET balance = balance - v_fee, updated_at = now()
            WHERE id = v_actor.id AND balance >= v_fee
            RETURNING balance INTO v_new_bal;
            IF NOT FOUND THEN
                RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance! Renewing subscription costs ₹' || v_fee || ', but your balance is ₹' || v_actor.balance);
            END IF;
            v_actor.balance := v_new_bal;
        END IF;
    END IF;

    v_new_exp := LEAST(now() + INTERVAL '60 days', GREATEST(now(), COALESCE(v_target.expires_at, now())) + (v_days || ' days')::INTERVAL);
    UPDATE public.rymon_accounts
    SET expires_at = v_new_exp, status = 'ACTIVE', updated_at = now()
    WHERE id = v_target.id;

    UPDATE public.rymon_licenses
    SET is_paused = false, status = 'ACTIVE', updated_at = now()
    WHERE LOWER(creator_username) = LOWER(v_target.username) AND status = 'PAUSED';

    UPDATE public.rymon_streamer_controls
    SET is_paused = false, updated_at = now()
    WHERE LOWER(creator) = LOWER(v_target.username);

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Subscription Renewed', 'MODERATION', 'Renewed @' || v_target.username || ' for ' || v_days || ' days • Fee: ' || CASE WHEN v_is_owner THEN 'FREE' ELSE '₹' || v_fee END, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'expires_at', v_new_exp, 'remaining_balance', v_actor.balance);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_renew_subscription(TEXT, INT, TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_renew_subscription(TEXT, INT, TEXT, NUMERIC, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_delete_account(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_delete_account(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_delete_account(
    p_target_username TEXT,
    p_actor_username  TEXT DEFAULT 'debajoyti',
    p_session_token   TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_target public.rymon_accounts%ROWTYPE;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'error', 'Unauthorized: Valid session required.');
    END IF;
    IF v_actor.role NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only Owner or Admin can delete accounts.');
    END IF;

    SELECT * INTO v_target FROM public.rymon_accounts WHERE LOWER(username) = LOWER(TRIM(COALESCE(p_target_username, ''))) LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account not found.');
    END IF;

    IF LOWER(v_target.username) = 'debajoyti' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Protected: Root Owner account cannot be deleted.');
    END IF;
    IF LOWER(v_target.username) = LOWER(v_actor.username) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Protected: You cannot delete your own account.');
    END IF;
    IF LOWER(v_actor.username) != 'debajoyti' THEN
        IF v_target.role = 'owner' OR LOWER(v_target.username) = 'ryzen' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Permission Denied: Only Root Founder (debajoyti) can delete Owner accounts.');
        END IF;
        IF NOT public.fn_rymon_is_in_downline(v_actor.username, v_target.username, false) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Permission Denied: @' || v_target.username || ' is not under your downline.');
        END IF;
    END IF;

    DELETE FROM public.rymon_sessions WHERE account_id = v_target.id;
    DELETE FROM public.rymon_accounts WHERE id = v_target.id;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Account Deleted', 'MODERATION', 'Deleted @' || v_target.username || ' (' || UPPER(v_target.role) || ') by @' || v_actor.username, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_delete_account(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_delete_account(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- 9. HWID Resets, Bans, Key Deletion, Extensions, Pause & Bonus Time
DROP FUNCTION IF EXISTS public.rpc_rymon_reset_hwid(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_reset_hwid(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_reset_hwid(
    p_license_key    TEXT,
    p_actor_username TEXT DEFAULT 'debajoyti',
    p_session_token  TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_lic public.rymon_licenses%ROWTYPE;
    v_clean_key TEXT := UPPER(TRIM(COALESCE(p_license_key, '')));
    v_next_status TEXT;
    v_policy JSONB := '{}'::jsonb;
    v_log_map JSONB := '{}'::jsonb;
    v_daily_limit INT := 2;
    v_now_ms BIGINT := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
    v_recent BIGINT[];
    v_remaining INT := NULL;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'message', 'Unauthorized: Valid session required.');
    END IF;

    SELECT * INTO v_lic FROM public.rymon_licenses WHERE UPPER(license_key) = v_clean_key LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'License key not found.');
    END IF;

    IF LOWER(v_actor.username) != 'debajoyti' THEN
        IF LOWER(COALESCE(v_lic.creator_username, '')) = 'debajoyti' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Cannot reset Root Founder keys.');
        END IF;
        IF v_actor.role = 'reseller' THEN
            IF LOWER(v_lic.creator_username) != LOWER(v_actor.username) THEN
                RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Resellers can only reset their own keys.');
            END IF;
        ELSIF NOT public.fn_rymon_is_in_downline(v_actor.username, v_lic.creator_username, true) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Cannot reset HWID on keys outside your downline.');
        END IF;
    END IF;

    SELECT value INTO v_policy FROM public.rymon_system_config WHERE key = 'sovereign_security_policy';
    SELECT COALESCE(value, '{}'::jsonb) INTO v_log_map FROM public.rymon_system_config WHERE key = 'hwid_reset_daily_log';
    v_daily_limit := GREATEST(0, COALESCE((v_policy->>'reseller_hwid_limit_per_day')::INT, 2));

    IF v_actor.role = 'reseller' AND v_daily_limit > 0 THEN
        v_recent := ARRAY(
            SELECT val::BIGINT FROM jsonb_array_elements_text(COALESCE(v_log_map->v_clean_key, '[]'::jsonb)) AS val
            WHERE v_now_ms - val::BIGINT < 86400000
        );
        IF COALESCE(array_length(v_recent, 1), 0) >= v_daily_limit THEN
            RETURN jsonb_build_object('success', false, 'remaining_resets', 0, 'message', 'Anti-Sharing Limit reached (' || v_daily_limit || '/' || v_daily_limit || ' today). Contact Owner/Admin for override.');
        END IF;
        v_recent := array_append(v_recent, v_now_ms);
        v_log_map := jsonb_set(v_log_map, ARRAY[v_clean_key], to_jsonb(v_recent), true);
        v_remaining := GREATEST(0, v_daily_limit - array_length(v_recent, 1));
    ELSIF v_actor.role IN ('owner', 'admin') THEN
        v_log_map := v_log_map - v_clean_key;
    END IF;

    INSERT INTO public.rymon_system_config (key, value, updated_at)
    VALUES ('hwid_reset_daily_log', v_log_map, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    v_next_status := CASE
        WHEN COALESCE(v_lic.is_paused, false) THEN 'PAUSED'
        WHEN v_lic.expires_at IS NOT NULL AND v_lic.expires_at > now() THEN 'ACTIVE'
        ELSE 'WAITING'
    END;

    UPDATE public.rymon_licenses
    SET device_hwid = '', devices_used = 0, status = v_next_status, updated_at = now()
    WHERE id = v_lic.id;

    UPDATE public.rymon_streamer_controls
    SET device_hwid = '', devices_used = 0, is_online = false, updated_at = now()
    WHERE license_key = v_lic.license_key;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('HWID Reset', 'HWID_RESET', 'Device binding cleared for ' || v_lic.license_key || ' by @' || v_actor.username, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'remaining_resets', v_remaining, 'message', 'HWID successfully reset.');
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_reset_hwid(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_reset_hwid(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_rymon_self_reset_hwid(
    p_license_key TEXT,
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_key TEXT := UPPER(TRIM(COALESCE(p_license_key, '')));
    v_lic public.rymon_licenses%ROWTYPE;
    v_actor public.rymon_accounts%ROWTYPE;
    v_is_override BOOLEAN := false;
    v_policy JSONB := '{}'::jsonb;
    v_log_map JSONB := '{}'::jsonb;
    v_allow_client BOOLEAN := true;
    v_daily_limit INT := 1;
    v_now_ms BIGINT := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
    v_recent BIGINT[];
    v_used INT := 0;
    v_remaining INT := 0;
    v_next_status TEXT;
BEGIN
    IF v_clean_key = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please enter a valid license key.');
    END IF;

    SELECT value INTO v_policy FROM public.rymon_system_config WHERE key = 'sovereign_security_policy';
    v_allow_client := COALESCE((v_policy->>'allow_client_self_reset')::BOOLEAN, true);
    v_daily_limit := GREATEST(1, COALESCE((v_policy->>'client_hwid_limit_per_day')::INT, 1));

    IF auth.role() = 'service_role' THEN
        v_is_override := true;
    ELSIF TRIM(COALESCE(p_session_token, '')) != '' THEN
        v_actor := public.fn_rymon_resolve_session(p_session_token, '');
        IF v_actor.id IS NOT NULL AND v_actor.role = 'owner' THEN
            v_is_override := true;
        END IF;
    END IF;

    IF NOT v_is_override AND (NOT v_allow_client OR COALESCE((v_policy->>'client_hwid_limit_per_day')::INT, 1) <= 0) THEN
        RETURN jsonb_build_object('success', false, 'remainingResets', 0, 'usedToday', 0, 'dailyLimit', 0, 'message', 'Client self-service HWID resets are disabled by the owner. Please contact your seller.');
    END IF;

    SELECT * INTO v_lic FROM public.rymon_licenses WHERE UPPER(license_key) = v_clean_key LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'remainingResets', 0, 'usedToday', 0, 'dailyLimit', v_daily_limit, 'message', 'Key ' || v_clean_key || ' not found.');
    END IF;
    IF v_lic.status = 'BANNED' THEN
        RETURN jsonb_build_object('success', false, 'remainingResets', 0, 'usedToday', v_daily_limit, 'dailyLimit', v_daily_limit, 'message', 'Key ' || v_clean_key || ' is BANNED and cannot be reset.');
    END IF;
    IF v_lic.status = 'EXPIRED' OR (v_lic.expires_at IS NOT NULL AND v_lic.expires_at <= now()) THEN
        RETURN jsonb_build_object('success', false, 'remainingResets', 0, 'usedToday', v_daily_limit, 'dailyLimit', v_daily_limit, 'message', 'Key ' || v_clean_key || ' has EXPIRED.');
    END IF;

    SELECT COALESCE(value, '{}'::jsonb) INTO v_log_map FROM public.rymon_system_config WHERE key = 'hwid_reset_daily_log';
    v_recent := ARRAY(
        SELECT val::BIGINT FROM jsonb_array_elements_text(COALESCE(v_log_map->v_lic.license_key, '[]'::jsonb)) AS val
        WHERE v_now_ms - val::BIGINT < 86400000
    );

    IF NOT v_is_override THEN
        IF COALESCE(array_length(v_recent, 1), 0) >= v_daily_limit THEN
            RETURN jsonb_build_object('success', false, 'remainingResets', 0, 'usedToday', v_daily_limit, 'dailyLimit', v_daily_limit, 'message', 'Daily limit reached (' || v_daily_limit || '/' || v_daily_limit || ' resets used today for ' || v_lic.license_key || ').');
        END IF;
        v_recent := array_append(v_recent, v_now_ms);
        v_log_map := jsonb_set(v_log_map, ARRAY[v_lic.license_key], to_jsonb(v_recent), true);
        v_used := array_length(v_recent, 1);
        v_remaining := GREATEST(0, v_daily_limit - v_used);
    ELSE
        v_log_map := v_log_map - v_lic.license_key;
        v_used := 0;
        v_remaining := v_daily_limit;
    END IF;

    INSERT INTO public.rymon_system_config (key, value, updated_at)
    VALUES ('hwid_reset_daily_log', v_log_map, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    v_next_status := CASE WHEN COALESCE(v_lic.is_paused, false) THEN 'PAUSED' WHEN v_lic.expires_at IS NOT NULL THEN 'ACTIVE' ELSE 'WAITING' END;

    UPDATE public.rymon_licenses
    SET device_hwid = '', devices_used = 0, status = v_next_status, updated_at = now()
    WHERE id = v_lic.id;

    UPDATE public.rymon_streamer_controls
    SET device_hwid = '', devices_used = 0, is_online = false, updated_at = now()
    WHERE license_key = v_lic.license_key;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        CASE WHEN v_is_override THEN 'Owner Override HWID Reset' ELSE 'Client Self-Service HWID Reset' END,
        'HWID_RESET',
        'Device HWID unbound for ' || v_lic.license_key,
        CASE WHEN v_is_override THEN COALESCE(v_actor.username, 'debajoyti') ELSE 'Customer' END,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'key', v_lic.license_key,
        'game', v_lic.game,
        'plan_duration', v_lic.plan_duration,
        'remainingResets', v_remaining,
        'usedToday', v_used,
        'dailyLimit', v_daily_limit,
        'isOverride', v_is_override,
        'message', 'HWID cleared for ' || v_lic.license_key || '!'
    );
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_self_reset_hwid(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_self_reset_hwid(TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_rymon_bulk_reset_hwid(
    p_creator_filter TEXT DEFAULT NULL,
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_filter TEXT := NULLIF(LOWER(TRIM(COALESCE(p_creator_filter, ''))), '');
    v_count INT := 0;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, '');
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'message', 'Unauthorized: Valid session required.');
    END IF;
    IF v_actor.role NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Permission Denied.');
    END IF;

    UPDATE public.rymon_licenses
    SET device_hwid = '', devices_used = 0, updated_at = now()
    WHERE status != 'BANNED'
      AND (v_filter IS NULL OR LOWER(creator_username) = v_filter)
      AND (
          LOWER(v_actor.username) = 'debajoyti'
          OR (LOWER(creator_username) != 'debajoyti' AND public.fn_rymon_is_in_downline(v_actor.username, creator_username, true))
      );
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.rymon_streamer_controls
    SET device_hwid = '', devices_used = 0, is_online = false, updated_at = now()
    WHERE (v_filter IS NULL OR LOWER(creator) = v_filter)
      AND (
          LOWER(v_actor.username) = 'debajoyti'
          OR (LOWER(creator) != 'debajoyti' AND public.fn_rymon_is_in_downline(v_actor.username, creator, true))
      );

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Global HWID Reset', 'BULK_HWID_RESET', 'Reset ' || v_count || ' HWID binding(s) by @' || v_actor.username, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'count', v_count, 'message', 'All scoped HWID bindings have been reset.');
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_bulk_reset_hwid(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_bulk_reset_hwid(TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_ban_unban(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_ban_unban(TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_ban_unban(
    p_target         TEXT,
    p_type           TEXT,
    p_action         TEXT,
    p_actor_username TEXT DEFAULT 'debajoyti',
    p_session_token  TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_target_acc public.rymon_accounts%ROWTYPE;
    v_lic public.rymon_licenses%ROWTYPE;
    v_status TEXT := CASE WHEN LOWER(COALESCE(p_action, '')) = 'ban' THEN 'BANNED' ELSE 'ACTIVE' END;
    v_clean_target TEXT := TRIM(COALESCE(p_target, ''));
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'message', 'Unauthorized: Valid session required.');
    END IF;

    IF LOWER(COALESCE(p_type, '')) = 'user' THEN
        IF v_actor.role NOT IN ('owner', 'admin') THEN
            RETURN jsonb_build_object('success', false, 'message', 'Permission Denied.');
        END IF;
        SELECT * INTO v_target_acc FROM public.rymon_accounts WHERE LOWER(username) = LOWER(v_clean_target) LIMIT 1;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'User not found.');
        END IF;
        IF LOWER(v_target_acc.username) = 'debajoyti' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Forbidden: Root Owner account cannot be banned.');
        END IF;
        IF LOWER(v_actor.username) != 'debajoyti' AND NOT public.fn_rymon_is_in_downline(v_actor.username, v_target_acc.username, false) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Power restriction: You can only Ban/Unban accounts in your downline.');
        END IF;

        UPDATE public.rymon_accounts SET status = v_status, updated_at = now() WHERE id = v_target_acc.id;
        IF v_status = 'BANNED' THEN
            DELETE FROM public.rymon_sessions WHERE account_id = v_target_acc.id;
        END IF;
    ELSE
        SELECT * INTO v_lic FROM public.rymon_licenses WHERE license_key = UPPER(v_clean_target) LIMIT 1;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'License key not found.');
        END IF;
        IF LOWER(v_actor.username) != 'debajoyti' THEN
            IF LOWER(COALESCE(v_lic.creator_username, '')) = 'debajoyti' OR NOT public.fn_rymon_is_in_downline(v_actor.username, v_lic.creator_username, true) THEN
                RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: You can only modify keys in your downline.');
            END IF;
        END IF;

        UPDATE public.rymon_licenses SET status = v_status, updated_at = now() WHERE id = v_lic.id;
        UPDATE public.rymon_streamer_controls SET is_active = (v_status != 'BANNED'), is_online = false, updated_at = now() WHERE license_key = v_lic.license_key;
    END IF;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Status Change (' || UPPER(p_action) || ')', 'MODERATION', p_type || ' ' || v_clean_target || ' marked as ' || v_status || ' by @' || v_actor.username, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'status', v_status, 'message', v_clean_target || ' has been ' || v_status || '.');
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_ban_unban(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_ban_unban(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_delete_keys(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_delete_keys(TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_delete_keys(
    p_creator_username TEXT,
    p_key_type         TEXT DEFAULT 'expired',
    p_actor_username   TEXT DEFAULT 'debajoyti',
    p_session_token    TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_target TEXT := LOWER(TRIM(COALESCE(p_creator_username, '')));
    v_deleted_count INT := 0;
    v_keys TEXT[];
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'deleted_count', 0);
    END IF;
    IF LOWER(v_actor.username) != 'debajoyti' AND (v_target = '' OR v_target = 'debajoyti' OR NOT public.fn_rymon_is_in_downline(v_actor.username, v_target, true)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission Denied', 'deleted_count', 0);
    END IF;

    WITH doomed AS (
        DELETE FROM public.rymon_licenses
        WHERE LOWER(creator_username) = v_target
          AND (
              (p_key_type = 'expired' AND (status = 'EXPIRED' OR (expires_at IS NOT NULL AND expires_at < now())))
              OR (p_key_type = 'unused' AND status = 'WAITING' AND devices_used = 0)
              OR (p_key_type NOT IN ('expired', 'unused'))
          )
        RETURNING license_key
    )
    SELECT array_agg(license_key) INTO v_keys FROM doomed;

    v_deleted_count := COALESCE(array_length(v_keys, 1), 0);
    IF v_deleted_count > 0 THEN
        DELETE FROM public.rymon_streamer_controls WHERE license_key = ANY(v_keys);
    END IF;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Keys Purged', 'CLEANUP', 'Purged ' || v_deleted_count || ' ' || p_key_type || ' keys for @' || v_target, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted_count);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_delete_keys(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_delete_keys(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_rymon_delete_single_key(
    p_license_key TEXT,
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_lic public.rymon_licenses%ROWTYPE;
    v_clean_key TEXT := UPPER(TRIM(COALESCE(p_license_key, '')));
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, '');
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'error', 'Unauthorized');
    END IF;

    SELECT * INTO v_lic FROM public.rymon_licenses WHERE UPPER(license_key) = v_clean_key LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Key not found');
    END IF;
    IF LOWER(v_actor.username) != 'debajoyti' THEN
        IF LOWER(COALESCE(v_lic.creator_username, '')) = 'debajoyti' OR NOT public.fn_rymon_is_in_downline(v_actor.username, v_lic.creator_username, true) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Permission Denied');
        END IF;
    END IF;

    DELETE FROM public.rymon_licenses WHERE id = v_lic.id;
    DELETE FROM public.rymon_streamer_controls WHERE license_key = v_lic.license_key;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Key Deleted', 'CLEANUP', 'Deleted key ' || v_lic.license_key || ' by @' || v_actor.username, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_delete_single_key(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_delete_single_key(TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_rymon_bulk_delete_keys(
    p_creator_username TEXT DEFAULT '__ALL__',
    p_key_type         TEXT DEFAULT 'expired',
    p_session_token    TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_target TEXT := LOWER(TRIM(COALESCE(p_creator_username, '__all__')));
    v_is_all BOOLEAN := (v_target IN ('__all__', ''));
    v_keys TEXT[];
    v_count INT := 0;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, '');
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'count', 0);
    END IF;

    WITH doomed AS (
        DELETE FROM public.rymon_licenses l
        WHERE (v_is_all OR LOWER(l.creator_username) = v_target)
          AND (
              LOWER(v_actor.username) = 'debajoyti'
              OR (LOWER(l.creator_username) != 'debajoyti' AND public.fn_rymon_is_in_downline(v_actor.username, l.creator_username, true))
          )
          AND (
              (p_key_type = 'expired' AND (l.status = 'EXPIRED' OR (l.expires_at IS NOT NULL AND l.expires_at < now())))
              OR (p_key_type = 'unused' AND l.status = 'WAITING' AND l.devices_used = 0)
              OR (p_key_type = 'all')
          )
        RETURNING l.license_key
    )
    SELECT array_agg(license_key) INTO v_keys FROM doomed;

    v_count := COALESCE(array_length(v_keys, 1), 0);
    IF v_count > 0 THEN
        DELETE FROM public.rymon_streamer_controls WHERE license_key = ANY(v_keys);
        INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
        VALUES ('Keys Purged (' || UPPER(p_key_type) || ')', 'CLEANUP', 'Purged ' || v_count || ' ' || p_key_type || ' key(s) by @' || v_actor.username, v_actor.username, 'SUCCESS');
    END IF;

    RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_bulk_delete_keys(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_bulk_delete_keys(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_extend_key(TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_extend_key(TEXT, INT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_extend_key(
    p_license_key       TEXT,
    p_days              INT DEFAULT 1,
    p_actor_username    TEXT DEFAULT 'debajoyti',
    p_session_token     TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_lic public.rymon_licenses%ROWTYPE;
    v_clean_key TEXT := UPPER(TRIM(COALESCE(p_license_key, '')));
    v_new_exp TIMESTAMPTZ;
    v_cost NUMERIC := 0;
    v_devices INT := 1;
    v_unit_cost NUMERIC := 0;
    v_is_owner BOOLEAN := FALSE;
    v_days INT := GREATEST(1, LEAST(30, COALESCE(p_days, 1)));
    v_max_exp TIMESTAMPTZ := now() + INTERVAL '365 days';
    v_curr_days INT := 1;
    v_total_days INT := 1;
    v_new_plan TEXT;
    v_is_vip BOOLEAN := FALSE;
    v_new_bal NUMERIC;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'error', 'Unauthorized: Valid session required.');
    END IF;

    SELECT * INTO v_lic FROM public.rymon_licenses WHERE license_key = v_clean_key LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'License key not found: ' || v_clean_key);
    END IF;
    IF v_lic.status = 'BANNED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot extend a revoked/banned license.');
    END IF;

    v_is_owner := (v_actor.role = 'owner' OR LOWER(v_actor.username) IN ('debajoyti', 'ryzen'));
    IF LOWER(v_actor.username) != 'debajoyti' THEN
        IF LOWER(COALESCE(v_lic.creator_username, '')) = 'debajoyti' OR NOT public.fn_rymon_is_in_downline(v_actor.username, v_lic.creator_username, true) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Permission Denied: Cannot extend keys outside your downline.');
        END IF;
    END IF;

    v_devices := GREATEST(1, COALESCE(v_lic.devices_max, 1));
    v_is_vip := (v_lic.plan_duration ILIKE '%VIP%');
    IF v_is_owner THEN
        v_cost := 0;
    ELSE
        v_unit_cost := public.fn_rymon_get_key_unit_cost(v_actor.username, CASE WHEN v_is_vip THEN '[VIP]' ELSE '' END, v_days);
        v_cost := v_unit_cost * v_devices;
        IF v_cost > 0 THEN
            UPDATE public.rymon_accounts
            SET balance = balance - v_cost, updated_at = now()
            WHERE id = v_actor.id AND balance >= v_cost
            RETURNING balance INTO v_new_bal;
            IF NOT FOUND THEN
                RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance! Extending ' || v_clean_key || ' costs ₹' || v_cost || ', balance is ₹' || v_actor.balance);
            END IF;
            v_actor.balance := v_new_bal;
        END IF;
    END IF;

    v_curr_days := COALESCE(NULLIF(SUBSTRING(v_lic.plan_duration FROM '([0-9]+)'), '')::INT, 1);
    v_total_days := v_curr_days + v_days;
    v_new_plan := v_total_days || ' Days' || CASE WHEN v_is_vip THEN ' [VIP]' ELSE '' END;

    IF v_lic.expires_at IS NULL THEN
        v_new_exp := NULL;
        UPDATE public.rymon_licenses SET plan_duration = v_new_plan, updated_at = now() WHERE id = v_lic.id;
        UPDATE public.rymon_streamer_controls SET plan_duration = v_new_plan, expires_at = NULL, updated_at = now() WHERE license_key = v_lic.license_key;
    ELSE
        v_new_exp := LEAST(GREATEST(v_lic.expires_at, now()) + (v_days || ' days')::INTERVAL, v_max_exp);
        UPDATE public.rymon_licenses
        SET expires_at = v_new_exp, plan_duration = v_new_plan,
            status = CASE WHEN is_paused THEN 'PAUSED' ELSE 'ACTIVE' END, updated_at = now()
        WHERE id = v_lic.id;
        UPDATE public.rymon_streamer_controls
        SET expires_at = v_new_exp, plan_duration = v_new_plan, is_active = true, updated_at = now()
        WHERE license_key = v_lic.license_key;
    END IF;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Key Extended', 'KEY_EXTEND', 'Extended ' || v_lic.license_key || ' by +' || v_days || 'd • Cost: ' || CASE WHEN v_is_owner THEN 'FREE' ELSE '₹' || v_cost END, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'new_expires_at', v_new_exp, 'remaining_balance', v_actor.balance, 'cost', v_cost, 'plan_duration', v_new_plan);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_extend_key(TEXT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_extend_key(TEXT, INT, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_bulk_extend_keys(INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_bulk_extend_keys(INT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_bulk_extend_keys(
    p_days              INT DEFAULT 1,
    p_actor_username    TEXT DEFAULT 'debajoyti',
    p_creator_filter    TEXT DEFAULT NULL,
    p_session_token     TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_is_owner BOOLEAN := FALSE;
    v_days INT := GREATEST(1, LEAST(30, COALESCE(p_days, 7)));
    v_total_cost NUMERIC := 0;
    v_count INT := 0;
    v_lic RECORD;
    v_unit_cost NUMERIC := 0;
    v_key_cost NUMERIC := 0;
    v_max_exp TIMESTAMPTZ := now() + INTERVAL '365 days';
    v_new_exp TIMESTAMPTZ;
    v_curr_days INT := 1;
    v_total_days INT := 1;
    v_new_plan TEXT;
    v_is_vip BOOLEAN := FALSE;
    v_new_bal NUMERIC;
    v_filter TEXT := NULLIF(LOWER(TRIM(COALESCE(p_creator_filter, ''))), '');
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'count', 0, 'message', 'Unauthorized: Valid session required.');
    END IF;
    v_is_owner := (v_actor.role = 'owner' OR LOWER(v_actor.username) IN ('debajoyti', 'ryzen'));

    FOR v_lic IN
        SELECT id, license_key, creator_username, devices_max, plan_duration, expires_at, is_paused
        FROM public.rymon_licenses
        WHERE status != 'BANNED'
          AND (v_filter IS NULL OR LOWER(creator_username) = v_filter)
          AND (
              LOWER(v_actor.username) = 'debajoyti'
              OR (LOWER(creator_username) != 'debajoyti' AND public.fn_rymon_is_in_downline(v_actor.username, creator_username, true))
          )
    LOOP
        v_is_vip := (v_lic.plan_duration ILIKE '%VIP%');
        IF NOT v_is_owner THEN
            v_unit_cost := public.fn_rymon_get_key_unit_cost(v_actor.username, CASE WHEN v_is_vip THEN '[VIP]' ELSE '' END, v_days);
            v_key_cost := v_unit_cost * GREATEST(1, COALESCE(v_lic.devices_max, 1));
            v_total_cost := v_total_cost + v_key_cost;
        END IF;
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN jsonb_build_object('success', true, 'count', 0, 'message', 'No active keys found to extend.');
    END IF;

    IF NOT v_is_owner AND v_total_cost > 0 THEN
        UPDATE public.rymon_accounts
        SET balance = balance - v_total_cost, updated_at = now()
        WHERE id = v_actor.id AND balance >= v_total_cost
        RETURNING balance INTO v_new_bal;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'count', 0, 'message', 'Insufficient wallet balance! Bulk extending ' || v_count || ' key(s) costs ₹' || v_total_cost || ', balance is ₹' || v_actor.balance);
        END IF;
        v_actor.balance := v_new_bal;
    END IF;

    FOR v_lic IN
        SELECT id, license_key, expires_at, is_paused, plan_duration
        FROM public.rymon_licenses
        WHERE status != 'BANNED'
          AND (v_filter IS NULL OR LOWER(creator_username) = v_filter)
          AND (
              LOWER(v_actor.username) = 'debajoyti'
              OR (LOWER(creator_username) != 'debajoyti' AND public.fn_rymon_is_in_downline(v_actor.username, creator_username, true))
          )
    LOOP
        v_curr_days := COALESCE(NULLIF(SUBSTRING(v_lic.plan_duration FROM '([0-9]+)'), '')::INT, 1);
        v_total_days := v_curr_days + v_days;
        v_is_vip := (v_lic.plan_duration ILIKE '%VIP%');
        v_new_plan := v_total_days || ' Days' || CASE WHEN v_is_vip THEN ' [VIP]' ELSE '' END;

        IF v_lic.expires_at IS NULL THEN
            UPDATE public.rymon_licenses SET plan_duration = v_new_plan, updated_at = now() WHERE id = v_lic.id;
            UPDATE public.rymon_streamer_controls SET plan_duration = v_new_plan, expires_at = NULL, updated_at = now() WHERE license_key = v_lic.license_key;
        ELSE
            v_new_exp := LEAST(GREATEST(v_lic.expires_at, now()) + (v_days || ' days')::INTERVAL, v_max_exp);
            UPDATE public.rymon_licenses
            SET expires_at = v_new_exp, plan_duration = v_new_plan, status = CASE WHEN is_paused THEN 'PAUSED' ELSE 'ACTIVE' END, updated_at = now()
            WHERE id = v_lic.id;
            UPDATE public.rymon_streamer_controls
            SET expires_at = v_new_exp, plan_duration = v_new_plan, is_active = true, updated_at = now()
            WHERE license_key = v_lic.license_key;
        END IF;
    END LOOP;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Bulk Key Extend (' || v_count || ' keys • +' || v_days || 'd)', 'KEY_EXTEND', 'Bulk extended ' || v_count || ' key(s) by +' || v_days || 'd • Cost: ' || CASE WHEN v_is_owner THEN 'FREE' ELSE '₹' || v_total_cost END, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'count', v_count, 'total_cost', v_total_cost, 'remaining_balance', v_actor.balance, 'message', 'Successfully extended ' || v_count || ' key(s) by +' || v_days || ' days.');
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_bulk_extend_keys(INT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_bulk_extend_keys(INT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_toggle_pause_key(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_toggle_pause_key(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_toggle_pause_key(
    p_license_key TEXT,
    p_requester TEXT DEFAULT 'debajoyti',
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_clean_key TEXT := UPPER(TRIM(COALESCE(p_license_key, '')));
    v_creator TEXT;
    v_curr_paused BOOLEAN;
    v_curr_status TEXT;
    v_curr_expires TIMESTAMPTZ;
    v_curr_paused_at TIMESTAMPTZ;
    v_new_paused BOOLEAN;
    v_new_status TEXT;
    v_new_paused_at TIMESTAMPTZ;
    v_new_expires_at TIMESTAMPTZ;
    v_frozen_interval INTERVAL;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_requester);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'message', 'Unauthorized: Valid session required.');
    END IF;

    SELECT creator_username, is_paused, status, expires_at, paused_at
    INTO v_creator, v_curr_paused, v_curr_status, v_curr_expires, v_curr_paused_at
    FROM public.rymon_licenses WHERE UPPER(license_key) = v_clean_key;

    IF v_creator IS NULL THEN
        SELECT creator, is_paused, expires_at, paused_at
        INTO v_creator, v_curr_paused, v_curr_expires, v_curr_paused_at
        FROM public.rymon_streamer_controls WHERE UPPER(license_key) = v_clean_key;
    END IF;
    IF v_creator IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'License key ' || v_clean_key || ' not found.');
    END IF;

    IF LOWER(v_actor.username) != 'debajoyti' THEN
        IF LOWER(v_creator) = 'debajoyti' OR NOT public.fn_rymon_is_in_downline(v_actor.username, v_creator, true) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Key is protected or outside your downline.');
        END IF;
    END IF;

    IF v_curr_status = 'BANNED' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cannot pause or resume a BANNED key.');
    END IF;

    v_new_paused := NOT COALESCE(v_curr_paused, false);
    IF v_new_paused THEN
        v_new_paused_at := v_now;
        v_new_expires_at := v_curr_expires;
        v_new_status := 'PAUSED';
    ELSE
        v_new_paused_at := NULL;
        v_frozen_interval := CASE WHEN v_curr_paused_at IS NOT NULL THEN GREATEST(INTERVAL '0', v_now - v_curr_paused_at) ELSE INTERVAL '0' END;
        IF v_curr_expires IS NOT NULL THEN
            v_new_expires_at := LEAST(v_curr_expires + v_frozen_interval, v_now + INTERVAL '365 days');
            v_new_status := 'ACTIVE';
        ELSE
            v_new_expires_at := NULL;
            v_new_status := 'WAITING';
        END IF;
    END IF;

    UPDATE public.rymon_licenses
    SET is_paused = v_new_paused, paused_at = v_new_paused_at, expires_at = v_new_expires_at, status = v_new_status, updated_at = v_now
    WHERE UPPER(license_key) = v_clean_key;

    UPDATE public.rymon_streamer_controls
    SET is_paused = v_new_paused, paused_at = v_new_paused_at, expires_at = v_new_expires_at,
        is_online = CASE WHEN v_new_paused THEN false ELSE is_online END, updated_at = v_now
    WHERE UPPER(license_key) = v_clean_key;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (CASE WHEN v_new_paused THEN 'Key Paused' ELSE 'Key Resumed' END, 'MODERATION', v_clean_key || ' -> ' || v_new_status || ' by @' || v_actor.username, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object(
        'success', true, 'is_paused', v_new_paused, 'status', v_new_status, 'new_expires_at', v_new_expires_at,
        'message', CASE WHEN v_new_paused THEN '❄️ Key ' || v_clean_key || ' PAUSED — Countdown timer frozen.' ELSE '▶️ Key ' || v_clean_key || ' RESUMED!' END
    );
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_toggle_pause_key(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_toggle_pause_key(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_bulk_pause_keys(BOOLEAN, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_bulk_pause_keys(BOOLEAN, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_bulk_pause_keys(
    p_pause_state BOOLEAN,
    p_actor_username TEXT DEFAULT 'debajoyti',
    p_creator_filter TEXT DEFAULT NULL,
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_filter TEXT := NULLIF(LOWER(TRIM(COALESCE(p_creator_filter, ''))), '');
    v_now TIMESTAMPTZ := clock_timestamp();
    v_affected INT := 0;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'count', 0, 'message', 'Unauthorized.');
    END IF;
    IF v_actor.role NOT IN ('owner', 'admin', 'reseller') THEN
        RETURN jsonb_build_object('success', false, 'count', 0, 'message', 'Permission Denied.');
    END IF;

    WITH updated_rows AS (
        UPDATE public.rymon_licenses
        SET is_paused = p_pause_state,
            paused_at = CASE WHEN p_pause_state THEN COALESCE(paused_at, v_now) ELSE NULL END,
            expires_at = CASE
                WHEN p_pause_state OR expires_at IS NULL THEN expires_at
                ELSE LEAST(expires_at + GREATEST(INTERVAL '0', v_now - COALESCE(paused_at, v_now)), v_now + INTERVAL '365 days')
            END,
            status = CASE WHEN p_pause_state THEN 'PAUSED' WHEN expires_at IS NOT NULL THEN 'ACTIVE' ELSE 'WAITING' END,
            updated_at = v_now
        WHERE status NOT IN ('BANNED', 'EXPIRED')
          AND (v_filter IS NULL OR LOWER(creator_username) = v_filter)
          AND (
              LOWER(v_actor.username) = 'debajoyti'
              OR (LOWER(creator_username) != 'debajoyti' AND public.fn_rymon_is_in_downline(v_actor.username, creator_username, true))
          )
        RETURNING license_key, is_paused, paused_at, expires_at
    )
    SELECT COUNT(*) INTO v_affected FROM updated_rows;

    UPDATE public.rymon_streamer_controls c
    SET is_paused = l.is_paused, paused_at = l.paused_at, expires_at = l.expires_at,
        is_online = CASE WHEN l.is_paused THEN false ELSE c.is_online END, updated_at = v_now
    FROM public.rymon_licenses l
    WHERE c.license_key = l.license_key
      AND l.status NOT IN ('BANNED', 'EXPIRED')
      AND (v_filter IS NULL OR LOWER(l.creator_username) = v_filter)
      AND (
          LOWER(v_actor.username) = 'debajoyti'
          OR (LOWER(l.creator_username) != 'debajoyti' AND public.fn_rymon_is_in_downline(v_actor.username, l.creator_username, true))
      );

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Bulk ' || CASE WHEN p_pause_state THEN 'Pause' ELSE 'Resume' END, 'MODERATION', 'Updated ' || v_affected || ' key(s) by @' || v_actor.username, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'count', v_affected, 'message', CASE WHEN p_pause_state THEN 'Paused ' || v_affected || ' keys.' ELSE 'Resumed ' || v_affected || ' keys.' END);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_bulk_pause_keys(BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_bulk_pause_keys(BOOLEAN, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_grant_bonus_time(TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_grant_bonus_time(TEXT, NUMERIC, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_grant_bonus_time(
    p_license_key TEXT,
    p_bonus_hours NUMERIC,
    p_actor_username TEXT DEFAULT 'debajoyti',
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_lic public.rymon_licenses%ROWTYPE;
    v_clean_key TEXT := UPPER(TRIM(COALESCE(p_license_key, '')));
    v_now TIMESTAMPTZ := clock_timestamp();
    v_bonus INTERVAL;
    v_new_exp TIMESTAMPTZ;
    v_new_status TEXT;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'message', 'Unauthorized.');
    END IF;
    IF p_bonus_hours IS NULL OR p_bonus_hours <= 0 OR p_bonus_hours > 2160 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bonus hours must be between 1 and 2160.');
    END IF;

    SELECT * INTO v_lic FROM public.rymon_licenses WHERE UPPER(license_key) = v_clean_key LIMIT 1;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'License key not found.'); END IF;
    IF v_lic.status = 'BANNED' THEN RETURN jsonb_build_object('success', false, 'message', 'Cannot grant bonus time to a BANNED key.'); END IF;

    IF LOWER(v_actor.username) != 'debajoyti' THEN
        IF LOWER(COALESCE(v_lic.creator_username, '')) = 'debajoyti' OR NOT public.fn_rymon_is_in_downline(v_actor.username, v_lic.creator_username, true) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Key is outside your downline.');
        END IF;
    END IF;

    v_bonus := (p_bonus_hours || ' hours')::INTERVAL;
    v_new_exp := LEAST(GREATEST(COALESCE(v_lic.expires_at, v_now), v_now) + v_bonus, v_now + INTERVAL '365 days');
    v_new_status := CASE WHEN COALESCE(v_lic.is_paused, false) THEN 'PAUSED' ELSE 'ACTIVE' END;

    UPDATE public.rymon_licenses SET expires_at = v_new_exp, status = v_new_status, updated_at = v_now WHERE id = v_lic.id;
    UPDATE public.rymon_streamer_controls SET expires_at = v_new_exp, is_active = true, updated_at = v_now WHERE license_key = v_lic.license_key;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Bonus Time Granted', 'KEY_EXTEND', 'Added +' || p_bonus_hours || 'h to ' || v_lic.license_key || ' by @' || v_actor.username, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'new_expires_at', v_new_exp, 'status', v_new_status, 'message', '🎁 Granted +' || p_bonus_hours || ' hrs bonus time!');
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_grant_bonus_time(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_grant_bonus_time(TEXT, NUMERIC, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_bulk_grant_bonus_time(NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_bulk_grant_bonus_time(NUMERIC, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_bulk_grant_bonus_time(
    p_bonus_hours NUMERIC,
    p_actor_username TEXT DEFAULT 'debajoyti',
    p_creator_filter TEXT DEFAULT NULL,
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_filter TEXT := NULLIF(LOWER(TRIM(COALESCE(p_creator_filter, ''))), '');
    v_now TIMESTAMPTZ := clock_timestamp();
    v_bonus INTERVAL;
    v_count INT := 0;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'count', 0, 'message', 'Unauthorized.');
    END IF;
    IF p_bonus_hours IS NULL OR p_bonus_hours <= 0 OR p_bonus_hours > 2160 THEN
        RETURN jsonb_build_object('success', false, 'count', 0, 'message', 'Bonus hours must be between 1 and 2160.');
    END IF;
    IF v_actor.role NOT IN ('owner', 'admin', 'reseller') THEN
        RETURN jsonb_build_object('success', false, 'count', 0, 'message', 'Permission Denied.');
    END IF;

    v_bonus := (p_bonus_hours || ' hours')::INTERVAL;
    UPDATE public.rymon_licenses
    SET expires_at = LEAST(GREATEST(COALESCE(expires_at, v_now), v_now) + v_bonus, v_now + INTERVAL '365 days'),
        status = CASE WHEN COALESCE(is_paused, false) THEN 'PAUSED' ELSE 'ACTIVE' END,
        updated_at = v_now
    WHERE status != 'BANNED'
      AND (v_filter IS NULL OR LOWER(creator_username) = v_filter)
      AND (
          LOWER(v_actor.username) = 'debajoyti'
          OR (LOWER(creator_username) != 'debajoyti' AND public.fn_rymon_is_in_downline(v_actor.username, creator_username, true))
      );
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.rymon_streamer_controls c
    SET expires_at = l.expires_at, is_active = true, updated_at = v_now
    FROM public.rymon_licenses l
    WHERE c.license_key = l.license_key
      AND l.status != 'BANNED'
      AND (v_filter IS NULL OR LOWER(l.creator_username) = v_filter)
      AND (
          LOWER(v_actor.username) = 'debajoyti'
          OR (LOWER(l.creator_username) != 'debajoyti' AND public.fn_rymon_is_in_downline(v_actor.username, l.creator_username, true))
      );

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Bulk Bonus Time', 'KEY_EXTEND', 'Granted +' || p_bonus_hours || 'h bonus to ' || v_count || ' key(s) by @' || v_actor.username, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'count', v_count, 'message', '🎁 Granted +' || p_bonus_hours || ' hrs bonus to ' || v_count || ' key(s)!');
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_bulk_grant_bonus_time(NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_bulk_grant_bonus_time(NUMERIC, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- 10. Referrals, Registration, Broadcasts, Purge & System Config Writer
DROP FUNCTION IF EXISTS public.rpc_rymon_create_referral(TEXT, TEXT, NUMERIC, INT, INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_create_referral(TEXT, TEXT, NUMERIC, INT, INT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_create_referral(
    p_code              TEXT,
    p_target_role       TEXT,
    p_initial_balance   NUMERIC DEFAULT 0,
    p_max_uses          INT DEFAULT 1,
    p_subscription_days INT DEFAULT 30,
    p_actor_username    TEXT DEFAULT 'debajoyti',
    p_actor_password    TEXT DEFAULT '',
    p_session_token     TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_clean_code TEXT := UPPER(TRIM(COALESCE(p_code, '')));
    v_clean_role TEXT := LOWER(TRIM(COALESCE(p_target_role, 'reseller')));
    v_is_owner BOOLEAN := FALSE;
    v_total_cost NUMERIC := 0;
    v_init_bal NUMERIC := GREATEST(0, COALESCE(p_initial_balance, 0));
    v_uses INT := GREATEST(1, LEAST(100, COALESCE(p_max_uses, 1)));
    v_sub_days INT := CASE WHEN p_subscription_days = 60 THEN 60 ELSE 30 END;
    v_new_bal NUMERIC;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'error', 'Unauthorized: Valid session required.');
    END IF;
    IF v_actor.role NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden: Only Owners or Admins can create referral codes.');
    END IF;
    IF v_clean_code = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral code cannot be empty.');
    END IF;
    IF v_clean_role NOT IN ('admin', 'reseller') THEN
        v_clean_role := 'reseller';
    END IF;

    v_is_owner := (v_actor.role = 'owner' OR LOWER(v_actor.username) IN ('debajoyti', 'ryzen'));
    IF NOT v_is_owner AND v_clean_role = 'admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden: Only Owners (debajoyti & ryzen) can create Admin invite codes');
    END IF;
    IF EXISTS (SELECT 1 FROM public.rymon_referrals WHERE code = v_clean_code) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral code already exists: ' || v_clean_code);
    END IF;

    IF NOT v_is_owner AND v_init_bal > 0 THEN
        v_total_cost := v_init_bal * v_uses;
        UPDATE public.rymon_accounts
        SET balance = balance - v_total_cost, updated_at = now()
        WHERE id = v_actor.id AND balance >= v_total_cost
        RETURNING balance INTO v_new_bal;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance! Creating this code requires ₹' || v_total_cost || ', balance is ₹' || v_actor.balance);
        END IF;
        v_actor.balance := v_new_bal;
    END IF;

    INSERT INTO public.rymon_referrals (
        code, target_role, initial_balance, max_uses, subscription_days, created_by, is_active, times_used, created_at, updated_at
    ) VALUES (
        v_clean_code, v_clean_role, v_init_bal, v_uses, v_sub_days, v_actor.username, true, 0, now(), now()
    );

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Invite Code Created (' || UPPER(v_clean_role) || ' • ' || v_sub_days || 'D)', 'REFERRAL_CREATE', 'Code ' || v_clean_code || ' created by @' || v_actor.username, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'code', v_clean_code, 'target_role', v_clean_role, 'subscription_days', v_sub_days, 'initial_balance', v_init_bal, 'max_uses', v_uses, 'remaining_balance', v_actor.balance);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_create_referral(TEXT, TEXT, NUMERIC, INT, INT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_create_referral(TEXT, TEXT, NUMERIC, INT, INT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_delete_referral(INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_delete_referral(BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_rymon_delete_referral(BIGINT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_delete_referral(
    p_id BIGINT,
    p_code TEXT DEFAULT NULL,
    p_actor_username TEXT DEFAULT 'debajoyti',
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_ref public.rymon_referrals%ROWTYPE;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'error', 'Unauthorized');
    END IF;
    IF v_actor.role NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission Denied');
    END IF;

    SELECT * INTO v_ref FROM public.rymon_referrals
    WHERE id = p_id OR (p_code IS NOT NULL AND UPPER(code) = UPPER(TRIM(p_code)))
    LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral code not found');
    END IF;

    IF v_actor.role != 'owner' AND LOWER(v_actor.username) != 'debajoyti' AND NOT public.fn_rymon_is_in_downline(v_actor.username, v_ref.created_by, true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission Denied');
    END IF;

    DELETE FROM public.rymon_referrals WHERE id = v_ref.id;
    RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_delete_referral(BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_delete_referral(BIGINT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_rymon_register_with_referral(
    p_username TEXT,
    p_password TEXT,
    p_email TEXT DEFAULT '',
    p_referral_code TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_user TEXT := LOWER(TRIM(COALESCE(p_username, '')));
    v_clean_code TEXT := UPPER(TRIM(COALESCE(p_referral_code, '')));
    v_clean_email TEXT;
    v_ref public.rymon_referrals%ROWTYPE;
    v_new_id UUID := gen_random_uuid();
    v_exp TIMESTAMPTZ;
    v_session_token TEXT;
    v_user_obj JSONB;
BEGIN
    IF LENGTH(v_clean_user) < 3 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Username must be at least 3 characters');
    END IF;
    IF p_password IS NULL OR LENGTH(TRIM(p_password)) < 4 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Password must be at least 4 characters');
    END IF;
    IF v_clean_user IN ('debajoyti', 'rymon', 'ryzen', 'root', 'admin', 'system') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Reserved username cannot be registered');
    END IF;
    IF EXISTS (SELECT 1 FROM public.rymon_accounts WHERE LOWER(username) = v_clean_user) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Username already taken. Please choose another.');
    END IF;

    -- Atomic claim on invite code (prevents concurrent double-use past max_uses)
    UPDATE public.rymon_referrals
    SET times_used = times_used + 1,
        is_active = CASE WHEN times_used + 1 >= max_uses THEN false ELSE true END,
        updated_at = now()
    WHERE code = v_clean_code
      AND is_active = true
      AND times_used < max_uses
    RETURNING * INTO v_ref;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid or exhausted referral code. Ask an owner or admin for a genuine invite code.');
    END IF;

    v_clean_email := COALESCE(NULLIF(TRIM(p_email), ''), v_clean_user || '@rymon.vip');
    v_exp := now() + (COALESCE(v_ref.subscription_days, 30) || ' days')::INTERVAL;

    INSERT INTO public.rymon_accounts (
        id, username, password_hash, email, role, balance, uplink, referral_code, status, expires_at, permissions
    ) VALUES (
        v_new_id, v_clean_user, extensions.crypt(TRIM(p_password), extensions.gen_salt('bf', 8)),
        v_clean_email, v_ref.target_role, v_ref.initial_balance, v_ref.created_by, v_clean_code, 'ACTIVE', v_exp,
        jsonb_build_object('dashboard', true, 'generate_key', true, 'license_keys', true, 'telegram_bot', false, 'account_settings', true, 'allow_custom_apps', false)
    );

    v_session_token := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.rymon_sessions (account_id, session_token, expires_at)
    VALUES (v_new_id, v_session_token, now() + INTERVAL '7 days');

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('New ' || UPPER(v_ref.target_role) || ' Registered', 'REFERRAL_REGISTER', '@' || v_clean_user || ' joined via ' || v_clean_code || ' (Uplink: @' || v_ref.created_by || ')', v_clean_user, 'SUCCESS');

    SELECT jsonb_build_object(
        'id', id, 'username', username, 'email', email, 'role', role,
        'balance', balance, 'uplink', uplink, 'status', status, 'expires_at', expires_at,
        'permissions', permissions, 'session_token', v_session_token
    ) INTO v_user_obj FROM public.rymon_accounts WHERE id = v_new_id;

    RETURN jsonb_build_object('success', true, 'user', v_user_obj, 'message', 'Registration successful! Signed in as ' || UPPER(v_ref.target_role) || '.');
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_register_with_referral(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_register_with_referral(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_rymon_send_broadcast(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.rpc_rymon_send_broadcast(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT);
CREATE OR REPLACE FUNCTION public.rpc_rymon_send_broadcast(
    p_sender TEXT,
    p_recipient TEXT,
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'INFO',
    p_is_pinned BOOLEAN DEFAULT false,
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_new_id BIGINT;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_sender);
    IF v_actor.id IS NULL OR v_actor.role NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    INSERT INTO public.rymon_notifications (sender, recipient, title, message, type, is_pinned, created_at)
    VALUES (v_actor.username, COALESCE(p_recipient, 'ALL'), p_title, p_message, COALESCE(p_type, 'INFO'), COALESCE(p_is_pinned, false), now())
    RETURNING id INTO v_new_id;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Broadcast Message Sent: ' || p_title, 'COMMUNICATION_BROADCAST', 'Target: ' || p_recipient, v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'notification_id', v_new_id);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_send_broadcast(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_send_broadcast(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_rymon_purge_expired_keys(
    p_days_retention INT DEFAULT 60,
    p_actor_username TEXT DEFAULT 'debajoyti',
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_days INT := GREATEST(1, COALESCE(p_days_retention, 60));
    v_cutoff TIMESTAMPTZ := now() - (v_days || ' days')::INTERVAL;
    v_del_keys INT := 0;
    v_del_ctrls INT := 0;
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, p_actor_username);
    IF v_actor.id IS NULL OR (v_actor.role != 'owner' AND LOWER(v_actor.username) != 'debajoyti') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Owner access required.');
    END IF;

    DELETE FROM public.rymon_licenses
    WHERE status = 'EXPIRED' AND expires_at IS NOT NULL AND expires_at < v_cutoff;
    GET DIAGNOSTICS v_del_keys = ROW_COUNT;

    DELETE FROM public.rymon_streamer_controls c
    WHERE NOT EXISTS (SELECT 1 FROM public.rymon_licenses l WHERE l.license_key = c.license_key);
    GET DIAGNOSTICS v_del_ctrls = ROW_COUNT;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES ('Retention Purge', 'CLEANUP', 'Purged ' || v_del_keys || ' expired key(s) & ' || v_del_ctrls || ' orphaned controls', v_actor.username, 'SUCCESS');

    RETURN jsonb_build_object('success', true, 'deleted_keys_count', v_del_keys, 'deleted_controls_count', v_del_ctrls, 'cutoff_timestamp', v_cutoff);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_purge_expired_keys(INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_purge_expired_keys(INT, TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_rymon_set_system_config(
    p_key TEXT,
    p_value JSONB,
    p_session_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor public.rymon_accounts%ROWTYPE;
    v_clean_key TEXT := TRIM(COALESCE(p_key, ''));
BEGIN
    v_actor := public.fn_rymon_resolve_session(p_session_token, '');
    IF v_actor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'auth_error', true, 'error', 'Unauthorized');
    END IF;

    IF v_clean_key IN ('global_key_prices', 'sovereign_security_policy', 'registered_apps', 'site_branding') THEN
        IF LOWER(v_actor.username) != 'debajoyti' AND v_actor.role != 'owner' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Owner access required for ' || v_clean_key);
        END IF;
    ELSIF v_clean_key IN ('user_custom_prices', 'paused_key_timestamps', 'referral_subscription_days', 'hwid_reset_daily_log') THEN
        IF v_actor.role NOT IN ('owner', 'admin', 'reseller') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Staff access required.');
        END IF;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden configuration key: ' || v_clean_key);
    END IF;

    INSERT INTO public.rymon_system_config (key, value, updated_at)
    VALUES (v_clean_key, p_value, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_set_system_config(TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_set_system_config(TEXT, JSONB, TEXT) TO anon, authenticated, service_role;

-- 11. Lock down payment crediting & internal direct account registration to service_role ONLY
DO $$
BEGIN
  IF to_regprocedure('public.rpc_rymon_credit_payment(text,text,numeric,text,text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rpc_rymon_credit_payment(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rpc_rymon_credit_payment(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO service_role';
  END IF;
  IF to_regprocedure('public.rpc_rymon_register_account(text,text,text,text,numeric,text,text,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rpc_rymon_register_account(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rpc_rymon_register_account(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, INT) TO service_role';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_rymon_increment_apk_downloads(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.rymon_apk_releases') IS NOT NULL THEN
    EXECUTE 'UPDATE public.rymon_apk_releases SET downloads_count = COALESCE(downloads_count, 0) + 1 WHERE id::text = $1' USING p_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_rymon_increment_apk_downloads(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_increment_apk_downloads(text) TO anon, authenticated, service_role;
