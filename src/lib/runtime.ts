import { isSupabaseConfigured } from './supabase'
import { ALLOW_LOCAL_FALLBACK } from './business'

/** Production requires Supabase; local fallback only in `npm run dev`. */
export function mustUseCloud(): boolean {
  return isSupabaseConfigured
}

export function canUseLocalFallback(): boolean {
  return ALLOW_LOCAL_FALLBACK && !isSupabaseConfigured
}

export function isProductionMisconfigured(): boolean {
  return !import.meta.env.DEV && !isSupabaseConfigured
}
