/** Delivery zones by PIN prefix (West Bengal). */
export type DeliveryZone = 'local' | 'nearby' | 'far' | 'standard'

export function calcDeliveryFee(pin: string): { fee: number; zone: DeliveryZone } {
  const p = pin.replace(/\D/g, '')
  if (p.length < 3) return { fee: 40, zone: 'standard' }
  // Local Nandakumar / nearby PINs
  if (p.startsWith('7216') || p.startsWith('7211')) return { fee: 30, zone: 'local' }
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
} {
  const now = new Date()
  const hour = now.getHours()

  // Evening slot cut-off is 1:00 PM (13:00)
  const eveningAvailable = hour < 13
  const eveningNotice = hour >= 13 ? 'Closed for today (Order before 1 PM for same-day evening)' : undefined

  // Morning slot cut-off is 10:00 PM (22:00) for next morning, or morning hours
  const morningAvailable = hour < 22
  const morningNotice = hour >= 22 ? 'Closed for tomorrow morning (Order before 10 PM)' : undefined

  return {
    morningAvailable,
    eveningAvailable,
    morningNotice,
    eveningNotice,
  }
}
