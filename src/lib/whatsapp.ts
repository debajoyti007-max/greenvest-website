import type { Order } from '../types'
import { SUPPORT_WHATSAPP } from './business'

/** Build WhatsApp deep-link so seller gets a new-order ping. */
export function sellerOrderWhatsAppUrl(order: Order) {
  const lines = [
    `GreenVest নতুন অর্ডার / New order`,
    `ID: ${order.id}`,
    `নাম: ${order.userName}`,
    `ফোন: ${order.phone}`,
    `ঠিকানা: ${order.address}`,
    `PIN: ${order.pin}`,
    `মোট: ৳${order.total} (অগ্রিম ৳${order.advanceAmount})`,
    `UTR: ${order.utr}`,
    '',
    ...order.items.map(
      (it) => `${it.emoji} ${it.name} ${it.grade} × ${it.qty} = ৳${it.unitPrice * it.qty}`,
    ),
  ]
  const text = encodeURIComponent(lines.join('\n'))
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`
}

export function openSellerOrderWhatsApp(order: Order) {
  const url = sellerOrderWhatsAppUrl(order)
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function supportWhatsAppUrl(message?: string) {
  const text = encodeURIComponent(message || 'Hello GreenVest')
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`
}
