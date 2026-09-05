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

/**
 * Returns true when the app should render the full-page SetupRequired screen.
 * Extracted here (not in SetupRequired.tsx) to satisfy React Fast Refresh —
 * non-component exports must not live alongside component definitions.
 */
export function shouldBlockApp(): boolean {
  return isProductionMisconfigured()
}
