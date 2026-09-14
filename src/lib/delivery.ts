import type { DeliveryZone as DbDeliveryZone } from '../types'
import { SERVICEABLE_PINCODES, SUPPORT_PHONE } from './business'

export const STORE_LOCATION = {
  name: 'MS Vegetable Center',
  nameBn: 'এম.এস ভেজিটেবল সেন্টার',
  address: 'MS Vegetable Center, Purba Medinipur, PIN 721648',
  addressBn: 'এম.এস ভেজিটেবল সেন্টার, পূর্ব মেদিনীপুর, পিন: ৭২১৬৪৮',
  lat: 22.1746825,
  lng: 87.9106158,
  mapsUrl: 'https://maps.app.goo.gl/pdafSPpPPBymCDgDA',
  pin: '721648',
  phone: (import.meta.env.VITE_SUPPORT_PHONE || SUPPORT_PHONE).replace(/\D/g, '').slice(-10),
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

/** Known PIN distances and delivery fees from Store Hub (pure PIN codes, zero town names) */
const PIN_DISTANCE_MAP: Record<string, { distanceKm: number; fee: number }> = {
  '721632': { distanceKm: 3.5, fee: 30 },
  '721633': { distanceKm: 4.2, fee: 30 },
  '721643': { distanceKm: 4.8, fee: 30 },
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
  _coordsOrZones?: { lat: number; lng: number } | DbDeliveryZone[] | null,
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
      noticeEn: 'Self-Pickup from MS Vegetable Center (₹0 Delivery Charge)',
      noticeBn: 'সরাসরি এম.এস ভেজিটেবল সেন্টার থেকে সংগ্রহ (₹০ ডেলিভারি চার্জ)',
    }
  }

  const cleanPin = pin ? pin.replace(/\D/g, '') : ''

  // 1. Strict check: if a 6-digit PIN is entered and it is NOT in serviceable PINs
  if (cleanPin.length === 6 && !isServiceablePin(cleanPin)) {
    return {
      fee: 0,
      zone: 'Unserviceable Area',
      distanceKm: 25,
      isPickup: false,
      isOutOfRange: true,
      noticeEn: `Home delivery is currently available only in PIN codes: ${SERVICEABLE_PINCODES.join(', ')}.`,
      noticeBn: `বর্তমানে হোম ডেলিভারি শুধুমাত্র ${SERVICEABLE_PINCODES.join(', ')} পিন কোডে চালু রয়েছে।`,
    }
  }

  // 2. Serviceable PIN delivery
  if (isServiceablePin(cleanPin)) {
    const pinInfo = PIN_DISTANCE_MAP[cleanPin]
    return {
      fee: pinInfo ? pinInfo.fee : 30,
      zone: `PIN ${cleanPin}`,
      distanceKm: pinInfo ? pinInfo.distanceKm : 3.5,
      isPickup: false,
      isOutOfRange: false,
      noticeEn: 'Home Delivery Available: ₹30',
      noticeBn: 'হোম ডেলিভারি চার্জ: ₹৩০',
    }
  }

  // 3. Default for local delivery
  return {
    fee: 30,
    zone: 'Local PIN Area',
    distanceKm: 3.5,
    isPickup: false,
    isOutOfRange: false,
    noticeEn: `Home Delivery Available: ₹30 (PINs: ${SERVICEABLE_PINCODES.join(', ')})`,
    noticeBn: `হোম ডেলিভারি উপলব্ধ: ₹৩০ (পিন: ${SERVICEABLE_PINCODES.join(', ')})`,
  }
}
export function isValidPinCode(pin?: string): boolean {
  if (!pin) return false
  const cleaned = pin.replace(/\D/g, '')
  return cleaned.length === 6
}

export interface NavDestinationResult {
  navUrl: string
  isExact: boolean
  destinationQuery: string
  labelEn: string
  labelBn: string
}

/**
 * 🧭 Smart 4-Tier Navigation Destination Resolver
 * Solves Google Maps "Cannot find destination / No results found" errors by:
 * 1. Prioritizing exact latitude & longitude coordinates.
 * 2. Parsing embedded coordinates from Google Maps URLs/text.
 * 3. Detecting Google Plus Codes (Open Location Codes).
 * 4. Sanitizing messy Bengali/English address descriptions into a clean, guaranteed-working Locality + PIN fallback.
 */
export function resolveNavDestination(order: {
  address?: string
  pin?: string
  geoLat?: number | null
  geoLng?: number | null
  deliveryNotes?: string
}): NavDestinationResult {
  const address = order.address || ''
  const notes = order.deliveryNotes || ''
  const pin = order.pin ? order.pin.replace(/\D/g, '') : ''
  const combined = `${address} ${notes}`

  // Tier 1: Stored exact GPS coordinates
  if (order.geoLat != null && order.geoLng != null && !isNaN(order.geoLat) && !isNaN(order.geoLng)) {
    const latLng = `${order.geoLat},${order.geoLng}`
    return {
      navUrl: `https://www.google.com/maps/dir/?api=1&destination=${latLng}&travelmode=driving`,
      isExact: true,
      destinationQuery: latLng,
      labelEn: `GPS Pin (${order.geoLat.toFixed(4)}, ${order.geoLng.toFixed(4)})`,
      labelBn: `GPS পিন (${order.geoLat.toFixed(4)}, ${order.geoLng.toFixed(4)})`,
    }
  }

  // Tier 2: Extract coordinates from embedded Google Maps URLs or text patterns
  // e.g. "query=22.1741483,87.9040483" or "@22.1741483,87.9040483" or "22.174148, 87.904048"
  const coordRegex = /(?:query=|@|\bq=)?(-?\d{1,2}\.\d{4,}),\s*(-?\d{1,3}\.\d{4,})/
  const coordMatch = combined.match(coordRegex)
  if (coordMatch) {
    const lat = coordMatch[1]
    const lng = coordMatch[2]
    const latLng = `${lat},${lng}`
    return {
      navUrl: `https://www.google.com/maps/dir/?api=1&destination=${latLng}&travelmode=driving`,
      isExact: true,
      destinationQuery: latLng,
      labelEn: `Map Pin (${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)})`,
      labelBn: `ম্যাপ পিন (${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)})`,
    }
  }

  // Tier 3: Extract Google Plus Code (Open Location Code, e.g. "8MX2+4R Haldia" or "7MJ8+9X")
  const plusCodeRegex = /\b([2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,})(?:\s*([A-Za-z]+))?/i
  const plusMatch = combined.match(plusCodeRegex)
  if (plusMatch) {
    const code = plusMatch[1]
    const town = plusMatch[2] ? ` ${plusMatch[2]}` : ''
    const fullCode = `${code}${town}, West Bengal`
    return {
      navUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullCode)}&travelmode=driving`,
      isExact: true,
      destinationQuery: fullCode,
      labelEn: `Plus Code (${plusMatch[1]})`,
      labelBn: `প্লাস কোড (${plusMatch[1]})`,
    }
  }

  // Tier 4: Safe clean town/village & PIN fallback
  // Clean out brackets, URLs, "Pickup...", "Near:...", and descriptive noise so Google Maps NEVER fails
  const sanitized = address
    .replace(/Store Pickup.*?\)/gi, '')
    .replace(/Pickup - .*?\)/gi, '')
    .replace(/\[Maps:.*?\]/gi, '')
    .replace(/GPS অবস্থান.*/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[()[\]{}]/g, ',')
    .replace(/\s+/g, ' ')
    .trim()

  // Split by commas, slashes, dashes, newlines, or "Near"
  const tokens = sanitized
    .split(/[,/·\n;-]|(?:\s+(?:near|opposite|beside)\s+)/i)
    .map((t) => t.replace(/\b(?:house|bari|gate|yellow|green|white|floor|building)\b/gi, '').trim())
    .filter((t) => t.length >= 3)

  let cleanLocality = tokens[0] || ''
  if (!cleanLocality || cleanLocality.length < 3 || /^(house|bari|para|near)$/i.test(cleanLocality)) {
    cleanLocality = tokens.find((t) => t.length >= 3 && !/^(house|bari|para|near)$/i.test(t)) || 'Purba Medinipur'
  }

  const safeQuery = `${cleanLocality}, ${pin ? `${pin}, ` : ''}West Bengal`.trim()
  return {
    navUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(safeQuery)}&travelmode=driving`,
    isExact: false,
    destinationQuery: safeQuery,
    labelEn: `${cleanLocality} (PIN ${pin || 'Local'})`,
    labelBn: `${cleanLocality} (পিন ${pin || 'স্থানীয়'})`,
  }
}

/**
 * 📲 1-Tap WhatsApp Location Request URL Generator
 * Generates an instant WhatsApp chat link requesting the customer to send their Live Location pin
 */
export function createLocationRequestWhatsAppUrl(
  order: { id: string; userName: string; phone: string },
  lang: 'en' | 'bn' = 'bn',
): string {
  const cleanPhone = order.phone.replace(/\D/g, '').slice(-10)
  if (!cleanPhone) return ''
  const shortId = order.id.slice(0, 8).toUpperCase()
  const msg =
    lang === 'bn'
      ? `নমস্কার ${order.userName} বাবু/দিদি, এম.এস ভেজিটেবল সেন্টারের রাইডার আপনার অর্ডার (#${shortId}) নিয়ে বের হচ্ছে। 🛵\n\nঅনুগ্রহ করে এই চ্যাটে পেপারক্লিপ (📎) আইকন চেপে আপনার লাইভ লোকেশন (Share Live Location / Current Location pin) পাঠিয়ে দিন, যাতে রাইডার সরাসরি আপনার বাড়ির দরজায় পৌঁছে যেতে পারে। ধন্যবাদ!`
      : `Hello ${order.userName}, GreenVest delivery rider is on the way with your order (#${shortId}). 🛵\n\nPlease share your Live Location or Current Pin in this WhatsApp chat using the attachment (📎) icon so the rider can reach your exact doorstep without delay. Thank you!`
  return `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`
}
