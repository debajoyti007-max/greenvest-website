import type { DeliveryZone as DbDeliveryZone } from '../types'
import { SERVICEABLE_PINCODES } from './business'

export const STORE_LOCATION = {
  name: 'GreenVest Store',
  nameBn: 'গ্রীনভেস্ট স্টোর',
  address: 'GreenVest Store, Purba Medinipur, PIN 721648',
  addressBn: 'গ্রীনভেস্ট স্টোর, পূর্ব মেদিনীপুর, পিন: ৭২১৬৪৮',
  lat: 22.1746825,
  lng: 87.9106158,
  mapsUrl: 'https://maps.app.goo.gl/pdafSPpPPBymCDgDA',
  pin: '721648',
  phone: (import.meta.env.VITE_SUPPORT_PHONE ?? import.meta.env.VITE_SUPER_ADMIN_PHONE ?? '').replace(/\D/g, '').slice(-10),
  hours: '7:00 AM – 12:00 PM & 4:00 PM – 9:00 PM',
  hoursBn: 'সকাল ৭:০০ – ১২:০০ ও বিকাল ৪:০০ – রাত ৯:০০',
  maxDeliveryRadiusKm: 15,
}

/** Delivery zones by distance. */
export type DeliveryZone = 'local' | 'nearby' | 'far' | 'standard'

/** Haversine formula to compute great-circle distance between two points in km */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10 // 1 decimal place
}

/** Known PIN distances and delivery fees from Store Hub */
const PIN_DISTANCE_MAP: Record<string, { distanceKm: number; fee: number; name: string; nameBn: string }> = {
  '721632': { distanceKm: 3.5, fee: 30, name: 'Nandakumar', nameBn: 'নন্দকুমার' },
  '721633': { distanceKm: 4.2, fee: 30, name: 'Kumarchak / Narghat', nameBn: 'কুমারচক / নারঘাট' },
  '721643': { distanceKm: 4.8, fee: 30, name: 'Mahishadal Bazar', nameBn: 'মহিষাদল বাজার' },
}

export function isServiceablePin(pin?: string): boolean {
  if (!pin) return false
  const cleanPin = pin.replace(/\D/g, '')
  return (SERVICEABLE_PINCODES as readonly string[]).includes(cleanPin)
}

export interface DeliveryCalculationResult {
  fee: number
  zone: string
  distanceKm?: number
  isPickup?: boolean
  isOutOfRange?: boolean
  noticeEn?: string
  noticeBn?: string
}

export function calcDeliveryFee(
  pin?: string,
  coordsOrZones?: { lat: number; lng: number } | DbDeliveryZone[] | null,
  fulfillmentMode: 'delivery' | 'pickup' = 'delivery',
): DeliveryCalculationResult {
  // Store Pickup is always 100% Free (₹0)
  if (fulfillmentMode === 'pickup') {
    return {
      fee: 0,
      zone: 'Store Pickup',
      distanceKm: 0,
      isPickup: true,
      isOutOfRange: false,
      noticeEn: 'Self-Pickup from GreenVest Store (₹0 Delivery Charge)',
      noticeBn: 'সরাসরি গ্রীনভেস্ট দোকান থেকে সংগ্রহ (₹০ ডেলিভারি চার্জ)',
    }
  }

  const cleanPin = pin ? pin.replace(/\D/g, '') : ''

  // Strict check: if a PIN is entered and it is NOT in the 3 whitelisted PINs, reject delivery
  if (cleanPin.length === 6 && !isServiceablePin(cleanPin)) {
    return {
      fee: 0,
      zone: 'Unserviceable Area',
      distanceKm: 25,
      isPickup: false,
      isOutOfRange: true,
      noticeEn: `Delivery is currently available only in PIN codes: ${SERVICEABLE_PINCODES.join(', ')}. Please select Store Pickup or contact in-app support.`,
      noticeBn: `বর্তমানে হোম ডেলিভারি শুধুমাত্র ${SERVICEABLE_PINCODES.join(', ')} পিন কোডে চালু রয়েছে। অনুগ্রহ করে "দোকান থেকে সংগ্রহ" বেছে নিন বা ইন-অ্যাপ সাপোর্টে যোগাযোগ করুন।`,
    }
  }

  // Calculate distance
  let distanceKm: number | undefined
  if (coordsOrZones && typeof coordsOrZones === 'object' && !Array.isArray(coordsOrZones) && 'lat' in coordsOrZones && 'lng' in coordsOrZones) {
    distanceKm = calculateDistanceKm(STORE_LOCATION.lat, STORE_LOCATION.lng, coordsOrZones.lat, coordsOrZones.lng)
  } else if (cleanPin && cleanPin in PIN_DISTANCE_MAP) {
    distanceKm = PIN_DISTANCE_MAP[cleanPin].distanceKm
  } else {
    distanceKm = 3.5 // default local
  }

  // Whitelisted PIN fee logic
  if (cleanPin in PIN_DISTANCE_MAP) {
    const pinInfo = PIN_DISTANCE_MAP[cleanPin]
    return {
      fee: pinInfo.fee,
      zone: `${pinInfo.name} (${cleanPin})`,
      distanceKm: pinInfo.distanceKm,
      isPickup: false,
      isOutOfRange: false,
      noticeEn: `Delivery to ${pinInfo.name} (${cleanPin}): ₹${pinInfo.fee} (~${pinInfo.distanceKm} km)`,
      noticeBn: `${pinInfo.nameBn} (${cleanPin})-এ ডেলিভারি চার্জ: ₹${pinInfo.fee} (~${pinInfo.distanceKm} কিমি)`,
    }
  }

  // Under 5 km fallback for GPS
  if (distanceKm <= 5) {
    return {
      fee: 30,
      zone: 'Local (0–5 km)',
      distanceKm,
      isPickup: false,
      isOutOfRange: false,
      noticeEn: `Delivery within 5 km: ₹30 (~${distanceKm} km)`,
      noticeBn: `৫ কিমির মধ্যে ডেলিভারি চার্জ: ₹৩০ (~${distanceKm} কিমি)`,
    }
  }

  // Beyond serviceable boundary
  return {
    fee: 50,
    zone: 'Out of Delivery Area',
    distanceKm,
    isPickup: false,
    isOutOfRange: true,
    noticeEn: `Distance is ${distanceKm} km. Home delivery is restricted to PIN codes ${SERVICEABLE_PINCODES.join(', ')}.`,
    noticeBn: `দূরত্ব ${distanceKm} কিমি। হোম ডেলিভারি শুধুমাত্র ${SERVICEABLE_PINCODES.join(', ')} পিন কোডে সীমাবদ্ধ।`,
  }
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
