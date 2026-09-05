/** Utility functions for validating and formatting Indian mobile numbers. */

export function cleanDigits(input: string): string {
  return input.replace(/\D/g, '')
}

export function isValidIndianPhone(input: string): boolean {
  let digits = cleanDigits(input)
  // Strip common Indian prefixes
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2)
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1)
  }
  if (digits.length === 10) {
    return /^[6-9]\d{9}$/.test(digits)
  }
  return false
}
