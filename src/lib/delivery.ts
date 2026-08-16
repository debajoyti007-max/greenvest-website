import type { DeliveryZone as DbDeliveryZone } from '../types'

/** Delivery zones by PIN prefix (West Bengal). */
export type DeliveryZone = 'local' | 'nearby' | 'far' | 'standard'

export function calcDeliveryFee(_pin?: string, _zones?: DbDeliveryZone[]): { fee: number; zone: DeliveryZone | string } {
  // Free delivery across all service areas; PIN code is used strictly for address verification & routing
  return { fee: 0, zone: 'Free Delivery' }
}

export function isValidPinCode(pin?: string): boolean {
  if (!pin) return false
  const cleaned = pin.replace(/\D/g, '')
  return cleaned.length === 6
}

export function getSlotCutoffStatus(): {
  morningAvailable: boolean
  eveningAvailable: boolean
  morningNotice?: string
  eveningNotice?: string
  morningCountdown?: string
  eveningCountdown?: string
} {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()

  // Evening slot cut-off is 1:00 PM (13:00)
  const eveningAvailable = hour < 13
  const eveningNotice = hour >= 13 ? 'Closed for today (Order before 1 PM for same-day evening)' : undefined

  let eveningCountdown: string | undefined
  if (eveningAvailable) {
    const minLeft = (13 * 60) - (hour * 60 + minute)
    if (minLeft > 0) {
      const h = Math.floor(minLeft / 60)
      const m = minLeft % 60
      eveningCountdown = h > 0 ? `${h}h ${m}m left` : `${m}m left`
    }
  }

  // Morning slot cut-off is 10:00 PM (22:00) for next morning delivery
  const morningAvailable = hour < 22
  const morningNotice = hour >= 22 ? 'Closed for tomorrow morning (Order before 10 PM)' : undefined

  let morningCountdown: string | undefined
  if (morningAvailable) {
    const minLeft = (22 * 60) - (hour * 60 + minute)
    if (minLeft > 0) {
      const h = Math.floor(minLeft / 60)
      const m = minLeft % 60
      morningCountdown = h > 0 ? `${h}h ${m}m left` : `${m}m left`
    }
  }

  return {
    morningAvailable,
    eveningAvailable,
    morningNotice,
    eveningNotice,
    morningCountdown,
    eveningCountdown,
  }
}
