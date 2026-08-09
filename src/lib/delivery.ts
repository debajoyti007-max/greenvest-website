import type { DeliveryZone as DbDeliveryZone } from '../types'

/** Delivery zones by PIN prefix (West Bengal). */
export type DeliveryZone = 'local' | 'nearby' | 'far' | 'standard'

export function calcDeliveryFee(pin: string, zones?: DbDeliveryZone[]): { fee: number; zone: DeliveryZone | string } {
  const p = pin.replace(/\D/g, '')
  
  if (zones && zones.length > 0) {
    const sortedZones = [...zones].sort((a, b) => b.pin_prefix.length - a.pin_prefix.length)
    const match = sortedZones.find(z => p.startsWith(z.pin_prefix))
    if (match) {
      return { fee: match.fee, zone: match.zone }
    }
  }

  if (p.length < 3) return { fee: 40, zone: 'standard' }
  // Local Nandakumar / nearby PINs
  if (p.startsWith('72163')) return { fee: 30, zone: 'local' }
  if (p.startsWith('7216') || p.startsWith('7211')) return { fee: 50, zone: 'nearby' }
  if (p.startsWith('721') || p.startsWith('700') || p.startsWith('711')) return { fee: 50, zone: 'nearby' }
  if (p.startsWith('71') || p.startsWith('72')) return { fee: 50, zone: 'nearby' }
  if (p.length >= 6) return { fee: 80, zone: 'far' }
  return { fee: 50, zone: 'standard' }
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

  let eveningCountdown;
  if (eveningAvailable) {
    const minLeft = (13 * 60) - (hour * 60 + minute);
    if (minLeft > 0 && minLeft <= 4 * 60) {
      const h = Math.floor(minLeft / 60);
      const m = minLeft % 60;
      eveningCountdown = h > 0 ? `${h}h ${m}m left` : `${m}m left`;
    }
  }

  // Morning slot cut-off is 10:00 PM (22:00) for next morning, or morning hours
  const morningAvailable = hour < 22
  const morningNotice = hour >= 22 ? 'Closed for tomorrow morning (Order before 10 PM)' : undefined

  let morningCountdown;
  if (morningAvailable) {
    const minLeft = (22 * 60) - (hour * 60 + minute);
    if (minLeft > 0 && minLeft <= 4 * 60) {
      const h = Math.floor(minLeft / 60);
      const m = minLeft % 60;
      morningCountdown = h > 0 ? `${h}h ${m}m left` : `${m}m left`;
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
