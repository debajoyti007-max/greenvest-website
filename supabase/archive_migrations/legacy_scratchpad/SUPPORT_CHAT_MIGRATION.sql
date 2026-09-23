-- ================================================================
-- GREENVEST — IN-APP CUSTOMER SUPPORT & LIVE CHAT (FREE TIER SAFE)
-- Run this in Supabase Dashboard -> SQL Editor -> Run
-- ================================================================

-- 1. Create support_messages table
CREATE TABLE IF NOT EXISTS public.support_messages (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  user_name text NOT NULL,
  user_phone text,
  sender_role text NOT NULL DEFAULT 'customer',
  message text NOT NULL,
  order_id text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);

-- 2. Index for fast loading by user
CREATE INDEX IF NOT EXISTS idx_support_messages_user_id ON public.support_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created ON public.support_messages(created_at DESC);

-- 3. Row Level Security: Unrestricted for anon/authenticated
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support_messages_all_access" ON public.support_messages;
CREATE POLICY "support_messages_all_access" ON public.support_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. Enable Realtime on support_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
END $$;

-- 5. Auto-clean messages older than 30 days to keep Supabase Free Tier at < 1% usage
DELETE FROM public.support_messages WHERE created_at < now() - interval '30 days';
