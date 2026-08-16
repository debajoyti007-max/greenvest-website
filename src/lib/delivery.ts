import type { DeliveryZone as DbDeliveryZone } from '../types'

export const STORE_LOCATION = {
  name: 'CHITRAVAS',
  nameBn: 'চিত্রাবাস',
  address: 'CHITRAVAS, Sutahata - Mahishadal Road, Purba Medinipur, PIN 721632',
  addressBn: 'চিত্রাবাস, সুতাহাটা - মহিষাদল রোড, পূর্ব মেদিনীপুর, পিন ৭২১৬৩২',
  lat: 22.1723059,
  lng: 87.8677517,
  mapsUrl: 'https://maps.app.goo.gl/zjHaYvddzvXjHkap6',
  pin: '721632',
  phone: '8170859653',
  hours: '7:00 AM – 9:00 PM',
  hoursBn: 'সকাল ৭:০০ – রাত ৯:০০',
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

/** Known PIN distances from CHITRAVAS Hub (22.1723, 87.8677) */
const PIN_DISTANCE_MAP: Record<string, number> = {
  '721632': 2.0,  // Sutahata / Chaitanyapur (< 5km)
  '721633': 4.5,  // Mahishadal (< 5km)
  '721654': 8.5,  // Geonkhali (5-15km)
  '721657': 11.0, // Kukrahati (5-15km)
  '721607': 10.0, // Durgachak / Haldia (5-15km)
  '721658': 13.0, // Barda / Bhabanipur (5-15km)
  '721606': 16.5, // Haldia Township (> 15km)
  '721631': 17.5, // Nandakumar (> 15km)
  '721636': 19.0, // Tamluk Town (> 15km)
  '721656': 20.0, // Nandigram (> 15km)
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
      noticeEn: 'Self-Pickup from CHITRAVAS Store (₹0 Delivery Charge)',
      noticeBn: 'সরাসরি চিত্রাবাস দোকান থেকে সংগ্রহ (₹০ ডেলিভারি চার্জ)',
    }
  }

  // Calculate distance
  let distanceKm: number | undefined
  if (coordsOrZones && typeof coordsOrZones === 'object' && !Array.isArray(coordsOrZones) && 'lat' in coordsOrZones && 'lng' in coordsOrZones) {
    distanceKm = calculateDistanceKm(STORE_LOCATION.lat, STORE_LOCATION.lng, coordsOrZones.lat, coordsOrZones.lng)
  } else if (pin) {
    const cleanPin = pin.replace(/\D/g, '')
    if (cleanPin in PIN_DISTANCE_MAP) {
      distanceKm = PIN_DISTANCE_MAP[cleanPin]
    } else if (cleanPin.startsWith('7216')) {
      distanceKm = 4.0 // default local Purba Medinipur
    } else {
      distanceKm = 18.0 // outer region
    }
  } else {
    distanceKm = 3.0 // default local
  }

  // 1. Under 5 km -> ₹30
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

  // 2. 5 km to 15 km -> ₹50
  if (distanceKm <= 15) {
    return {
      fee: 50,
      zone: 'Standard (5–15 km)',
      distanceKm,
      isPickup: false,
      isOutOfRange: false,
      noticeEn: `Delivery 5–15 km: ₹50 (~${distanceKm} km)`,
      noticeBn: `৫ থেকে ১৫ কিমির মধ্যে ডেলিভারি চার্জ: ₹৫০ (~${distanceKm} কিমি)`,
    }
  }

  // 3. Beyond 15 km -> Out of delivery range (Max 15 km limit)
  return {
    fee: 50,
    zone: 'Out of Range (>15 km)',
    distanceKm,
    isPickup: false,
    isOutOfRange: true,
    noticeEn: `Distance is ${distanceKm} km. Maximum fresh home delivery limit is 15 km. Please select "Store Pickup" or contact on WhatsApp.`,
    noticeBn: `দূরত্ব ${distanceKm} কিমি। সর্বোচ্চ ১৫ কিমির মধ্যে হোম ডেলিভারি প্রযোজ্য। অনুগ্রহ করে "দোকান থেকে সংগ্রহ" বেছে নিন বা WhatsApp-এ যোগাযোগ করুন।`,
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
