import { getActiveUserPin, storePin } from './storage'
import type { User } from '../types'

/** Staff gateway credentials passed to secured Supabase RPCs. */
export type StaffCredentials = {
  callerId: string
  callerPin: string
}

/** Prompts the user for their PIN/password if missing from storage. */
export function promptForStaffPin(user: User): string | null {
  if (typeof window === 'undefined') return null
  const isStaff = user.role === 'admin' || user.role === 'seller' || user.role === 'rider' || user.isSuperAdmin
  const promptMsg = isStaff
    ? 'Security Verification: Please enter your staff password / PIN to authorize this administrative action:'
    : 'Security Verification: Please enter your 4-digit PIN to authorize this action:'
  const entered = window.prompt(promptMsg, '')
  if (entered && entered.trim().length >= 4) {
    const clean = entered.trim()
    storePin(user.id, clean)
    if (user.email) storePin(user.email, clean)
    if (user.phone) storePin(user.phone, clean)
    return clean
  }
  return null
}

export function getStaffCredentials(user: User | null | undefined, allowPrompt = false): StaffCredentials | null {
  if (!user?.id) return null
  let callerPin = getActiveUserPin(user)
  if (!callerPin && allowPrompt) {
    callerPin = promptForStaffPin(user) || ''
  }
  if (callerPin) {
    return { callerId: user.id, callerPin }
  }

  // If user is authenticated staff, pass empty callerPin so PostgreSQL can authenticate via Supabase Auth session (auth.uid())
  const isStaff = user.role === 'admin' || user.role === 'seller' || user.role === 'rider' || user.isSuperAdmin
  if (isStaff) {
    return { callerId: user.id, callerPin: '' }
  }
  return null
}

export function requireStaffCredentials(user: User | null | undefined): StaffCredentials {
  const creds = getStaffCredentials(user, true)
  if (!creds) {
    throw new Error('Staff authentication required. Please sign in or enter your staff password.')
  }
  return creds
}

