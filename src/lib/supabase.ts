import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_URL = 'https://zvjqpigduyvczidzafus.supabase.co'
const DEFAULT_ANON_KEY = 'sb_publishable_sLfTUi9HAd2Nu9OAIYWGwQ_FjGYcoVR'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON_KEY

export const isSupabaseConfigured = Boolean(
  url &&
    anonKey &&
    !url.includes('YOUR_PROJECT') &&
    anonKey !== 'YOUR_ANON_PUBLIC_KEY' &&
    url.startsWith('http'),
)

export const supabase: SupabaseClient = createClient(url, anonKey)

