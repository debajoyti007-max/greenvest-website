import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_URL = 'https://zvjqpigduyvczidzafus.supabase.co'
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2anFwaWdkdXl2Y3ppZHphZnVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxOTYzNjAsImV4cCI6MjEwMTc3MjM2MH0.jQjWuhoPsHAYuTAVPl-CWlXLfCmlI0aEny18XsEBpEo'

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
