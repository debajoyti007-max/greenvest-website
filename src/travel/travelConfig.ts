// ============================================================
// TWO BHAI TRAVELS — Centralized Configuration
// All contact details, UPI, and brand config in ONE place.
// Client handover = update values here only.
// ============================================================

export const TRAVEL_CONFIG = {
  brandName: 'Two Bhai Travels',
  brandNameBn: 'টু ভাই ট্রাভেলস',
  tagline: 'Your Trusted Highway Partner',
  taglineBn: 'আপনার যাত্রাপথের বিশ্বস্ত সঙ্গী',
  baseLocation: 'Nandakumar, Purba Medinipur, WB',
  basePin: '721632',

  // ⚠️ TESTING NUMBERS — swap at client handover
  primaryPhone: '8170859653',
  displayPhone: '+91 81708 59653',
  whatsappNumber: '918170859653',

  // Payment
  upiId: '8170859653-2@ybl',
  upiName: 'Two Bhai Travels',
  advancePercent: 10,
  minAdvance: 150,

  // Fleet — strictly enforced (never change to 7)
  maxPassengers: 4,
  carLabel: '4-Seater AC Sedan',
} as const

// Popular routes with fixed fare estimates
export const TRAVEL_ROUTES = [
  { id: 'airport', label: 'Kolkata Airport (CCU)', labelBn: 'কলকাতা বিমানবন্দর (CCU)', minFare: 2800, maxFare: 3200 },
  { id: 'howrah',  label: 'Howrah Station (HWH)',  labelBn: 'হাওড়া স্টেশন (HWH)',     minFare: 2200, maxFare: 2500 },
  { id: 'sskm',    label: 'SSKM / Mukundapur Hospital', labelBn: 'SSKM / মুকুন্দপুর হাসপাতাল', minFare: 2400, maxFare: 2800 },
  { id: 'digha',   label: 'Digha / Mandarmani Beach',   labelBn: 'দিঘা / মন্দারমণি সৈকত',      minFare: 2000, maxFare: 2400 },
  { id: 'haldia',  label: 'Haldia Township / Port',     labelBn: 'হলদিয়া টাউনশিপ / বন্দর',    minFare: 1000, maxFare: 1300 },
] as const

// Build a pre-filled WhatsApp booking dispatch message
export function buildWhatsAppBookingMsg(b: {
  bookingCode: string
  customerName: string
  customerPhone: string
  pickupAddress: string
  dropAddress: string
  pickupDate: string
  pickupTime: string
  passengers: number
  estimatedFare: number
  advanceAmount: number
  balanceDue: number
}): string {
  const msg = [
    `🚗 *নতুন ক্যাব বুকিং — Two Bhai Travels*`,
    `📋 বুকিং কোড: *${b.bookingCode}*`,
    `👤 যাত্রী: ${b.customerName} (📞 ${b.customerPhone})`,
    `📍 পিকআপ: ${b.pickupAddress}`,
    `🏁 গন্তব্য: ${b.dropAddress}`,
    `📅 তারিখ: ${b.pickupDate} | ⏰ সময়: ${b.pickupTime}`,
    `👥 যাত্রী সংখ্যা: ${b.passengers} জন | 🚘 4-Seater AC`,
    `💰 আনুমানিক ভাড়া: ₹${b.estimatedFare}`,
    `✅ অগ্রিম পেমেন্ট: ₹${b.advanceAmount} | বাকি: ₹${b.balanceDue}`,
    `⚠️ টোল ও পার্কিং চার্জ আলাদা (রসিদ অনুযায়ী)`,
  ].join('\n')
  return `https://wa.me/${TRAVEL_CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`
}

// Generate human-readable booking code
export function generateBookingCode(): string {
  return `TBT-${Math.floor(100000 + Math.random() * 900000)}`
}

// Compute 10% advance (minimum enforced)
export function computeAdvance(fare: number): number {
  return fare > 0 ? Math.max(TRAVEL_CONFIG.minAdvance, Math.ceil(fare * TRAVEL_CONFIG.advancePercent / 100)) : TRAVEL_CONFIG.minAdvance
}
