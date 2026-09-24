import type { CustomerTier, ShiftInfo } from '../types'

/** Central business / contact / payment config for production. */
const env = (key: string, fallback: string) => {
  const v = import.meta.env[key] as string | undefined
  return v && v.trim() ? v.trim() : fallback
}

export const MIN_ORDER_AMOUNT = 500
export const STORE_NAME = env('VITE_STORE_NAME', 'MS Vegetable Center')
export const MAX_VEGETABLE_QTY_KG = 10
/** Maximum total order weight (in kg) allowed for bike/scooter home delivery. Orders exceeding this must choose Store Pickup */
export const MAX_DELIVERY_WEIGHT_KG = 10
/** Maximum number of non-cancelled orders a customer can place within a rolling 60-minute window */
export const MAX_ORDERS_PER_HOUR = 3
export const DELIVERY_WINDOW = '12–24 hours'
export const DELIVERY_WINDOW_BN = '১২–২৪ ঘণ্টা'
export const ADVANCE_PERCENT = 10
/** Alert seller when stockQty is at or below this (and item is in stock). */
export const LOW_STOCK_QTY = 5

export const SERVICEABLE_PINCODES = ['721632', '721633', '721643'] as const

/**
 * Calculates total physical weight of cart items in kg.
 * Accounts for quantity and weight multipliers (e.g. 250g = 0.25, 500g = 0.5, 5kg = 5).
 */
export function calculateCartTotalWeightKg(items?: Array<{ qty: number; weightMultiplier?: number }> | null): number {
  if (!items || items.length === 0) return 0
  const total = items.reduce((sum, item) => sum + (item.qty * (item.weightMultiplier || 1)), 0)
  return Math.round(total * 100) / 100
}

/**
 * Checks whether a customer has exceeded the hourly order rate limit.
 * Returns { isExceeded: boolean, count: number, resetMinutes: number }
 */
export function checkOrderRateLimit(
  orders: Array<{ userId?: string; phone?: string; createdAt?: string; status?: string }>,
  userId?: string,
  phone?: string,
  nowMs = Date.now(),
): { isExceeded: boolean; count: number; oldestOrderMs?: number; resetMinutes: number } {
  if (!orders || orders.length === 0 || (!userId && !phone)) {
    return { isExceeded: false, count: 0, resetMinutes: 0 }
  }

  const cleanPhone = phone ? phone.replace(/\D/g, '').slice(-10) : ''
  const oneHourAgo = nowMs - 60 * 60 * 1000

  const recentOrders = orders.filter((o) => {
    if (o.status === 'cancelled') return false
    const matchUser = userId && o.userId === userId
    const oPhone = o.phone ? o.phone.replace(/\D/g, '').slice(-10) : ''
    const matchPhone = cleanPhone && oPhone && oPhone === cleanPhone
    if (!matchUser && !matchPhone) return false

    const orderTime = o.createdAt ? new Date(o.createdAt).getTime() : 0
    return orderTime >= oneHourAgo && orderTime <= nowMs + 60000 // safe tolerance for clock skew
  })

  const count = recentOrders.length
  const isExceeded = count >= MAX_ORDERS_PER_HOUR

  let resetMinutes = 0
  let oldestOrderMs: number | undefined

  if (isExceeded && recentOrders.length > 0) {
    const timestamps = recentOrders
      .map((o) => (o.createdAt ? new Date(o.createdAt).getTime() : 0))
      .filter((t) => t > 0)
      .sort((a, b) => a - b)
    oldestOrderMs = timestamps[0]
    if (oldestOrderMs) {
      const msUntilExpiry = oldestOrderMs + 60 * 60 * 1000 - nowMs
      resetMinutes = Math.max(1, Math.ceil(msUntilExpiry / 60000))
    }
  }

  return { isExceeded, count, oldestOrderMs, resetMinutes }
}

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

/** Converts english digits to Bengali digits */
export function toBnDigits(val: number | string): string {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']
  return String(val).replace(/[0-9]/g, (d) => bnDigits[Number(d)] ?? d)
}

/**
 * Returns a crystal-clear formatted string explaining physical weight/amount and breakdown.
 * Example:
 * 5 units of 1 kg -> "মোট পরিমাণ: ৫ কেজি (১ কেজি × ৫)" / "Total Weight: 5 kg (1 kg × 5)"
 * 3 units of 500g -> "মোট পরিমাণ: ১.৫ কেজি (৫০০ গ্রাম × ৩)" / "Total Weight: 1.5 kg (500g × 3)"
 * 1 unit of 5 kg  -> "পরিমাণ: ৫ কেজি" / "Weight: 5 kg"
 */
export function formatItemWeightDetail(
  qty: number,
  weightMultiplier: number = 1,
  weightLabel?: string,
  unit: string = 'kg',
  lang: 'en' | 'bn' = 'en'
): { totalWeightText: string; breakdownText: string; fullBadgeText: string } {
  const isKg = unit.toLowerCase() === 'kg'
  const mult = weightMultiplier || 1

  if (isKg) {
    const totalKg = Number((qty * mult).toFixed(2))

    // Format single unit label
    const singleLabelEn =
      weightLabel ||
      (mult === 1 ? '1 kg' : mult === 0.25 ? '250g' : mult === 0.5 ? '500g' : `${mult} kg`)
    const singleLabelBn = singleLabelEn
      .replace(/250g/i, '২৫০ গ্রাম')
      .replace(/500g/i, '৫০০ গ্রাম')
      .replace(/(\d+(\.\d+)?)\s*kg/i, (_, num) => `${toBnDigits(num)} কেজি`)
      .replace(/kg/i, 'কেজি')

    // Format total weight
    let totalTextEn = ''
    let totalTextBn = ''
    if (totalKg < 1) {
      const grams = Math.round(totalKg * 1000)
      totalTextEn = `${grams}g`
      totalTextBn = `${toBnDigits(grams)} গ্রাম`
    } else {
      totalTextEn = `${totalKg} kg`
      totalTextBn = `${toBnDigits(totalKg)} কেজি`
    }

    const totalWeightText = lang === 'bn' ? totalTextBn : totalTextEn
    const singleLabel = lang === 'bn' ? singleLabelBn : singleLabelEn

    if (qty > 1) {
      const breakdownText =
        lang === 'bn' ? `${singleLabel} × ${toBnDigits(qty)}` : `${singleLabel} × ${qty}`
      const fullBadgeText =
        lang === 'bn'
          ? `📦 মোট পরিমাণ: ${totalWeightText} (${breakdownText})`
          : `📦 Total Weight: ${totalWeightText} (${breakdownText})`
      return { totalWeightText, breakdownText, fullBadgeText }
    } else {
      const fullBadgeText =
        lang === 'bn' ? `📦 পরিমাণ: ${totalWeightText}` : `📦 Weight: ${totalWeightText}`
      return { totalWeightText, breakdownText: '', fullBadgeText }
    }
  }

  // Non-kg items (piece, packet, bundle, etc.)
  const uEn = unit
  const uBn =
    unit === 'packet' || unit === 'pkt'
      ? 'প্যাকেট'
      : unit === 'piece' || unit === 'pc'
      ? 'পিস'
      : unit === 'bunch' || unit === 'bundle'
      ? 'আঁটি'
      : unit
  const unitName = lang === 'bn' ? uBn : uEn
  const qtyStr = lang === 'bn' ? toBnDigits(qty) : String(qty)

  const totalWeightText = `${qtyStr} ${unitName}`
  const fullBadgeText =
    lang === 'bn' ? `📦 মোট: ${totalWeightText}` : `📦 Total: ${totalWeightText}`
  return { totalWeightText, breakdownText: '', fullBadgeText }
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
const IS_DEV = import.meta.env.DEV

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

/** Checks if a pending order is older than timeout hours without confirmation */
export function isOrderStalePending(
  order: { createdAt: string; status: string },
  timeoutHours = STALE_PENDING_ORDER_TIMEOUT_HOURS,
): boolean {
  if (order.status !== 'pending') return false
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

/**
 * Generates an executive-level WhatsApp link for bulk/wholesale orders (₹10,000+)
 */
export function createBulkOrderWhatsAppUrl(params: {
  customerName?: string
  customerPhone?: string
  cartTotal: number
  items: Array<{ name: string; grade: string; qty: number; unitPrice: number; weightLabel?: string }>
  lang?: 'en' | 'bn'
}): string {
  const isBn = params.lang === 'bn'
  const lines: string[] = []

  if (isBn) {
    lines.push(`🏢 *পাইকারি / বাল্ক অর্ডার অনুসন্ধান* (₹১০,০০০+)`)
    lines.push(`স্টোর: ${STORE_NAME}`)
    if (params.customerName) {
      lines.push(`👤 ক্রেতা: ${params.customerName}${params.customerPhone ? ` (${params.customerPhone})` : ''}`)
    }
    lines.push(`💰 বর্তমান আনুমানিক মূল্য: ₹${params.cartTotal.toLocaleString('en-IN')}`)
    lines.push(`\n📦 অর্ডারের পণ্যের তালিকা:`)
    params.items.slice(0, 15).forEach((it) => {
      const wLbl = it.weightLabel ? ` [${it.weightLabel}]` : ''
      lines.push(`• ${it.name}${wLbl} (Grade ${it.grade}) × ${it.qty} = ₹${it.unitPrice * it.qty}`)
    })
    if (params.items.length > 15) {
      lines.push(`... এবং আরও ${params.items.length - 15}টি পণ্য`)
    }
    lines.push(`\n💬 "নমস্কার, আমি ₹১০,০০০-এর বেশি বাল্ক অর্ডারের জন্য যোগাযোগ করছি। অনুগ্রহ করে পাইকারি রেট, বিশেষ ছাড় ও ডেলিভারির সুবিধা জানান।"`)
  } else {
    lines.push(`🏢 *Bulk / Wholesale Order Inquiry* (₹10,000+)`)
    lines.push(`Store: ${STORE_NAME}`)
    if (params.customerName) {
      lines.push(`👤 Customer: ${params.customerName}${params.customerPhone ? ` (${params.customerPhone})` : ''}`)
    }
    lines.push(`💰 Estimated Total: ₹${params.cartTotal.toLocaleString('en-IN')}`)
    lines.push(`\n📦 Order Items:`)
    params.items.slice(0, 15).forEach((it) => {
      const wLbl = it.weightLabel ? ` [${it.weightLabel}]` : ''
      lines.push(`• ${it.name}${wLbl} (Grade ${it.grade}) × ${it.qty} = ₹${it.unitPrice * it.qty}`)
    })
    if (params.items.length > 15) {
      lines.push(`... and ${params.items.length - 15} more items`)
    }
    lines.push(`\n💬 "Hello, I am looking to place a bulk order above ₹10,000. Please provide the wholesale quotation, bulk discount, and delivery schedule."`)
  }

  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(lines.join('\n'))}`
}

// ── Premium Order Date, Time & Delivery Slot Decorators ───────────────
const BN_MONTHS = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে']
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const BN_DAYS = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি']
const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Formats timestamp to clean 12-hour AM/PM string (e.g. "03:27 PM" or "০৩:২৭ PM") */
export function formatOrderTime(isoOrDate: string | Date | undefined, lang: 'en' | 'bn' = 'en'): string {
  if (!isoOrDate) return ''
  const d = new Date(isoOrDate)
  if (isNaN(d.getTime())) return ''
  let hours = d.getHours()
  const mins = d.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  if (hours === 0) hours = 12
  const formattedHours = hours < 10 ? `0${hours}` : `${hours}`
  const formattedMins = mins < 10 ? `0${mins}` : `${mins}`
  const timeStr = `${formattedHours}:${formattedMins} ${ampm}`
  return lang === 'bn' ? toBnDigits(timeStr) : timeStr
}

/** Formats date into contextual calendar label (e.g. "Today", "Yesterday", "24 Sep", or Bengali) */
export function formatOrderDate(isoOrDate: string | Date | undefined, lang: 'en' | 'bn' = 'en'): string {
  if (!isoOrDate) return ''
  const d = new Date(isoOrDate)
  if (isNaN(d.getTime())) return ''
  const now = new Date()

  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (isSameDay) {
    return lang === 'bn' ? 'আজ' : 'Today'
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  if (isYesterday) {
    return lang === 'bn' ? 'গতকাল' : 'Yesterday'
  }

  const day = d.getDate()
  const monthIdx = d.getMonth()
  const year = d.getFullYear()
  if (lang === 'bn') {
    return `${toBnDigits(day)} ${BN_MONTHS[monthIdx]}${year !== now.getFullYear() ? ` ${toBnDigits(year)}` : ''}`
  }
  return `${day} ${EN_MONTHS[monthIdx]}${year !== now.getFullYear() ? ` ${year}` : ''}`
}

/** Formats relative time (e.g. "Just now", "5m ago", "2h ago", or Bengali) */
export function formatRelativeTime(isoOrDate: string | Date | undefined, lang: 'en' | 'bn' = 'en'): string {
  if (!isoOrDate) return ''
  const d = new Date(isoOrDate)
  if (isNaN(d.getTime())) return ''
  const diffSecs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (diffSecs < 60) {
    return lang === 'bn' ? 'এইমাত্র' : 'Just now'
  }
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) {
    return lang === 'bn' ? `${toBnDigits(diffMins)} মি আগে` : `${diffMins}m ago`
  }
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) {
    return lang === 'bn' ? `${toBnDigits(diffHours)} ঘণ্টা আগে` : `${diffHours}h ago`
  }
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) {
    return lang === 'bn' ? `${toBnDigits(diffDays)} দিন আগে` : `${diffDays}d ago`
  }
  return formatOrderDate(d, lang)
}

/** Formats delivery slot date into human-readable decorated pill */
export function formatDeliverySlot(deliveryDate: string | undefined, lang: 'en' | 'bn' = 'en'): { label: string; isScheduled: boolean } {
  if (!deliveryDate || deliveryDate === 'standard') {
    return {
      label: lang === 'bn' ? '⚡ দ্রুত (১২–২৪ ঘণ্টা)' : '⚡ Standard (12–24h)',
      isScheduled: false,
    }
  }

  const parts = deliveryDate.split('-').map(Number)
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    const d = new Date(parts[0], parts[1] - 1, parts[2])
    if (!isNaN(d.getTime())) {
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      const target = new Date(d)
      target.setHours(0, 0, 0, 0)
      const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      const day = d.getDate()
      const mIdx = d.getMonth()
      const dayOfWeek = d.getDay()

      if (diffDays === 0) {
        return {
          label: lang === 'bn' ? '📅 আজ ডেলিভারি' : '📅 Today Delivery',
          isScheduled: true,
        }
      } else if (diffDays === 1) {
        return {
          label: lang === 'bn' ? '📅 আগামীকাল ডেলিভারি' : '📅 Tomorrow Delivery',
          isScheduled: true,
        }
      } else {
        const formattedDate = lang === 'bn'
          ? `📅 ${toBnDigits(day)} ${BN_MONTHS[mIdx]} (${BN_DAYS[dayOfWeek]})`
          : `📅 ${day} ${EN_MONTHS[mIdx]} (${EN_DAYS[dayOfWeek]})`
        return {
          label: formattedDate,
          isScheduled: true,
        }
      }
    }
  }

  return {
    label: `📅 ${deliveryDate}`,
    isScheduled: true,
  }
}

/** Comprehensive order timestamp decorator returning all display facets */
export function formatOrderTimestamp(isoOrDate: string | Date | undefined, lang: 'en' | 'bn' = 'en') {
  const timeStr = formatOrderTime(isoOrDate, lang)
  const dateStr = formatOrderDate(isoOrDate, lang)
  const relativeStr = formatRelativeTime(isoOrDate, lang)
  const fullDecorated = `${dateStr}, ${timeStr}`
  return { timeStr, dateStr, relativeStr, fullDecorated }
}

