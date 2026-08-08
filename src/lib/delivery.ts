/** Simple demo delivery zones by PIN prefix (West Bengal style). */
export function calcDeliveryFee(pin: string): { fee: number; zone: string } {
  const clean = pin.replace(/\D/g, '')
  if (clean.length < 3) {
    return { fee: 40, zone: 'Standard' }
  }
  // Local Nandakumar / nearby demo PINs
  if (clean.startsWith('721') || clean.startsWith('700')) {
    return { fee: 30, zone: 'Local' }
  }
  if (clean.startsWith('71') || clean.startsWith('72')) {
    return { fee: 50, zone: 'Nearby' }
  }
  return { fee: 80, zone: 'Far' }
}

export const SELLER_WHATSAPP = '919999999999' // replace with real business number later
