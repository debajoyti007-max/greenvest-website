import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(
  url &&
    anonKey &&
    !url.includes('YOUR_PROJECT') &&
    anonKey !== 'YOUR_ANON_PUBLIC_KEY' &&
    url.startsWith('http'),
)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null

