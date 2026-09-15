import type { SupportMessage } from '../types'

interface SystemAlertParams {
  type: '404' | 'CRASH' | 'API_ERROR'
  path?: string
  details?: string
  error?: Error | null
}

export async function reportSystemAlert(params: SystemAlertParams): Promise<SupportMessage | null> {
  // Console logging only; never pollute customer support tickets with client telemetry
  if (params.error) {
    console.error(`[SystemAlert:${params.type}]`, params.details || '', params.error)
  } else {
    console.warn(`[SystemAlert:${params.type}]`, params.details || '')
  }
  return null
}
