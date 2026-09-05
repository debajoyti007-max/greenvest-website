/**
 * useAuth — dedicated hook file for AuthContext.
 *
 * Extracted from AuthContext.tsx so Vite Fast Refresh works correctly:
 * A file that exports both a Provider component AND a hook causes HMR
 * to do a full page reload on every save, losing all in-memory state.
 * This file exports only the hook, AuthContext.tsx exports only the Provider.
 */
import { useContext } from 'react'
import { AuthContext } from './AuthContext'

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
