import { getStoredSupportMessages, saveStoredSupportMessages, getSessionUserId, getUsers } from './storage'
import { sendSupportMessageApi } from './api'
import { isSupabaseConfigured } from './supabase'
import type { SupportMessage } from '../types'

interface SystemAlertParams {
  type: '404' | 'CRASH' | 'API_ERROR'
  path?: string
  details?: string
  error?: Error | null
}

const recentAlerts = new Set<string>()

export async function reportSystemAlert(params: SystemAlertParams): Promise<SupportMessage | null> {
  const currentPath = params.path || (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/')
  const alertKey = `${params.type}:${currentPath}:${params.details || params.error?.message || ''}`

  // Throttle duplicate alerts in a short window
  if (recentAlerts.has(alertKey)) {
    return null
  }
  recentAlerts.add(alertKey)
  setTimeout(() => {
    recentAlerts.delete(alertKey)
  }, 10000)

  // Find active user if logged in
  let currentUserId = 'guest'
  let currentUserName = 'Guest Visitor'
  let currentUserPhone: string | undefined

  try {
    const sessionUid = getSessionUserId()
    if (sessionUid) {
      const users = getUsers()
      const found = users.find((u) => u.id === sessionUid)
      if (found) {
        currentUserId = found.id
        currentUserName = found.name
        currentUserPhone = found.phone
      } else {
        currentUserId = sessionUid
      }
    }
  } catch {
    // fallback to guest
  }

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown Device'
  const screenInfo = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A'
  const timeString = new Date().toLocaleTimeString('en-IN')

  let formattedDetails = ''
  if (params.type === '404') {
    formattedDetails = `[SYSTEM ALERT: 404 Not Found]\nPath: ${currentPath}\nDevice: ${userAgent.slice(0, 80)}\nScreen: ${screenInfo}\nTime: ${timeString}`
  } else if (params.type === 'CRASH') {
    const errText = params.error ? `${params.error.message}\n${params.error.stack || ''}` : params.details || 'Unknown runtime crash'
    formattedDetails = `[SYSTEM ALERT: APP CRASH]\nPath: ${currentPath}\nError: ${errText.slice(0, 300)}\nDevice: ${userAgent.slice(0, 80)}\nTime: ${timeString}`
  } else {
    formattedDetails = `[SYSTEM ALERT: ${params.type}]\nPath: ${currentPath}\nDetails: ${params.details || ''}\nTime: ${timeString}`
  }

  const newMsg: SupportMessage = {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: currentUserId,
    userName: currentUserName,
    userPhone: currentUserPhone,
    senderRole: 'bot',
    status: 'open',
    message: formattedDetails,
    createdAt: new Date().toISOString(),
  }

  try {
    const existing = getStoredSupportMessages()
    const next = [...existing, newMsg]
    saveStoredSupportMessages(next)
  } catch (err) {
    console.warn('Failed to save alert locally', err)
  }

  if (isSupabaseConfigured) {
    try {
      await sendSupportMessageApi(newMsg)
    } catch (err) {
      console.warn('Failed to dispatch system alert to Supabase', err)
    }
  }

  return newMsg
}
