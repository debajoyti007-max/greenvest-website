import type { DeliveryZone as DbDeliveryZone } from '../types'
import { SERVICEABLE_PINCODES, SUPPORT_PHONE } from './business'

export const STORE_LOCATION = {
  name: 'MS Vegetable Center',
  nameBn: 'এম এস ভেজিটেবল সেন্টার',
  address: 'MS Vegetable Center, Purba Medinipur, PIN 721632',
  addressBn: 'এমএস ভেজিটেবল সেন্টার, পূর্ব মেদিনীপুর, পিন: ৭২১৬৩২',
  lat: 22.1746825,
  lng: 87.9106158,
  mapsUrl: 'https://maps.app.goo.gl/pdafSPpPPBymCDgDA',
  pin: '721632',
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

/** Known PIN distances and delivery fees from Store Hub (<= 5km: ₹30, > 5km: ₹50) */
const PIN_DISTANCE_MAP: Record<string, { distanceKm: number; fee: number }> = {
  '721632': { distanceKm: 3.2, fee: 30 },
  '721633': { distanceKm: 7.8, fee: 50 },
  '721643': { distanceKm: 10.2, fee: 50 },
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
      noticeEn: 'Self-Pickup from Store Outlet (₹0 Delivery Charge)',
      noticeBn: 'স্টোর আউটলেট থেকে নিজস্ব পিকআপ (₹০ ডেলিভারি চার্জ)',
    }
  }

  // Priority 1: Exact GPS coordinates distance
  let coords: { lat: number; lng: number } | null = null
  if (coordsOrZones && 'lat' in coordsOrZones && 'lng' in coordsOrZones && coordsOrZones.lat && coordsOrZones.lng) {
    coords = coordsOrZones as { lat: number; lng: number }
  }

  if (coords) {
    const distanceKm = calculateDistanceKm(STORE_LOCATION.lat, STORE_LOCATION.lng, coords.lat, coords.lng)

    // Over 15 km is out of delivery range
    if (distanceKm > STORE_LOCATION.maxDeliveryRadiusKm) {
      return {
        fee: 0,
        zone: 'Out of Delivery Range',
        distanceKm,
        isPickup: false,
        isOutOfRange: true,
        noticeEn: `Your location is ~${distanceKm} km away (outside 15 km delivery zone). Please choose Store Pickup (₹0) or enter a local address.`,
        noticeBn: `আপনার অবস্থান ~${distanceKm} কিমি দূরে (১৫ কিমি ডেলিভারি সীমার বাইরে)। দোকান থেকে ফ্রি পিকআপ (₹০) বেছে নিন।`,
      }
    }

    // <= 5 km: ₹30, > 5 km: ₹50
    const fee = distanceKm > 5 ? 50 : 30
    return {
      fee,
      zone: distanceKm > 5 ? `Extended Delivery (~${distanceKm} km)` : `Local Delivery (~${distanceKm} km)`,
      distanceKm,
      isPickup: false,
      isOutOfRange: false,
      noticeEn: distanceKm > 5
        ? `Delivery Fee: ₹50 (~${distanceKm} km from store)`
        : `Delivery Fee: ₹30 (~${distanceKm} km from store)`,
      noticeBn: distanceKm > 5
        ? `ডেলিভারি চার্জ: ₹৫০ (দোকান থেকে ~${distanceKm} কিমি)`
        : `ডেলিভারি চার্জ: ₹৩০ (দোকান থেকে ~${distanceKm} কিমি)`,
    }
  }

  const cleanPin = pin ? pin.replace(/\D/g, '') : ''

  // Priority 2: Strict check: if a 6-digit PIN is entered and it is NOT in serviceable PINs
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

  // Priority 3: Serviceable PIN delivery
  if (isServiceablePin(cleanPin)) {
    const pinInfo = PIN_DISTANCE_MAP[cleanPin]
    const distanceKm = pinInfo ? pinInfo.distanceKm : 3.5
    const fee = distanceKm > 5 ? 50 : 30
    return {
      fee,
      zone: `PIN ${cleanPin}`,
      distanceKm,
      isPickup: false,
      isOutOfRange: false,
      noticeEn: fee === 50 ? `Delivery Fee: ₹50 (~${distanceKm} km from store)` : `Delivery Fee: ₹30 (~${distanceKm} km from store)`,
      noticeBn: fee === 50 ? `ডেলিভারি চার্জ: ₹৫০ (দোকান থেকে ~${distanceKm} কিমি)` : `ডেলিভারি চার্জ: ₹৩০ (দোকান থেকে ~${distanceKm} কিমি)`,
    }
  }

  // Priority 4: Default for local delivery
  return {
    fee: 30,
    zone: 'Local PIN Area',
    distanceKm: 3.5,
    isPickup: false,
    isOutOfRange: false,
    noticeEn: `Home Delivery Available: ₹30 – ₹50 (PINs: ${SERVICEABLE_PINCODES.join(', ')})`,
    noticeBn: `হোম ডেলিভারি উপলব্ধ: ₹৩০ – ₹৫০ (পিন: ${SERVICEABLE_PINCODES.join(', ')})`,
  }
}

export async function reverseGeocodeLocation(
  lat: number,
  lng: number,
): Promise<{ village?: string; town?: string; pin?: string; displayName?: string }> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
      {
        headers: { 'User-Agent': 'GreenVest-Delivery/1.0' },
        signal: controller.signal,
      },
    )
    clearTimeout(timer)
    if (!res.ok) return {}
    const data = await res.json()
    const addr = data.address || {}
    const village = addr.village || addr.suburb || addr.neighbourhood || addr.hamlet || ''
    const town = addr.town || addr.city || addr.county || addr.state_district || ''
    const pin = addr.postcode ? addr.postcode.replace(/\D/g, '').slice(0, 6) : undefined
    return {
      village,
      town,
      pin,
      displayName: [village, town].filter(Boolean).join(', ') || data.name || '',
    }
  } catch {
    return {}
  }
}

export interface LocationServiceabilityResult {
  isServiceable: boolean
  distanceKm: number
  fee: number
  detectedPin?: string
  detectedArea?: string
  noticeEn: string
  noticeBn: string
}

export async function checkLocationServiceability(
  lat: number,
  lng: number,
): Promise<LocationServiceabilityResult> {
  const distanceKm = calculateDistanceKm(STORE_LOCATION.lat, STORE_LOCATION.lng, lat, lng)

  if (distanceKm > STORE_LOCATION.maxDeliveryRadiusKm) {
    return {
      isServiceable: false,
      distanceKm,
      fee: 0,
      noticeEn: `Your location is ~${distanceKm} km away (outside 15 km delivery zone).`,
      noticeBn: `আপনার অবস্থান ~${distanceKm} কিমি দূরে (১৫ কিমি ডেলিভারি সীমার বাইরে)।`,
    }
  }

  const fee = distanceKm > 5 ? 50 : 30
  const geo = await reverseGeocodeLocation(lat, lng)

  let matchedPin: string | undefined
  if (geo.pin && isServiceablePin(geo.pin)) {
    matchedPin = geo.pin
  } else {
    matchedPin = '721632'
  }

  const areaName = geo.displayName || geo.village || geo.town || ''

  return {
    isServiceable: true,
    distanceKm,
    fee,
    detectedPin: matchedPin,
    detectedArea: areaName,
    noticeEn: distanceKm > 5
      ? `Delivery Available: ₹50 (~${distanceKm} km from store)`
      : `Delivery Available: ₹30 (~${distanceKm} km from store)`,
    noticeBn: distanceKm > 5
      ? `ডেলিভারি চার্জ: ₹৫০ (দোকান থেকে ~${distanceKm} কিমি)`
      : `ডেলিভারি চার্জ: ₹৩০ (দোকান থেকে ~${distanceKm} কিমি)`,
  }
}
export function isValidPinCode(pin?: string): boolean {
  if (!pin) return false
  const cleaned = pin.replace(/\D/g, '')
  return cleaned.length === 6
}

export interface NavDestinationResult {
  navUrl: string
  appNavUrl: string
  isExact: boolean
  hasLandmark: boolean
  landmarkName?: string
  destinationQuery: string
  labelEn: string
  labelBn: string
}

/**
 * 🏛️ Extract prominent rural landmark names from delivery notes or address.
 * Recognizes common landmarks across rural West Bengal & India:
 * - Schools, Colleges, Hospitals, Health Centers, Clinics
 * - Temples (Mandir), Mosques (Masjid), Churches
 * - Clubs, Libraries, Panchayats, Post Offices, Police Stations
 * - Road junctions (More, Mor, Crossing, Chourangi, Bus Stand, Ghat)
 * - Markets (Bazar, Hat, Market, Complex)
 * - Bridges, Pools, Petrol Pumps, ATMs, Banks
 */
export function extractRuralLandmark(notes?: string, address?: string): string | null {
  const combined = `${notes || ''} ${address || ''}`
  if (!combined.trim()) return null

  // 1. Direct explicit notes (e.g. "Girls school more" or "Near: Shiv mandir")
  const explicitNote = (notes || '').trim()
  if (explicitNote) {
    const stripped = explicitNote
      .replace(/^(?:near|opp|opposite|beside|behind|কাছে|নিকট|পাশে|সামনে|ল্যান্ডমার্ক|landmark)[:\s-]+/i, '')
      .replace(/[()[\]{}]/g, '')
      .trim()
    if (stripped.length >= 3 && stripped.length <= 50) {
      return stripped
    }
  }

  // 2. Look for (Near: ...) or (কাছে: ...) inside address
  const bracketMatch = (address || '').match(/\((?:near|opp|opposite|landmark|কাছে|পাশে)?[:\s-]*([^)]+)\)/i)
  if (bracketMatch) {
    const l = bracketMatch[1]
      .replace(/^(?:near|opp|opposite|landmark|কাছে|পাশে)[:\s-]+/i, '')
      .trim()
    if (l.length >= 3 && l.length <= 50) return l
  }

  // 3. Look for "Near <landmark>", "Opposite <landmark>", "কাছে <landmark>"
  const nearRegex = /(?:near|opp|opposite|beside|behind|নিকট|পাশে|সামনে)[:\s-]+([^,;\n·/]+)/i
  const nearMatch = (address || '').match(nearRegex)
  if (nearMatch) {
    const l = nearMatch[1].replace(/[()[\]{}]/g, '').trim()
    if (l.length >= 3 && l.length <= 50 && !/^(house|bari|para|door|flat|room|ward)$/i.test(l)) {
      return l
    }
  }

  // 4. Keyword landmark detector (e.g. "Girls school more", "Shitala mandir", "বকুলতলা মোড়")
  const landmarkKeywordRegex = /\b([a-zA-Z\u0980-\u09FF\s]{2,25}(?:more|mor|school|college|hospital|club|mandir|temple|masjid|station|bazar|market|hat|bridge|pool|petrol\s*pump|bank|atm|panchayat|ঘাট|মোড়|মোর|স্কুল|কলেজ|হাসপাতাল|ক্লাব|মন্দির|মসজিদ|স্টেশন|বাজার|হাট|ব্রিজ|পুল|ঘাট))\b/i
  const kwMatch = combined.match(landmarkKeywordRegex)
  if (kwMatch) {
    const l = kwMatch[1].trim()
    if (l.length >= 4 && l.length <= 45) return l
  }

  return null
}

/**
 * Deduplicates repetitive address segments (e.g. "Bhabanipur, নন্দকুমার, , bhabanipur")
 * Removes duplicates while preserving bilingual Bengali/English context.
 */
export function deduplicateAddressTokens(address: string): string[] {
  if (!address) return []
  const cleaned = address
    .replace(/Store Pickup.*?\)/gi, '')
    .replace(/Pickup - .*?\)/gi, '')
    .replace(/\[Maps:.*?\]/gi, '')
    .replace(/GPS অবস্থান.*/gi, '')
    .replace(/GPS Location Saved.*/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\(Near:.*?\)/gi, '')
    .replace(/[()[\]{}]/g, ',')
    .trim()

  const rawTokens = cleaned
    .split(/[,/·\n;-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)

  const seen = new Set<string>()
  const unique: string[] = []

  for (const t of rawTokens) {
    const normalized = t.toLowerCase().replace(/\s+/g, ' ')
    if (/^(house|bari|para|door|flat|floor|room|ward)$/i.test(normalized)) continue
    if (!seen.has(normalized)) {
      seen.add(normalized)
      unique.push(t)
    }
  }

  return unique
}

/**
 * Clean display string for order address cards
 */
export function cleanDisplayAddress(raw?: string): string {
  if (!raw) return ''
  const cleaned = raw
    .replace(/\[\s*Maps:\s*https?:\/\/[^\]]+\]/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/GPS\s*অবস্থান\s*সংরক্ষিত/gi, '')
    .replace(/GPS\s*Location\s*Saved/gi, '')
    .replace(/\[\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*\]/g, '')
    .trim()

  const nearMatch = cleaned.match(/\(Near:\s*([^)]+)\)/i)
  const landmark = nearMatch ? nearMatch[1].trim() : ''
  const base = cleaned.replace(/\(Near:[^)]+\)/gi, '').trim()

  const tokens = base.split(/\s+/).filter(Boolean)
  const uniqueTokens: string[] = []
  for (const t of tokens) {
    if (uniqueTokens.length === 0 || uniqueTokens[uniqueTokens.length - 1] !== t) {
      uniqueTokens.push(t)
    }
  }
  const cleanBase = uniqueTokens.join(' ').replace(/^[,\s-]+|[,\s-]+$/g, '')

  if (landmark && cleanBase) {
    if (cleanBase.toLowerCase().includes(landmark.toLowerCase())) {
      return cleanBase
    }
    return `${cleanBase} (Near: ${landmark})`
  }

  return cleanBase || landmark || raw
}

/**
 * 🧭 Smart 4-Tier Navigation Destination Resolver with Landmark Precision & App Intent
 * Solves Google Maps "Cannot find destination / No results found" errors:
 * 1. Prioritizes exact latitude & longitude coordinates.
 * 2. Parses embedded coordinates from Google Maps URLs/text.
 * 3. Detects Google Plus Codes (Open Location Codes).
 * 4. Extracts prominent rural landmarks ("Girls school more", "Shitala mandir", "Club") + clean deduplicated Locality & PIN.
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
  const originStr = `${STORE_LOCATION.lat},${STORE_LOCATION.lng}`

  // Tier 1: Stored exact GPS coordinates
  if (order.geoLat != null && order.geoLng != null && !isNaN(order.geoLat) && !isNaN(order.geoLng)) {
    const latLng = `${order.geoLat},${order.geoLng}`
    return {
      navUrl: `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${latLng}&travelmode=driving`,
      appNavUrl: `google.navigation:q=${latLng}&mode=d`,
      isExact: true,
      hasLandmark: false,
      destinationQuery: latLng,
      labelEn: `GPS Pin (${order.geoLat.toFixed(4)}, ${order.geoLng.toFixed(4)})`,
      labelBn: `GPS পিন (${order.geoLat.toFixed(4)}, ${order.geoLng.toFixed(4)})`,
    }
  }

  // Tier 2: Extract coordinates from embedded Google Maps URLs or text patterns
  const coordRegex = /(?:query=|@|\bq=)?(-?\d{1,2}\.\d{4,}),\s*(-?\d{1,3}\.\d{4,})/
  const coordMatch = combined.match(coordRegex)
  if (coordMatch) {
    const lat = coordMatch[1]
    const lng = coordMatch[2]
    const latLng = `${lat},${lng}`
    return {
      navUrl: `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${latLng}&travelmode=driving`,
      appNavUrl: `google.navigation:q=${latLng}&mode=d`,
      isExact: true,
      hasLandmark: false,
      destinationQuery: latLng,
      labelEn: `Map Pin (${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)})`,
      labelBn: `ম্যাপ পিন (${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)})`,
    }
  }

  // Tier 3: Extract Google Plus Code (Open Location Code, e.g. "8MX2+4R Haldia")
  const plusCodeRegex = /\b([2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,})(?:\s*([A-Za-z]+))?/i
  const plusMatch = combined.match(plusCodeRegex)
  if (plusMatch) {
    const code = plusMatch[1]
    const town = plusMatch[2] ? ` ${plusMatch[2]}` : ''
    const fullCode = `${code}${town}, West Bengal`
    return {
      navUrl: `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${encodeURIComponent(fullCode)}&travelmode=driving`,
      appNavUrl: `google.navigation:q=${encodeURIComponent(fullCode)}&mode=d`,
      isExact: true,
      hasLandmark: false,
      destinationQuery: fullCode,
      labelEn: `Plus Code (${plusMatch[1]})`,
      labelBn: `প্লাস কোড (${plusMatch[1]})`,
    }
  }

  // Tier 4: High-Precision Rural Landmark + Clean Locality Extraction
  const landmark = extractRuralLandmark(notes, address)
  const uniqueTokens = deduplicateAddressTokens(address)

  if (landmark) {
    const queryParts: string[] = [landmark]
    if (uniqueTokens.length > 0) {
      // Add first 2 non-duplicate locality names for context (e.g. "Bhabanipur, Nandakumar")
      queryParts.push(...uniqueTokens.slice(0, 2))
    }
    if (pin) queryParts.push(pin)
    queryParts.push('West Bengal')

    const landmarkQuery = queryParts.join(', ')
    return {
      navUrl: `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${encodeURIComponent(landmarkQuery)}&travelmode=driving`,
      appNavUrl: `google.navigation:q=${encodeURIComponent(landmarkQuery)}&mode=d`,
      isExact: true,
      hasLandmark: true,
      landmarkName: landmark,
      destinationQuery: landmarkQuery,
      labelEn: `🏛️ ${landmark}`,
      labelBn: `🏛️ ${landmark}`,
    }
  }

  // Fallback: Safe clean town/village & PIN
  const cleanLocality = uniqueTokens[0] || 'Purba Medinipur'
  const safeQuery = `${cleanLocality}, ${pin ? `${pin}, ` : ''}West Bengal`.trim()

  return {
    navUrl: `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${encodeURIComponent(safeQuery)}&travelmode=driving`,
    appNavUrl: `google.navigation:q=${encodeURIComponent(safeQuery)}&mode=d`,
    isExact: false,
    hasLandmark: false,
    destinationQuery: safeQuery,
    labelEn: `${cleanLocality} (PIN ${pin || 'Local'})`,
    labelBn: `${cleanLocality} (পিন ${pin || 'স্থানীয়'})`,
  }
}

/**
 * 🚀 Multi-Stop Full Delivery Route URL Generator
 * Assembles all active stops into a single continuous Google Maps route URL with waypoints:
 * Origin (Store) -> Stop 1 -> Stop 2 -> ... -> Final Stop
 */
export function generateMultiStopRouteUrl(
  orders: Array<{
    address?: string
    pin?: string
    geoLat?: number | null
    geoLng?: number | null
    deliveryNotes?: string
  }>,
  origin = `${STORE_LOCATION.lat},${STORE_LOCATION.lng}`,
): string {
  if (orders.length === 0) {
    return `https://www.google.com/maps/search/?api=1&query=${origin}`
  }

  const destinations = orders.map((o) => {
    const res = resolveNavDestination(o)
    return res.destinationQuery
  })

  if (destinations.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${encodeURIComponent(destinations[0])}&travelmode=driving`
  }

  // Google Maps free standard URL supports up to 9 waypoints plus destination
  const stops = destinations.slice(0, 9)
  const finalDest = stops[stops.length - 1]
  const waypoints = stops.slice(0, stops.length - 1)

  const waypointsParam = waypoints.map((w) => encodeURIComponent(w)).join('|')
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${encodeURIComponent(finalDest)}&waypoints=${waypointsParam}&travelmode=driving`
}

/**
 * 🧠 Traveling Salesperson (TSP) Nearest-Neighbor Delivery Route Optimizer
 * Sequences orders starting from MS Vegetable Center Hub to minimize total driving distance.
 */
export function optimizeDeliveryRoute<
  T extends {
    id: string
    geoLat?: number | null
    geoLng?: number | null
    pin?: string
    address?: string
    deliveryNotes?: string
    createdAt?: string
  },
>(
  orders: T[],
  startLocation = { lat: STORE_LOCATION.lat, lng: STORE_LOCATION.lng },
): {
  sequencedOrders: T[]
  totalDistanceKm: number
  legDistancesKm: number[]
  estimatedMinutes: number
} {
  if (orders.length <= 1) {
    const singleDist =
      orders.length === 1 && orders[0].geoLat && orders[0].geoLng
        ? calculateDistanceKm(startLocation.lat, startLocation.lng, orders[0].geoLat, orders[0].geoLng)
        : orders.length === 1
        ? PIN_DISTANCE_MAP[orders[0].pin || '']?.distanceKm || 4
        : 0
    return {
      sequencedOrders: [...orders],
      totalDistanceKm: singleDist,
      legDistancesKm: orders.length === 1 ? [singleDist] : [],
      estimatedMinutes: Math.round(singleDist * 2.5 + orders.length * 4),
    }
  }

  const unvisited = [...orders]
  const sequencedOrders: T[] = []
  const legDistancesKm: number[] = []
  let currentLat = startLocation.lat
  let currentLng = startLocation.lng
  let totalDistance = 0

  while (unvisited.length > 0) {
    let bestIdx = 0
    let bestDist = Infinity

    for (let i = 0; i < unvisited.length; i++) {
      const o = unvisited[i]
      let dist = 0
      if (o.geoLat && o.geoLng) {
        dist = calculateDistanceKm(currentLat, currentLng, o.geoLat, o.geoLng)
      } else {
        const pinDist = PIN_DISTANCE_MAP[o.pin || '']?.distanceKm || 4.5
        dist = Math.abs(calculateDistanceKm(currentLat, currentLng, STORE_LOCATION.lat, STORE_LOCATION.lng) - pinDist) + 1.2
      }

      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }

    const nextOrder = unvisited.splice(bestIdx, 1)[0]
    sequencedOrders.push(nextOrder)
    const leg = Math.round(bestDist * 10) / 10
    legDistancesKm.push(leg)
    totalDistance += leg

    if (nextOrder.geoLat && nextOrder.geoLng) {
      currentLat = nextOrder.geoLat
      currentLng = nextOrder.geoLng
    }
  }

  const totalDistanceKm = Math.round(totalDistance * 10) / 10
  // Estimated riding time: 24 km/h average speed (2.5 mins per km) + 4 mins per delivery handover
  const estimatedMinutes = Math.round(totalDistanceKm * 2.5 + sequencedOrders.length * 4)

  return {
    sequencedOrders,
    totalDistanceKm,
    legDistancesKm,
    estimatedMinutes,
  }
}

/**
 * 📲 Direct Navigation Launcher
 * On Android, attempts to launch native Google Maps turn-by-turn voice driving mode.
 * On desktop or other platforms, opens universal Google Maps directions.
 */
export function launchRiderNavigation(destination: NavDestinationResult): void {
  if (typeof window === 'undefined') return
  const isAndroid = /android/i.test(navigator.userAgent || '')
  if (isAndroid && destination.appNavUrl) {
    window.location.href = destination.appNavUrl
    setTimeout(() => {
      window.open(destination.navUrl, '_blank', 'noopener,noreferrer')
    }, 700)
  } else {
    window.open(destination.navUrl, '_blank', 'noopener,noreferrer')
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
      : `Hello ${order.userName}, MS Vegetable Center delivery rider is on the way with your order (#${shortId}). 🛵\n\nPlease share your Live Location or Current Pin in this WhatsApp chat using the attachment (📎) icon so the rider can reach your exact doorstep without delay. Thank you!`
  return `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`
}

