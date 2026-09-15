import { getActiveUserPin } from './storage'
import type { User } from '../types'

/** Staff gateway credentials passed to secured Supabase RPCs. */
export type StaffCredentials = {
  callerId: string
  callerPin: string
}

export function getStaffCredentials(user: User | null | undefined): StaffCredentials | null {
  if (!user?.id) return null
  const callerPin = getActiveUserPin(user)
  if (!callerPin) return null
  return { callerId: user.id, callerPin }
}

export function requireStaffCredentials(user: User | null | undefined): StaffCredentials {
  const creds = getStaffCredentials(user)
  if (!creds) {
    throw new Error('Staff session expired. Please log out and sign in again with your PIN.')
  }
  return creds
}

/** Customer self-service credentials (same shape as staff gateway). */
export type CustomerCredentials = StaffCredentials

export function getCustomerCredentials(user: User | null | undefined): CustomerCredentials | null {
  return getStaffCredentials(user)
}

export function requireCustomerCredentials(user: User | null | undefined): CustomerCredentials {
  return requireStaffCredentials(user)
}
