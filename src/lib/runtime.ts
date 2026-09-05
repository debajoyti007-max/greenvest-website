import { isSupabaseConfigured } from './supabase'

/** True if running in production without Supabase configuration. */
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
