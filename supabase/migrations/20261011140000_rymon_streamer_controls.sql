-- ==============================================================================
-- RYMON STREAMER GHOST CONNECT - SUPABASE DATABASE SCHEMA
-- Isolated table for Realtime Web Controller, License Management & Device Telemetry
-- ==============================================================================

-- 1. Create the controls & telemetry table
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

-- 2. Enable Row-Level Security (RLS) but allow authenticated & public anon operations
ALTER TABLE public.rymon_streamer_controls ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'rymon_streamer_controls' AND policyname = 'Allow public read access for streamer controls'
    ) THEN
        CREATE POLICY "Allow public read access for streamer controls"
            ON public.rymon_streamer_controls
            FOR SELECT
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'rymon_streamer_controls' AND policyname = 'Allow public insert/update for streamer controls'
    ) THEN
        CREATE POLICY "Allow public insert/update for streamer controls"
            ON public.rymon_streamer_controls
            FOR ALL
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- 3. Enable Realtime WebSocket broadcast on this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.rymon_streamer_controls;

-- 4. Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION public.set_rymon_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_rymon_updated_at ON public.rymon_streamer_controls;
CREATE TRIGGER trigger_rymon_updated_at
    BEFORE UPDATE ON public.rymon_streamer_controls
    FOR EACH ROW
    EXECUTE FUNCTION public.set_rymon_updated_at();

-- 5. Seed default demo/master account for immediate testing
INSERT INTO public.rymon_streamer_controls (
    license_key, streamer_name, game_name, is_active, is_online, 
    aim_silent, hit_rate, esp_box, esp_skeleton, theme_color_index
) VALUES (
    'RYMON-MASTER-KEY', 'Rymon Owner', 'Free Fire MAX', true, true,
    false, 85, true, true, 0
) ON CONFLICT (license_key) DO NOTHING;
