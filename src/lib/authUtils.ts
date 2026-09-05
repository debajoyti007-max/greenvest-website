/**
 * Pure utility functions for auth identifier normalisation.
 * Extracted here so they can be imported by both AuthContext and api.ts
 * without triggering React Fast Refresh warnings (non-component exports
 * must not live in component/context files).
 */

/** Lower-case trim and collapse internal whitespace. */
export function normalizeText(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Converts a raw phone number into the synthetic email format used by
 * GreenVest's custom auth: "8170859653" → "8170859653@greenvest.shop"
 * Plain email addresses are returned unchanged (lowercased + trimmed).
 */
export function formatAuthIdentifier(input: string): string {
  const trimmed = normalizeText(input)
  const digitsOnly = trimmed.replace(/\D/g, '')
  if (digitsOnly.length >= 10 && !trimmed.includes('@')) {
    const last10 = digitsOnly.slice(-10)
    return `${last10}@greenvest.shop`
  }
  return trimmed
}

/**
 * Robust phone extractor for stored profiles and synthetic phone emails.
 * Returns the last 10 digits, or undefined when no valid phone is found.
 */
export function extractPhone(phone?: string | null, email?: string | null): string | undefined {
  if (phone && phone.trim()) {
    const digits = phone.replace(/\D/g, '')
    if (digits.length >= 10) return digits.slice(-10)
  }
  if (email && email.endsWith('@greenvest.shop')) {
    const digits = email.replace('@greenvest.shop', '').replace(/\D/g, '')
    if (digits.length >= 10) return digits.slice(-10)
  }
  return undefined
}
