import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''

export const isSupabaseConfigured = Boolean(
  url &&
    anonKey &&
    !url.includes('YOUR_PROJECT') &&
    anonKey !== 'YOUR_ANON_PUBLIC_KEY' &&
    url.startsWith('http'),
)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null

export const SUPABASE_URL = url
export const SUPABASE_ANON_KEY = anonKey
