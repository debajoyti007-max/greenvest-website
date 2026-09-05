import type { CustomerTier, ShiftInfo } from '../types'

/** Central business / contact / payment config for production. */
const env = (key: string, fallback: string) => {
  const v = import.meta.env[key] as string | undefined
  return v && v.trim() ? v.trim() : fallback
}

export const MIN_ORDER_AMOUNT = 500
export const MAX_VEGETABLE_QTY_KG = 10
export const DELIVERY_WINDOW = '12–24 hours'
export const DELIVERY_WINDOW_BN = '১২–২৪ ঘণ্টা'
export const ADVANCE_PERCENT = 10
/** Alert seller when stockQty is at or below this (and item is in stock). */
export const LOW_STOCK_QTY = 5

export const SERVICEABLE_PINCODES = ['721632', '721633', '721643'] as const

/**
 * Automatically computes dynamic market MRP strikethrough:
 * 1. If seller specifies an explicit overrideMrp > sellingPrice, it uses that exact value.
 * 2. If no manual override is provided, computes a varied, organic product markup (+18% to +45%)
 *    yielding varied, realistic discounts (15% OFF, 18% OFF, 22% OFF, 26% OFF, 30% OFF).
 * 3. Whenever the seller edits the main selling price, MRP and discount percentage dynamically adjust in real time!
 */
export function computeMarketMrp(sellingPrice: number, overrideMrp?: number, productKey?: string): number {
  if (overrideMrp && overrideMrp > sellingPrice) return overrideMrp
  if (!sellingPrice || sellingPrice <= 0) return 0

  const variations = [18, 22, 25, 28, 30, 33, 35, 38, 42]
  let markupPercent = 25

  if (productKey) {
    let hash = 0
    for (let i = 0; i < productKey.length; i++) {
      hash = (hash << 5) - hash + productKey.charCodeAt(i)
      hash |= 0
    }
    markupPercent = variations[Math.abs(hash) % variations.length]
  } else {
    markupPercent = variations[Math.abs(Math.round(sellingPrice)) % variations.length]
  }

  const rawMrp = sellingPrice * (1 + markupPercent / 100)
  return Math.ceil(rawMrp)
}

/** Calculates discount percentage between MRP and selling price */
export function computeDiscountPercent(mrp: number, sellingPrice: number): number {
  if (!mrp || mrp <= sellingPrice) return 0
  return Math.round(((mrp - sellingPrice) / mrp) * 100)
}

/** Calculates customer tier price discount */
export function calculateTierDiscount(basePrice: number, tier?: CustomerTier): number {
  if (!basePrice || !tier || tier === 'regular') return basePrice
  if (tier === 'vip') {
    // 5% discount for VIP / Prime members
    return Math.max(1, Math.round(basePrice * 0.95))
  }
  if (tier === 'wholesale') {
    // 12% discount for wholesale / hotel buyers
    return Math.max(1, Math.round(basePrice * 0.88))
  }
  return basePrice
}

/** Get live shift status of the store based on current hour */
export function getCurrentShiftStatus(): ShiftInfo {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const totalMinutes = hour * 60 + minute

  const morningStartMin = 7 * 60
  const morningEndMin = 12 * 60
  const eveningStartMin = 16 * 60
  const eveningEndMin = 21 * 60

  if (totalMinutes >= morningStartMin && totalMinutes < morningEndMin) {
    return {
      currentShift: 'morning',
      isOpen: true,
      shiftNameEn: 'Morning Shift (7:00 AM – 12:00 PM)',
      shiftNameBn: 'সকালের শিফট (সকাল ৭:০০ – দুপুর ১২:০০)',
      nextShiftNoticeEn: 'Open now · Closes at 12:00 PM for afternoon procurement',
      nextShiftNoticeBn: 'এখন খোলা · দুপুর ১২:০০ টায় বন্ধ হবে',
    }
  }

  if (totalMinutes >= morningEndMin && totalMinutes < eveningStartMin) {
    return {
      currentShift: 'break',
      isOpen: false,
      shiftNameEn: 'Afternoon Break (Procurement)',
      shiftNameBn: 'দুপুরের বিরতি (মন্ডি সংগ্রহ)',
      nextShiftNoticeEn: 'Evening Shift starts at 4:00 PM (Accepting advance orders)',
      nextShiftNoticeBn: 'সন্ধ্যার শিফট বিকাল ৪:০০ টায় শুরু হবে (অগ্রিম অর্ডার নেওয়া হচ্ছে)',
    }
  }

  if (totalMinutes >= eveningStartMin && totalMinutes < eveningEndMin) {
    return {
      currentShift: 'evening',
      isOpen: true,
      shiftNameEn: 'Evening Shift (4:00 PM – 9:00 PM)',
      shiftNameBn: 'সন্ধ্যার শিফট (বিকাল ৪:০০ – রাত ৯:০০)',
      nextShiftNoticeEn: 'Open now · Closes at 9:00 PM',
      nextShiftNoticeBn: 'এখন খোলা · রাত ৯:০০ টায় বন্ধ হবে',
    }
  }

  return {
    currentShift: 'closed',
    isOpen: false,
    shiftNameEn: 'Closed for Night',
    shiftNameBn: 'রাতের জন্য বন্ধ',
    nextShiftNoticeEn: 'Morning Shift opens tomorrow at 7:00 AM',
    nextShiftNoticeBn: 'আগামীকাল সকাল ৭:০০ টায় সকালের শিফট খুলবে',
  }
}

export const SEASON_LABELS = {
  all: { en: 'All season', bn: 'সব সিজন' },
  summer: { en: 'Summer', bn: 'গ্রীষ্ম' },
  winter: { en: 'Winter', bn: 'শীত' },
  rainy: { en: 'Rainy', bn: 'বর্ষা' },
} as const

/** Display phone. */
export const SUPPORT_PHONE = env('VITE_SUPPORT_PHONE', '+91 99328 71027')
/** WhatsApp deep-link number: country code + digits, no + or spaces. */
export const SUPPORT_WHATSAPP = env('VITE_SUPPORT_WHATSAPP', '919932871027')
export const SUPPORT_EMAIL = env('VITE_SUPPORT_EMAIL', 'greenvest.orders@gmail.com')
export const SUPPORT_HOURS = env('VITE_SUPPORT_HOURS', '7:00 AM – 9:00 PM')

export const UPI_ID = env('VITE_UPI_ID', '8170859653-2@ybl')
export const UPI_BANK = env('VITE_UPI_BANK', 'State Bank of India ····9764')
const assetBase = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
export const UPI_QR_SRC = env('VITE_UPI_QR_SRC', `${assetBase}upi-qr.png`)

/** True only during `npm run dev` — allows localStorage fallback. */
export const IS_DEV = import.meta.env.DEV

/** Local offline shop allowed only in development. */
export const ALLOW_LOCAL_FALLBACK = IS_DEV

export function formatDisplayContact(email: string, phone?: string): string {
  if (phone && phone.trim()) return phone.trim()
  if (!email) return ''
  if (email.endsWith('@greenvest.shop')) {
    const raw = email.replace('@greenvest.shop', '')
    if (/^\d{10}$/.test(raw)) return raw
  }
  return email
}

/** Formats any long or short Order ID into a clean 4-6 digit reference (e.g. ORD-849201). */
export function formatOrderId(id: string): string {
  if (!id) return ''
  const clean = id.trim()
  if (/^ORD-\d{4,6}$/i.test(clean)) return clean.toUpperCase()
  if (/^\d{4,6}$/.test(clean)) return `ORD-${clean}`
  const digits = clean.replace(/\D/g, '')
  if (digits.length >= 6) return `ORD-${digits.slice(-6)}`
  return `ORD-${clean.slice(-6).toUpperCase()}`
}

export const STALE_PENDING_ORDER_TIMEOUT_HOURS = 2

/** Checks if an unverified pending order is older than timeout hours */
export function isOrderStalePending(
  order: { createdAt: string; status: string; utrVerified?: boolean },
  timeoutHours = STALE_PENDING_ORDER_TIMEOUT_HOURS,
): boolean {
  if (order.status !== 'pending' || order.utrVerified) return false
  const created = new Date(order.createdAt).getTime()
  if (isNaN(created)) return false
  const ageHours = (Date.now() - created) / (1000 * 60 * 60)
  return ageHours >= timeoutHours
}

/**
 * Detects whether a user object is the Master Super Admin.
 * Identity is verified by the Supabase database (is_super_admin column),
 * NOT by env vars. This means it cannot be discovered from the public JS bundle.
 *
 * String inputs are no longer supported — always pass a User object.
 */
export function isSuperAdmin(
  target?: unknown
): boolean {
  if (!target || typeof target !== 'object') return false
  return (target as { isSuperAdmin?: boolean }).isSuperAdmin === true
}

/**
 * Returns a secure, deterministic 4-digit Delivery Handover OTP.
 * If order has a stored deliveryOtp, uses that.
 * Otherwise, computes a stable 4-digit numeric code (1000–9999) from order ID and metadata.
 */
export function getOrderDeliveryOtp(
  order: { id: string; phone?: string; createdAt?: string; deliveryOtp?: string }
): string {
  if (order.deliveryOtp && /^\d{4}$/.test(order.deliveryOtp.trim())) {
    return order.deliveryOtp.trim()
  }
  const seed = `${order.id}-${order.phone || 'greenvest'}`
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  const code = 1000 + (hash % 9000)
  return String(code)
}
