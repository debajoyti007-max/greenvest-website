import { SEED_PRODUCTS, ensureAllSeedProducts } from '../data/seed'
import { initCacheGuard, safeJsonParse } from './cacheManager'
import type { CartItem, DeliverySlot, Lang, Order, Product, User } from '../types'

// Automatically check and clean deprecated/corrupted cache on boot
initCacheGuard()

const KEYS = {
  users: 'gv_users',
  products: 'gv_products',
  orders: 'gv_orders',
  cart: 'gv_cart',
  session: 'gv_session',
  lang: 'gv_lang',
  seeded: 'gv_seeded',
  delivery: 'gv_delivery',
} as const

export const STORE_EVENT = 'greenvest-store-update'

// ── PIN Storage (no Supabase schema change needed) ─────────────────────────
// PINs are stored in localStorage keyed by lowercase email.
// This works independently of the Supabase profiles table schema.
const PINS_KEY = 'gv_pins'

export function getStoredPin(email: string): string {
  try {
    const pins = safeJsonParse<Record<string, string>>(localStorage.getItem(PINS_KEY), {})
    return pins[email.toLowerCase()] || ''
  } catch { return '' }
}

export function storePin(email: string, pin: string): void {
  try {
    const pins = safeJsonParse<Record<string, string>>(localStorage.getItem(PINS_KEY), {})
    pins[email.toLowerCase()] = pin
    localStorage.setItem(PINS_KEY, JSON.stringify(pins))
  } catch {}
}

export function removePin(email: string): void {
  try {
    const pins = safeJsonParse<Record<string, string>>(localStorage.getItem(PINS_KEY), {})
    delete pins[email.toLowerCase()]
    localStorage.setItem(PINS_KEY, JSON.stringify(pins))
  } catch {}
}

// Module-level flag so ensureSeeded() is a true no-op after the first run.
// This stops the localStorage read/write/event cascade on every render.
let _seeded = false

export type SavedDelivery = {
  address: string
  phone: string
  pin: string
  deliverySlot?: DeliverySlot
}

import { idbSet, idbGet } from './indexedDb'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw && typeof window !== 'undefined') {
      // Trigger background auto-restore from IndexedDB if localStorage was cleared
      void idbGet<T | null>(key, null).then((idbVal) => {
        if (idbVal !== null && idbVal !== undefined) {
          try {
            localStorage.setItem(key, JSON.stringify(idbVal))
            window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key } }))
          } catch {}
        }
      })
    }
    return safeJsonParse<T>(raw, fallback)
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key } }))
  } catch (e) {
    console.warn(`localStorage write failed for key ${key}:`, e)
  }
  // Resilient dual-write to IndexedDB deep storage
  void idbSet(key, value)
}

// ⚠️ Only the admin seed entry is kept here — for LOCAL fallback mode only.
// Real user accounts must NOT be hardcoded — they live in Supabase Auth.
// Identity is read from environment variables; never store real data in source.
const _adminEmail = import.meta.env.VITE_SUPER_ADMIN_EMAIL ?? ''
const _adminPhone = (import.meta.env.VITE_SUPER_ADMIN_PHONE ?? '').replace(/\D/g, '')
export const DEFAULT_USERS: User[] = _adminEmail
  ? [
      {
        id: 'admin-local-seed',
        name: 'Admin',
        email: _adminEmail,
        role: 'admin',
        phone: _adminPhone || undefined,
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ]
  : []

/** Local catalog & user accounts bootstrap. */
export function ensureSeeded() {
  // Fast-path: already done this session — no reads, writes, or events
  if (_seeded) return

  const existingUsers = read<User[]>(KEYS.users, [])
  const map = new Map<string, User>()
  DEFAULT_USERS.forEach((u) => map.set(u.email.toLowerCase(), u))
  existingUsers.forEach((u) => map.set(u.email.toLowerCase(), u))
  const mergedUsers = Array.from(map.values())
  write(KEYS.users, mergedUsers)

  if (localStorage.getItem(KEYS.seeded) === '1') {
    const products = read<Product[]>(KEYS.products, [])
    const merged = ensureAllSeedProducts(products)
    if (merged.length !== products.length) {
      write(KEYS.products, merged)
    }
    _seeded = true
    return
  }
  write(KEYS.products, SEED_PRODUCTS)
  write(KEYS.orders, [] as Order[])
  write(KEYS.cart, [] as CartItem[])
  localStorage.setItem(KEYS.seeded, '1')
  _seeded = true
}

export function getUsers(): User[] {
  ensureSeeded()
  const list = read<User[]>(KEYS.users, DEFAULT_USERS)
  return list.length > 0 ? list : DEFAULT_USERS
}

export function saveUsers(users: User[]) {
  write(KEYS.users, users)
}

export function getProducts(): Product[] {
  const stored = read<Product[]>(KEYS.products, SEED_PRODUCTS)
  return stored.length > 0 ? stored : SEED_PRODUCTS
}

export function saveProducts(products: Product[]) {
  write(KEYS.products, products)
}

export function getOrders(): Order[] {
  const all = read<Order[]>(KEYS.orders, [])
  const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000
  const valid = all.filter((o) => {
    if (o.status === 'cancelled') {
      const time = new Date(o.updatedAt || o.createdAt).getTime()
      if (time < eightHoursAgo) return false
    }
    return true
  })
  if (valid.length !== all.length) {
    write(KEYS.orders, valid)
  }
  return valid
}

export function saveOrders(orders: Order[]) {
  // Cap local cache to latest 50 orders to guarantee 5MB browser quota is never exceeded
  const capped = orders.slice(0, 50)
  write(KEYS.orders, capped)
}

export function getCart(userId?: string | null): CartItem[] {
  const activeId = userId !== undefined ? userId : getSessionUserId()
  const key = activeId ? `${KEYS.cart}_${activeId}` : KEYS.cart
  return read(key, [])
}

export function saveCart(cart: CartItem[], userId?: string | null) {
  const activeId = userId !== undefined ? userId : getSessionUserId()
  const key = activeId ? `${KEYS.cart}_${activeId}` : KEYS.cart
  // write() already dispatches STORE_EVENT — no second dispatch needed
  write(key, cart)
}

export function getSessionUserId(): string | null {
  return localStorage.getItem(KEYS.session)
}

export function setSessionUserId(id: string | null) {
  if (id) localStorage.setItem(KEYS.session, id)
  else localStorage.removeItem(KEYS.session)
  window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key: KEYS.session } }))
}

export function getLang(): Lang {
  const saved = localStorage.getItem(KEYS.lang) as Lang | null
  if (saved === 'en' || saved === 'bn') return saved
  return 'bn'
}

export function setLang(lang: Lang) {
  localStorage.setItem(KEYS.lang, lang)
  window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key: KEYS.lang } }))
}

export function getSavedDelivery(userId: string): SavedDelivery | null {
  if (!userId) return null
  return read<SavedDelivery | null>(`${KEYS.delivery}:${userId}`, null)
}

export function saveDelivery(userId: string, data: SavedDelivery) {
  if (!userId) return
  write(`${KEYS.delivery}:${userId}`, {
    address: data.address.trim(),
    phone: data.phone.trim(),
    pin: data.pin.replace(/\D/g, ''),
    deliverySlot: data.deliverySlot,
  })
}

export function uid(prefix = 'id') {
  if (prefix === 'ord') {
    const num = Math.floor(100000 + Math.random() * 900000)
    return `ORD-${num}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function getAppNotifications(): import('../types').AppNotification[] {
  return read<import('../types').AppNotification[]>('gv_app_notifications', [])
}

export function saveAppNotifications(notifications: import('../types').AppNotification[]) {
  write('gv_app_notifications', notifications)
}

export function getStoredSupportMessages(): import('../types').SupportMessage[] {
  return read<import('../types').SupportMessage[]>('gv_support_messages', [])
}

export function saveStoredSupportMessages(messages: import('../types').SupportMessage[]) {
  write('gv_support_messages', messages)
}

