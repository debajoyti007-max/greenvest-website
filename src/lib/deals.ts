import type { PromotionalDeal } from '../types'

export const DEALS_STORAGE_KEY = 'gv_promotional_deals_v1'

export const DEAL_GRADIENTS = [
  { label: 'Emerald Forest (Default)', value: 'linear-gradient(135deg, #15803d 0%, #166534 100%)' },
  { label: 'Teal Meadow', value: 'linear-gradient(135deg, #047857 0%, #065f46 100%)' },
  { label: 'Sunset Amber', value: 'linear-gradient(135deg, #b45309 0%, #78350f 100%)' },
  { label: 'Royal Violet', value: 'linear-gradient(135deg, #6b21a8 0%, #4c1d95 100%)' },
  { label: 'Crimson Rose', value: 'linear-gradient(135deg, #be123c 0%, #881337 100%)' },
  { label: 'Deep Indigo', value: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)' },
]

export const DEFAULT_PROMOTIONAL_DEALS: PromotionalDeal[] = [
  {
    id: 'deal-first50',
    badgeBn: 'নতুন কাস্টমার স্পেশাল',
    badgeEn: 'New Customer Special',
    titleBn: 'প্রথম অর্ডারে ₹৫০ ফ্ল্যাট ছাড়!',
    titleEn: 'Flat ₹50 OFF on your first order!',
    subtitleBn: 'মিনিমাম ₹৫০০ অর্ডারে ₹৫০ ছাড়',
    subtitleEn: 'Flat ₹50 OFF on min order ₹500',
    couponCode: 'FIRST50',
    buttonTextBn: 'কপি কোড',
    buttonTextEn: 'Copy Code',
    bgGradient: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
    emoji: '🔥',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'deal-fresh10',
    badgeBn: 'দৈনিক তাজা অফার',
    badgeEn: 'Daily Fresh Deal',
    titleBn: 'মন্ডি-তাজা সবজিতে অতিরিক্ত ১০% ছাড়!',
    titleEn: 'Extra 10% OFF on Mandi Fresh produce!',
    subtitleBn: 'সবজির মোট মূল্যে ১০% ছাড়',
    subtitleEn: '10% discount on entire cart',
    couponCode: 'FRESH10',
    buttonTextBn: 'কপি কোড',
    buttonTextEn: 'Copy Code',
    bgGradient: 'linear-gradient(135deg, #047857 0%, #065f46 100%)',
    emoji: '🥬',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'deal-mandi20',
    badgeBn: 'সাপ্তাহিক হাট অফার',
    badgeEn: 'Weekly Haat Offer',
    titleBn: '₹১০০০+ অর্ডারে ফ্রি উপহার ও ক্যাশব্যাক!',
    titleEn: 'Free Delivery + Gift on ₹1000+ orders!',
    subtitleBn: '₹১০০০ অর্ডারে ₹১০০ ইনস্ট্যান্ট কুপন ছাড়',
    subtitleEn: '₹100 instant discount on ₹1000+',
    couponCode: 'MANDI20',
    buttonTextBn: 'কপি কোড',
    buttonTextEn: 'Copy Code',
    bgGradient: 'linear-gradient(135deg, #b45309 0%, #78350f 100%)',
    emoji: '🎉',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
]

export function isDealExpired(deal: PromotionalDeal): boolean {
  if (!deal.expiresAt) return false
  const expTime = new Date(deal.expiresAt).getTime()
  if (isNaN(expTime)) return false
  return Date.now() > expTime
}

/** Formats live countdown string for deals with expiresAt */
export function formatDealTimeRemaining(expiresAt: string, lang: 'bn' | 'en' = 'bn'): string {
  const expTime = new Date(expiresAt).getTime()
  if (isNaN(expTime)) return ''
  const diff = expTime - Date.now()
  if (diff <= 0) return lang === 'bn' ? 'অফার শেষ' : 'Expired'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    const remHours = hours % 24
    return lang === 'bn' ? `${days} দিন ${remHours} ঘণ্টা বাকি` : `${days}d ${remHours}h left`
  }

  if (hours > 0) {
    return lang === 'bn'
      ? `${hours} ঘণ্টা ${minutes} মিনিট বাকি`
      : `${hours}h ${minutes}m left`
  }

  return lang === 'bn'
    ? `${minutes} মি: ${seconds < 10 ? '0' : ''}${seconds} সে:`
    : `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`
}

/** Returns only active non-expired promotional deals for storefront */
export function filterActivePromotionalDeals(deals: PromotionalDeal[]): PromotionalDeal[] {
  return deals.filter((d) => d.isActive !== false && !isDealExpired(d))
}

export function getStoredPromotionalDeals(): PromotionalDeal[] {
  try {
    const raw = localStorage.getItem(DEALS_STORAGE_KEY)
    if (raw === null) return DEFAULT_PROMOTIONAL_DEALS
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed as PromotionalDeal[]
    }
    return DEFAULT_PROMOTIONAL_DEALS
  } catch (e) {
    console.error('Failed to load promotional deals from localStorage', e)
    return DEFAULT_PROMOTIONAL_DEALS
  }
}

export function saveStoredPromotionalDeals(deals: PromotionalDeal[]): void {
  try {
    localStorage.setItem(DEALS_STORAGE_KEY, JSON.stringify(deals))
  } catch (e) {
    console.error('Failed to save promotional deals to localStorage', e)
  }
}

