import type { Order } from '../types'
import { SUPPORT_WHATSAPP, formatOrderId } from './business'

export function formatWhatsAppPhone(phone?: string): string {
  if (!phone) return SUPPORT_WHATSAPP
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `91${digits}`
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits
  }
  if (digits.startsWith('0')) {
    return `91${digits.slice(1)}`
  }
  return digits.length > 0 ? digits : SUPPORT_WHATSAPP
}

/** Build WhatsApp deep-link so seller gets a new-order ping. */
export function sellerOrderWhatsAppUrl(order: Order) {
  const shortId = formatOrderId(order.id)
  const lines = [
    `GreenVest নতুন অর্ডার / New order #${shortId}`,
    `ID: ${shortId}`,
    `নাম: ${order.userName}`,
    `ফোন: ${order.phone}`,
    `ঠিকানা: ${order.address}`,
    `PIN: ${order.pin}`,
    `মোট: ₹${order.total} (অগ্রিম ₹${order.advanceAmount})`,
    order.deliverySlot ? `স্লট: ${order.deliverySlot}` : '',
    `UTR: ${order.utr}`,
    `📲 Live Track: https://greenvest.shop/track?id=${shortId}`,
    '',
    ...order.items.map(
      (it) => `${it.emoji} ${it.name} ${it.grade} × ${it.qty} = ₹${it.unitPrice * it.qty}`,
    ),
  ]
  const text = encodeURIComponent(lines.join('\n'))
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`
}

export function openSellerOrderWhatsApp(order: Order) {
  const url = sellerOrderWhatsAppUrl(order)
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** 1-Tap Delivery Rider Dispatch on WhatsApp */
export function riderDispatchWhatsAppUrl(order: Order) {
  const balance = Math.max(0, order.total - order.advanceAmount)
  const shortId = formatOrderId(order.id)
  const lines = [
    `🚛 NEW DELIVERY ASSIGNED`,
    `Order #: ${shortId}`,
    `Customer: ${order.userName} (${order.phone})`,
    `Address: ${order.address} (PIN ${order.pin})`,
    `Delivery Slot: ${order.deliverySlot || 'Standard'}`,
    `Collect Balance: ₹${balance} (${balance > 0 ? 'Collect on delivery' : 'Fully Paid'})`,
    `📲 Live Track: https://greenvest.shop/track?id=${shortId}`,
    ``,
    `Items to deliver:`,
    ...order.items.map((it) => `• ${it.emoji} ${it.name} (Grade ${it.grade}) × ${it.qty}`),
  ]
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`
}

/** Payment Verified WhatsApp message to customer */
export function paymentVerifiedWhatsAppUrl(order: Order, lang: 'en' | 'bn' = 'en') {
  const phone = formatWhatsAppPhone(order.phone)
  const shortId = formatOrderId(order.id)
  const trackLink = `https://greenvest.shop/track?id=${shortId}`
  const text =
    lang === 'bn'
      ? `✅ পেমেন্ট নিশ্চিত হয়েছে!\nনমস্কার ${order.userName}, আপনার অর্ডার ${shortId}-এর পেমেন্ট যাচাই করা হয়েছে (মোট ₹${order.total})। তাজা সবজি প্যাক করা হচ্ছে!\n📲 লাইভ ট্র্যাক করুন: ${trackLink}`
      : `✅ Payment Verified!\nHi ${order.userName}, your payment for Order #${shortId} (₹${order.total}) has been verified! We are packing your fresh produce now.\n📲 Live Tracking: ${trackLink}`
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

export function supportWhatsAppUrl(message?: string) {
  const text = encodeURIComponent(message || 'Hello GreenVest')
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`
}

export function orderStatusWhatsAppUrl(order: Order, status: import('../types').OrderStatus) {
  const phone = formatWhatsAppPhone(order.phone)
  const shortId = formatOrderId(order.id)
  const trackLink = `https://greenvest.shop/track?id=${shortId}`
  let msg = ''
  if (status === 'confirmed') {
    msg = `✅ Order #${shortId} Confirmed!\nHi ${order.userName}, your order has been confirmed. We are preparing fresh produce.\n📲 Live Tracking: ${trackLink}`
  } else if (status === 'delivered') {
    const bal = Math.max(0, order.total - order.advanceAmount)
    msg = `🚚 Order #${shortId} Delivered!\nHi ${order.userName}, your order has been delivered successfully. ${bal > 0 ? `Balance collected: ₹${bal}.` : ''}\n📲 Order Details: ${trackLink}\nThank you!`
  } else if (status === 'cancelled') {
    msg = `❌ Order #${shortId} Cancelled.\nHi ${order.userName}, your order #${shortId} was cancelled. Refund of ₹${order.advanceAmount} will be processed.`
  }
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
}
