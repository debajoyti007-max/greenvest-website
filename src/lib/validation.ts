/**
 * Anti-Fraud & Strict Validation Suite for GreenVest
 * Handles:
 * - 12-digit authentic UPI UTR / RRN validation
 * - Common dummy & prank test sequence blacklists
 * - Strict 10-digit Indian mobile number validation
 * - Client-side Idempotency and duplicate order recovery
 */

import { cleanDigits } from './phone'

// Common fake / dummy sequences used by pranksters and test users
const BANNED_UTR_PATTERNS = [
  /^(\d)\1{11}$/, // All same digit: 000000000000, 111111111111, 999999999999
  /^1234567890\d{2}$/, // 123456789012, 123456789000
  /^0123456789\d{2}$/, // 012345678901
  /^9876543210\d{2}$/, // 987654321098
  /^112233445566$/,
  /^123412341234$/,
  /^000011112222$/,
  /^121212121212$/,
  /^998877665544$/,
]

const BANNED_PHONE_PATTERNS = [
  /^(\d)\1{9}$/, // 9999999999, 8888888888, 7777777777, 0000000000
  /^1234567890$/,
  /^9876543210$/,
  /^9876598765$/,
  /^9000000000$/,
]

export interface ValidationResult {
  isValid: boolean
  errorBn: string
  errorEn: string
  cleanedValue: string
}

/**
 * Validates authentic 12-digit Indian UPI UTR / RRN numbers.
 * Reject alphabetic letters, length != 12, and known dummy sequences.
 */
export function validateUtrStrict(input: string): ValidationResult {
  const raw = (input || '').trim()
  const cleaned = cleanDigits(raw)

  if (!raw) {
    return {
      isValid: false,
      errorBn: 'অনুগ্রহ করে ১২ সংখ্যার UTR নম্বর দিন।',
      errorEn: 'Please enter your 12-digit UTR number.',
      cleanedValue: '',
    }
  }

  // Check if non-digits were entered
  if (/[^\d\s-]/.test(raw)) {
    return {
      isValid: false,
      errorBn: 'UTR নম্বরে শুধুমাত্র ১২টি সংখ্যা হতে হবে (কোনো অক্ষর চলবে না)।',
      errorEn: 'UTR must contain only 12 numeric digits (no letters allowed).',
      cleanedValue: cleaned,
    }
  }

  // UPI UTRs in India are strictly 12 digits
  if (cleaned.length !== 12) {
    return {
      isValid: false,
      errorBn: `UTR নম্বর অবশ্যই ১২ সংখ্যার হতে হবে (আপনি দিয়েছেন ${cleaned.length} সংখ্যা)। যেমন: 408123456789`,
      errorEn: `UTR must be exactly 12 digits (you entered ${cleaned.length} digits). e.g. 408123456789`,
      cleanedValue: cleaned,
    }
  }

  // Check blacklist patterns
  for (const pattern of BANNED_UTR_PATTERNS) {
    if (pattern.test(cleaned)) {
      return {
        isValid: false,
        errorBn: 'নকল বা টেস্ট UTR গ্রহণ করা হবে না। আপনার Google Pay/PhonePe-র আসল ১২ সংখ্যার UTR দিন।',
        errorEn: 'Fake or dummy test UTR is not allowed. Please enter your real 12-digit UTR from your UPI app.',
        cleanedValue: cleaned,
      }
    }
  }

  return {
    isValid: true,
    errorBn: '',
    errorEn: '',
    cleanedValue: cleaned,
  }
}

/**
 * Validates either an optional 12-digit UTR or a PhonePe/UPI Payer Name.
 */
export function validatePayerNameOrUtr(input: string): ValidationResult {
  const raw = (input || '').trim()
  if (!raw) {
    return {
      isValid: true,
      errorBn: '',
      errorEn: '',
      cleanedValue: '',
    }
  }

  // If user entered numeric digits and length is 12, run strict UTR checks
  if (/^\d{12}$/.test(raw)) {
    return validateUtrStrict(raw)
  }

  // Clean string for payer name
  const sanitized = raw.replace(/[<>{}[\]\\]/g, '').slice(0, 50)
  return {
    isValid: true,
    errorBn: '',
    errorEn: '',
    cleanedValue: sanitized,
  }
}

/**
 * Validates real 10-digit Indian Mobile numbers (starting with 6, 7, 8, or 9).
 */
export function validatePhoneStrict(input: string): ValidationResult {
  const raw = (input || '').trim()
  let digits = cleanDigits(raw)

  // Strip +91 or leading 0
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2)
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1)
  }

  if (!digits) {
    return {
      isValid: false,
      errorBn: 'অনুগ্রহ করে মোবাইল নম্বর দিন।',
      errorEn: 'Please enter your mobile phone number.',
      cleanedValue: '',
    }
  }

  if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
    return {
      isValid: false,
      errorBn: 'সঠিক ১০ সংখ্যার ভারতীয় মোবাইল নম্বর দিন (৬, ৭, ৮ বা ৯ দিয়ে শুরু)। যেমন: 9876543210',
      errorEn: 'Enter a valid 10-digit Indian phone number (starting with 6, 7, 8, or 9). e.g. 9876543210',
      cleanedValue: digits,
    }
  }

  for (const pattern of BANNED_PHONE_PATTERNS) {
    if (pattern.test(digits)) {
      return {
        isValid: false,
        errorBn: 'নকল ফোন নম্বর গ্রহণ করা হবে না। আপনার আসল মোবাইল নম্বর দিন।',
        errorEn: 'Dummy phone number is not allowed. Please provide your real phone number.',
        cleanedValue: digits,
      }
    }
  }

  return {
    isValid: true,
    errorBn: '',
    errorEn: '',
    cleanedValue: digits,
  }
}

/**
 * Generates an idempotency session key for the current cart to prevent duplicate network hits.
 */
export function getOrCreateCartIdempotencyKey(userId: string, cartTotal: number): string {
  const key = `gv_order_idempotency_${userId}`
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) {
      const parsed = JSON.parse(existing)
      // If generated within the last 5 minutes and matching same total, reuse
      if (Date.now() - parsed.timestamp < 5 * 60 * 1000 && parsed.cartTotal === cartTotal) {
        return parsed.token
      }
    }
  } catch {
    // sessionStorage failed / private browsing
  }

  const newToken = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  try {
    sessionStorage.setItem(key, JSON.stringify({ token: newToken, cartTotal, timestamp: Date.now() }))
  } catch {}

  return newToken
}

/**
 * Clears idempotency session key once order is successfully created.
 */
export function clearCartIdempotencyKey(userId: string): void {
  try {
    sessionStorage.removeItem(`gv_order_idempotency_${userId}`)
  } catch {}
}
