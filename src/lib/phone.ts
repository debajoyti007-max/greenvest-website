/** Utility functions for validating and formatting Indian mobile numbers. */

export function cleanDigits(input: string): string {
  return input.replace(/\D/g, '')
}

export function isValidIndianPhone(input: string): boolean {
  const digits = cleanDigits(input)
  if (digits.length === 10) {
    return /^[6-9]\d{9}$/.test(digits)
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return /^91[6-9]\d{9}$/.test(digits)
  }
  return false
}

export function formatPhoneDisplay(input: string): string {
  const digits = cleanDigits(input)
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    const raw10 = digits.slice(2)
    return `+91 ${raw10.slice(0, 5)} ${raw10.slice(5)}`
  }
  return input.trim()
}
