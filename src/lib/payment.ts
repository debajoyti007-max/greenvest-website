import QRCode from 'qrcode'
import { UPI_ID } from './business'

/** Re-export payment details from site business config. */
export { UPI_BANK, UPI_ID, UPI_QR_SRC } from './business'

/**
 * Builds a standard NPCI UPI URI with exact amount and store name.
 * e.g. upi://pay?pa=8170859653-2@ybl&pn=GreenVest&am=340.00&cu=INR&tn=GreenVest_Fresh_Order
 */
export function buildUpiPayUri(amount: number, note = 'GreenVest Fresh Order'): string {
  const cleanPa = (UPI_ID || '').trim()
  const cleanPn = encodeURIComponent('GreenVest Fresh')
  const cleanAm = Math.max(1, amount).toFixed(2)
  const cleanTn = encodeURIComponent(note)
  return `upi://pay?pa=${cleanPa}&pn=${cleanPn}&am=${cleanAm}&cu=INR&tn=${cleanTn}`
}

/**
 * Generates an in-memory Dynamic UPI QR Code data URI with exact amount.
 * 0 files saved to disk, 0 database storage, calculated on the fly.
 */
export async function generateDynamicUpiQr(amount: number, note?: string): Promise<string> {
  const uri = buildUpiPayUri(amount, note)
  try {
    return await QRCode.toDataURL(uri, {
      width: 280,
      margin: 1,
      color: {
        dark: '#0f2a1a', // GreenVest deep forest ink
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
  } catch (err) {
    console.warn('Failed to generate dynamic UPI QR, falling back to static:', err)
    return ''
  }
}
