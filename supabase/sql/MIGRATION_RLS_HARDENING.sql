-- ==============================================================================
-- RYMON SOVEREIGN SECURITY HARDENING: RLS & COLUMN-LEVEL ACCESS CONTROL
-- ==============================================================================
-- Project: Supabase zvjqpigduyvczidzafus
-- Purpose:
-- 1. Protect rymon_accounts: completely revoke direct SELECT/INSERT/UPDATE/DELETE from anon.
-- 2. Seal password_hash: never exposed to any public client.
-- 3. Provide SECURITY DEFINER RPCs for all safe web console operations.
-- 4. Keep rymon_streamer_controls fully open for zero-latency APK live game controls.
-- 5. Secure rymon_telegram_config from public scraping.
-- ==============================================================================

-- 1. RPC: Safe Account Retrieval (Does NOT return password_hash)
CREATE OR REPLACE FUNCTION public.rpc_rymon_get_accounts()
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
    permissions JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id, username, email, role, balance, uplink, referral_code, status, expires_at, permissions, created_at, updated_at
    FROM public.rymon_accounts
    ORDER BY balance DESC;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_get_accounts() TO anon, authenticated;

-- 2. RPC: Single Account Lookup (Does NOT return password_hash)
CREATE OR REPLACE FUNCTION public.rpc_rymon_get_account(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_acc public.rymon_accounts%ROWTYPE;
BEGIN
    SELECT * INTO v_acc
    FROM public.rymon_accounts
    WHERE LOWER(username) = LOWER(TRIM(p_username));

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
GRANT EXECUTE ON FUNCTION public.rpc_rymon_get_account(TEXT) TO anon, authenticated;

-- 3. RPC: Safe Password Update
CREATE OR REPLACE FUNCTION public.rpc_rymon_update_password(
    p_username TEXT,
    p_new_password TEXT,
    p_actor_username TEXT DEFAULT 'debajoyti'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.rymon_accounts
    SET password_hash = TRIM(p_new_password),
        updated_at = now()
    WHERE LOWER(username) = LOWER(TRIM(p_username));

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Password Updated',
        'PASSWORD_RESET',
        'Updated password for ' || p_username,
        p_actor_username,
        'SUCCESS'
    );

    RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_update_password(TEXT, TEXT, TEXT) TO anon, authenticated;

-- 4. RPC: Subscription Renewal
CREATE OR REPLACE FUNCTION public.rpc_rymon_renew_subscription(
    p_target_username TEXT,
    p_days INT,
    p_actor_username TEXT DEFAULT 'debajoyti'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target public.rymon_accounts%ROWTYPE;
    v_new_exp TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_target
    FROM public.rymon_accounts
    WHERE LOWER(username) = LOWER(TRIM(p_target_username));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
    END IF;

    v_new_exp := now() + (p_days || ' days')::INTERVAL;

    UPDATE public.rymon_accounts
    SET expires_at = v_new_exp,
        status = 'ACTIVE',
        updated_at = now()
    WHERE id = v_target.id;

    UPDATE public.rymon_licenses
    SET is_paused = false, status = 'ACTIVE', updated_at = now()
    WHERE LOWER(creator_username) = LOWER(v_target.username) AND status = 'PAUSED';

    UPDATE public.rymon_streamer_controls
    SET is_paused = false, updated_at = now()
    WHERE LOWER(creator) = LOWER(v_target.username);

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Subscription Renewed',
        'MODERATION',
        'Renewed ' || v_target.username || ' for ' || p_days || ' days',
        p_actor_username,
        'SUCCESS'
    );

    RETURN jsonb_build_object('success', true, 'expires_at', v_new_exp);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_renew_subscription(TEXT, INT, TEXT) TO anon, authenticated;

-- 5. RPC: Account Registration with Referral Code
CREATE OR REPLACE FUNCTION public.rpc_rymon_register_account(
    p_username TEXT,
    p_password TEXT,
    p_email TEXT,
    p_role TEXT,
    p_initial_balance NUMERIC,
    p_uplink TEXT,
    p_referral_code TEXT,
    p_subscription_days INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_id UUID := gen_random_uuid();
    v_exp TIMESTAMPTZ := now() + (COALESCE(p_subscription_days, 30) || ' days')::INTERVAL;
BEGIN
    IF EXISTS (SELECT 1 FROM public.rymon_accounts WHERE LOWER(username) = LOWER(TRIM(p_username))) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Username already taken');
    END IF;

    INSERT INTO public.rymon_accounts (
        id, username, password_hash, email, role, balance, uplink, referral_code, status, expires_at
    ) VALUES (
        v_new_id, LOWER(TRIM(p_username)), TRIM(p_password), p_email, p_role, COALESCE(p_initial_balance, 0), p_uplink, p_referral_code, 'ACTIVE', v_exp
    );

    IF p_referral_code IS NOT NULL AND p_referral_code != '' THEN
        UPDATE public.rymon_referrals
        SET used_count = used_count + 1, updated_at = now()
        WHERE code = p_referral_code;
    END IF;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Account Registered',
        'REGISTRATION',
        'Registered ' || p_role || ' account: ' || p_username,
        p_username,
        'SUCCESS'
    );

    RETURN jsonb_build_object('success', true, 'id', v_new_id, 'username', p_username);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_register_account(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, INT) TO anon, authenticated;

-- 6. RPC: Update Account Permissions
CREATE OR REPLACE FUNCTION public.rpc_rymon_update_permissions(
    p_username TEXT,
    p_permissions JSONB,
    p_actor_username TEXT DEFAULT 'debajoyti'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.rymon_accounts
    SET permissions = p_permissions,
        updated_at = now()
    WHERE LOWER(username) = LOWER(TRIM(p_username));

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Permissions Updated',
        'MODERATION',
        'Updated permissions for ' || p_username,
        p_actor_username,
        'SUCCESS'
    );

    RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_rymon_update_permissions(TEXT, JSONB, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. HARDEN RLS & REVOKE DIRECT ACCESS ON SENSITIVE TABLES
-- ------------------------------------------------------------------------------

-- rymon_accounts: Full lock against anon / unauthenticated scraping
ALTER TABLE public.rymon_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rymon_accounts_all" ON public.rymon_accounts;
REVOKE ALL ON public.rymon_accounts FROM anon, authenticated, public;
GRANT ALL ON public.rymon_accounts TO service_role;

-- rymon_telegram_config: Full lock (protect Telegram bot token)
ALTER TABLE public.rymon_telegram_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access to rymon_telegram_config" ON public.rymon_telegram_config;
REVOKE ALL ON public.rymon_telegram_config FROM anon, authenticated, public;
GRANT ALL ON public.rymon_telegram_config TO service_role;

-- rymon_streamer_controls: Keep accessible for live game ESP & Aim sync
ALTER TABLE public.rymon_streamer_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rymon_streamer_controls_all" ON public.rymon_streamer_controls;
CREATE POLICY "rymon_streamer_controls_all" ON public.rymon_streamer_controls
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);
GRANT ALL ON public.rymon_streamer_controls TO anon, authenticated, service_role;

-- rymon_licenses: Keep accessible for web dashboard operations
ALTER TABLE public.rymon_licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rymon_licenses_all" ON public.rymon_licenses;
CREATE POLICY "rymon_licenses_all" ON public.rymon_licenses
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);
GRANT ALL ON public.rymon_licenses TO anon, authenticated, service_role;

-- rymon_activities: Keep accessible for activity log
ALTER TABLE public.rymon_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rymon_activities_all" ON public.rymon_activities;
CREATE POLICY "rymon_activities_all" ON public.rymon_activities
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);
GRANT ALL ON public.rymon_activities TO anon, authenticated, service_role;
