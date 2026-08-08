/** Central business / contact / payment config for production. */
const env = (key: string, fallback: string) => {
  const v = import.meta.env[key] as string | undefined
  return v && v.trim() ? v.trim() : fallback
}

export const MIN_ORDER_AMOUNT = 500
export const DELIVERY_WINDOW = '12–24 hours'
export const DELIVERY_WINDOW_BN = '১২–২৪ ঘণ্টা'
export const ADVANCE_PERCENT = 50
/** Alert seller when stockQty is at or below this (and item is in stock). */
export const LOW_STOCK_QTY = 5

export const DELIVERY_SLOTS = {
  morning: { en: 'Morning (8 AM – 12 PM)', bn: 'সকাল (৮টা – ১২টা)' },
  evening: { en: 'Evening (4 PM – 8 PM)', bn: 'সন্ধ্যা (৪টা – ৮টা)' },
} as const

export const SEASON_LABELS = {
  all: { en: 'All season', bn: 'সব সিজন' },
  summer: { en: 'Summer', bn: 'গ্রীষ্ম' },
  winter: { en: 'Winter', bn: 'শীত' },
  rainy: { en: 'Rainy', bn: 'বর্ষা' },
} as const

/** Display phone. */
export const SUPPORT_PHONE = env('VITE_SUPPORT_PHONE', '+91 8170859653')
/** WhatsApp deep-link number: country code + digits, no + or spaces. */
export const SUPPORT_WHATSAPP = env('VITE_SUPPORT_WHATSAPP', '918170859653')
export const SUPPORT_EMAIL = env('VITE_SUPPORT_EMAIL', 'greenvest.orders@gmail.com')
export const SUPPORT_HOURS = env('VITE_SUPPORT_HOURS', '7:00 AM – 8:00 PM')

/** @deprecated use SUPPORT_WHATSAPP */
export const SELLER_WHATSAPP = SUPPORT_WHATSAPP

export const UPI_ID = env('VITE_UPI_ID', '8170859653-2@ybl')
export const UPI_BANK = env('VITE_UPI_BANK', 'State Bank of India ····9764')
const assetBase = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
export const UPI_QR_SRC = env('VITE_UPI_QR_SRC', `${assetBase}upi-qr.png`)

/** True only during `npm run dev` — allows localStorage fallback. */
export const IS_DEV = import.meta.env.DEV

/** Local offline shop allowed only in development. */
export const ALLOW_LOCAL_FALLBACK = IS_DEV
