/**
 * useStore — dedicated hook file for StoreContext.
 *
 * Extracted from StoreContext.tsx so Vite Fast Refresh works correctly:
 * A file that exports both a Provider component AND a hook causes HMR
 * to do a full page reload on every save, losing all in-memory state.
 * This file exports only the hook, StoreContext.tsx exports only the Provider.
 */
import { useContext } from 'react'
import { StoreContext } from './StoreContext'

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
