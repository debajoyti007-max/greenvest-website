-- Migration: 20261018130000_referrals_and_owner_sync.sql
-- Description: Sovereign Referral Engine (30D/60D sub support) & Sovereign Co-Owner Sync with Root Protections

-- 1. Ensure schema support for subscription duration on rymon_referrals
ALTER TABLE public.rymon_referrals 
  ADD COLUMN IF NOT EXISTS subscription_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_rymon_referrals_code ON public.rymon_referrals(code);
CREATE INDEX IF NOT EXISTS idx_rymon_accounts_role ON public.rymon_accounts(role);

-- 2. Ensure RYZEN & debajoyti Sovereign Owner role hierarchy
UPDATE public.rymon_accounts
SET role = 'owner',
    uplink = 'debajoyti',
    status = 'ACTIVE',
    updated_at = now()
WHERE LOWER(username) = 'ryzen';

UPDATE public.rymon_accounts
SET role = 'owner',
    uplink = 'SOVEREIGN_ROOT',
    status = 'ACTIVE',
    updated_at = now()
WHERE LOWER(username) = 'debajoyti';

-- 3. Create or Replace Sovereign Referral Creation RPC
CREATE OR REPLACE FUNCTION public.rpc_rymon_create_referral(
    p_code text,
    p_target_role text,
    p_initial_balance numeric,
    p_max_uses integer,
    p_subscription_days integer DEFAULT 30,
    p_actor_username text DEFAULT 'debajoyti',
    p_actor_password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_clean_code TEXT := UPPER(TRIM(p_code));
    v_clean_role TEXT := LOWER(TRIM(p_target_role));
    v_clean_actor TEXT := TRIM(p_actor_username);
    v_actor public.rymon_accounts%ROWTYPE;
    v_sub_days INTEGER := CASE WHEN p_subscription_days = 60 THEN 60 ELSE 30 END;
    v_total_cost NUMERIC;
    v_new_ref public.rymon_referrals%ROWTYPE;
BEGIN
    IF v_clean_code IS NULL OR LENGTH(v_clean_code) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral code must be at least 3 characters');
    END IF;

    IF v_clean_role NOT IN ('admin', 'reseller') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target role must be admin or reseller');
    END IF;

    SELECT * INTO v_actor FROM public.rymon_accounts WHERE LOWER(username) = LOWER(v_clean_actor);
    IF v_actor IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Actor not found');
    END IF;

    -- Owner Authority Check: Both debajoyti and ryzen (and any Owner) can issue Admin invite codes
    IF v_clean_role = 'admin' AND v_actor.role != 'owner' AND LOWER(v_actor.username) NOT IN ('debajoyti', 'ryzen') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Power restriction: Only Owners (debajoyti & ryzen) can issue Admin invite codes.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.rymon_referrals WHERE code = v_clean_code) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral code already exists');
    END IF;

    -- Balance deduction (Owners mint for free)
    IF v_actor.role NOT IN ('owner') THEN
        v_total_cost := COALESCE(p_initial_balance, 0) * COALESCE(p_max_uses, 1);
        IF COALESCE(v_actor.balance, 0) < v_total_cost THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance to fund this referral code.');
        END IF;

        UPDATE public.rymon_accounts
        SET balance = balance - v_total_cost,
            updated_at = now()
        WHERE id = v_actor.id;
    END IF;

    INSERT INTO public.rymon_referrals (
        code, target_role, initial_balance, max_uses, subscription_days, times_used, is_active, created_by, created_at, updated_at
    )
    VALUES (
        v_clean_code,
        v_clean_role,
        COALESCE(p_initial_balance, 0),
        COALESCE(p_max_uses, 1),
        v_sub_days,
        0,
        true,
        v_actor.username,
        now(),
        now()
    )
    RETURNING * INTO v_new_ref;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'Referral Created',
        'REFERRAL_CREATE',
        'Referral code ' || v_clean_code || ' (' || v_clean_role || ', ' || v_sub_days || 'D) created by @' || v_actor.username,
        v_actor.username,
        'SUCCESS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'code', v_clean_code,
        'target_role', v_clean_role,
        'subscription_days', v_sub_days,
        'created_by', v_actor.username
    );
END;
$function$;

-- 4. Create or Replace Sovereign Referral Query RPC
CREATE OR REPLACE FUNCTION public.rpc_rymon_get_referrals(p_actor_username text DEFAULT 'debajoyti')
RETURNS TABLE (
    id bigint,
    code text,
    target_role text,
    initial_balance numeric,
    max_uses integer,
    times_used integer,
    is_active boolean,
    created_by text,
    created_at timestamptz,
    subscription_days integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_clean_actor TEXT := LOWER(TRIM(p_actor_username));
    v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM public.rymon_accounts WHERE LOWER(username) = v_clean_actor;

    IF v_clean_actor IN ('debajoyti', 'ryzen') OR v_role = 'owner' THEN
        RETURN QUERY
        SELECT r.id, r.code, r.target_role, r.initial_balance, r.max_uses, r.times_used, r.is_active, r.created_by, r.created_at, COALESCE(r.subscription_days, 30)
        FROM public.rymon_referrals r
        ORDER BY r.created_at DESC;
    ELSE
        RETURN QUERY
        SELECT r.id, r.code, r.target_role, r.initial_balance, r.max_uses, r.times_used, r.is_active, r.created_by, r.created_at, COALESCE(r.subscription_days, 30)
        FROM public.rymon_referrals r
        WHERE LOWER(r.created_by) = v_clean_actor
        ORDER BY r.created_at DESC;
    END IF;
END;
$function$;

-- 5. Create or Replace Sovereign Self-Service Registration RPC
CREATE OR REPLACE FUNCTION public.rpc_rymon_register_with_referral(
    p_username text,
    p_password text,
    p_email text,
    p_referral_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_clean_user TEXT := TRIM(p_username);
    v_clean_code TEXT := UPPER(TRIM(p_referral_code));
    v_clean_email TEXT;
    v_ref public.rymon_referrals%ROWTYPE;
    v_new_id UUID := gen_random_uuid();
    v_exp TIMESTAMPTZ;
    v_user_obj JSONB;
BEGIN
    IF v_clean_user IS NULL OR LENGTH(v_clean_user) < 3 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Username must be at least 3 characters');
    END IF;

    IF p_password IS NULL OR LENGTH(p_password) < 4 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Password must be at least 4 characters');
    END IF;

    IF LOWER(v_clean_user) IN ('debajoyti', 'rymon', 'root', 'admin', 'system') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Reserved username cannot be registered');
    END IF;

    IF EXISTS (SELECT 1 FROM public.rymon_accounts WHERE LOWER(username) = LOWER(v_clean_user)) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Username already taken. Please choose another.');
    END IF;

    SELECT * INTO v_ref FROM public.rymon_referrals 
    WHERE code = v_clean_code AND is_active = true;

    IF v_ref IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired referral code. Ask an owner or admin for a genuine invite code.');
    END IF;

    IF v_ref.times_used >= v_ref.max_uses THEN
        RETURN jsonb_build_object('success', false, 'message', 'This referral code has already reached its maximum usage limit.');
    END IF;

    v_clean_email := COALESCE(NULLIF(TRIM(p_email), ''), LOWER(v_clean_user) || '@rymon.vip');
    v_exp := now() + (COALESCE(v_ref.subscription_days, 30) || ' days')::INTERVAL;

    INSERT INTO public.rymon_accounts (
        id, username, password_hash, email, role, balance, uplink, referral_code, status, expires_at, permissions
    )
    VALUES (
        v_new_id,
        v_clean_user,
        p_password,
        v_clean_email,
        v_ref.target_role,
        v_ref.initial_balance,
        v_ref.created_by,
        v_clean_code,
        'ACTIVE',
        v_exp,
        jsonb_build_object(
            'dashboard', true,
            'generate_key', true,
            'license_keys', true,
            'telegram_bot', false,
            'account_settings', true,
            'allow_custom_apps', false
        )
    );

    UPDATE public.rymon_referrals
    SET times_used = times_used + 1,
        is_active = CASE WHEN times_used + 1 >= max_uses THEN false ELSE true END,
        updated_at = now()
    WHERE id = v_ref.id;

    INSERT INTO public.rymon_activities (title, event_type, details, actor_username, status)
    VALUES (
        'New ' || UPPER(v_ref.target_role) || ' Registered (' || COALESCE(v_ref.subscription_days, 30) || 'D Sub)',
        'REFERRAL_REGISTER',
        '@' || v_clean_user || ' joined as ' || UPPER(v_ref.target_role) || ' (' || COALESCE(v_ref.subscription_days, 30) || ' Days Subscription) via code ' || v_clean_code || ' (Invited by @' || v_ref.created_by || ')',
        v_clean_user,
        'SUCCESS'
    );

    SELECT jsonb_build_object(
        'id', id,
        'username', username,
        'email', email,
        'role', role,
        'balance', balance,
        'uplink', uplink,
        'status', status,
        'expires_at', expires_at
    ) INTO v_user_obj
    FROM public.rymon_accounts
    WHERE id = v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'user', v_user_obj,
        'message', 'Registration successful! You are now signed in as ' || UPPER(v_ref.target_role) || '.'
    );
END;
$function$;
