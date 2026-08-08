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
