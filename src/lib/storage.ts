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

// ── PIN Storage (sessionStorage + localStorage fallback for seamless persistent auth) ──
const PINS_KEY = 'gv_pins'

function readPinStore(): Record<string, string> {
  try {
    const sessionPins = safeJsonParse<Record<string, string>>(sessionStorage.getItem(PINS_KEY), {})
    if (sessionPins && Object.keys(sessionPins).length > 0) {
      return sessionPins
    }
    return safeJsonParse<Record<string, string>>(localStorage.getItem(PINS_KEY), {})
  } catch {
    return {}
  }
}

function writePinStore(pins: Record<string, string>): void {
  try {
    const json = JSON.stringify(pins)
    sessionStorage.setItem(PINS_KEY, json)
    localStorage.setItem(PINS_KEY, json)
  } catch {}
}

export function getStoredPin(identifier: string): string {
  if (!identifier) return ''
  const pins = readPinStore()
  return pins[identifier.toLowerCase()] || ''
}

export function storePin(identifier: string, pin: string): void {
  if (!identifier || !pin) return
  const pins = readPinStore()
  const lower = identifier.toLowerCase()
  pins[lower] = pin

  // If identifier is a 10-digit phone, also alias greenvest.shop email
  const digits = identifier.replace(/\D/g, '').slice(-10)
  if (digits.length === 10) {
    pins[digits] = pin
    pins[`${digits}@greenvest.shop`] = pin
  }
  if (lower.endsWith('@greenvest.shop')) {
    const p = lower.replace('@greenvest.shop', '').replace(/\D/g, '').slice(-10)
    if (p.length === 10) pins[p] = pin
  }

  writePinStore(pins)
}

/** Clear all cached PINs (call on logout). */
export function clearStoredPins(): void {
  try {
    sessionStorage.removeItem(PINS_KEY)
    localStorage.removeItem(PINS_KEY)
  } catch {}
  void idbDelete(PINS_KEY)
}

export function getActiveUserPin(user?: { id?: string; email?: string; phone?: string } | null): string {
  if (!user) return ''
  if (user.id) {
    const pin = getStoredPin(user.id)
    if (pin) return pin
  }
  if (user.phone) {
    const pin = getStoredPin(user.phone)
    if (pin) return pin
    const cleanPhone = user.phone.replace(/\D/g, '').slice(-10)
    if (cleanPhone) {
      const pin2 = getStoredPin(cleanPhone)
      if (pin2) return pin2
    }
  }
  if (user.email) {
    const pin = getStoredPin(user.email)
    if (pin) return pin
  }
  return ''
}

// Module-level flag so ensureSeeded() is a true no-op after the first run.
// This stops the localStorage read/write/event cascade on every render.
let _seeded = false

export type SavedDelivery = {
  address: string
  phone: string
  pin: string
  deliverySlot?: DeliverySlot
  geoLat?: number
  geoLng?: number
  landmark?: string
}

import { idbSet, idbGet, idbDelete } from './indexedDb'

const SENSITIVE_AUTH_KEYS = new Set<string>(['gv_current_user', 'gv_session', 'gv_pins'])

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw && typeof window !== 'undefined' && !SENSITIVE_AUTH_KEYS.has(key)) {
      // Trigger background auto-restore from IndexedDB ONLY for non-auth data (catalog, orders, app settings)
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

// Admin identity is verified via Supabase database (is_super_admin column).
// No personal data is seeded from env vars into the JS bundle.
const DEFAULT_USERS: User[] = []

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

const CURRENT_USER_KEY = 'gv_current_user'

export function getCurrentUser(): User | null {
  return read<User | null>(CURRENT_USER_KEY, null)
}

export function saveCurrentUser(user: User | null): void {
  if (user) {
    write(CURRENT_USER_KEY, user)
    setSessionUserId(user.id)
  } else {
    try {
      localStorage.removeItem(CURRENT_USER_KEY)
    } catch {}
    void idbDelete(CURRENT_USER_KEY)
    setSessionUserId(null)
    window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key: CURRENT_USER_KEY } }))
  }
}

export function getSessionUserId(): string | null {
  return localStorage.getItem(KEYS.session)
}

export function setSessionUserId(id: string | null) {
  if (id) {
    localStorage.setItem(KEYS.session, id)
  } else {
    try {
      localStorage.removeItem(KEYS.session)
    } catch {}
    void idbDelete(KEYS.session)
  }
  window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key: KEYS.session } }))
}

/** Deep wipe of all persistent authentication and session data across storage systems */
export async function clearAllAuthSessionData(): Promise<void> {
  try {
    localStorage.removeItem(CURRENT_USER_KEY)
    localStorage.removeItem(KEYS.session)
    localStorage.removeItem(PINS_KEY)
    sessionStorage.removeItem(PINS_KEY)
    sessionStorage.removeItem('gv_pending_coupon')
  } catch {}

  // Await IndexedDB deletion to guarantee zero resurrection upon refresh
  await Promise.allSettled([
    idbDelete(CURRENT_USER_KEY),
    idbDelete(KEYS.session),
    idbDelete(PINS_KEY),
  ])

  // Wipe all Supabase auth tokens and idempotency keys
  try {
    const toRemoveLocal: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('sb-') || k.includes('auth-token') || k.startsWith('gv_order_idempotency_'))) {
        toRemoveLocal.push(k)
      }
    }
    toRemoveLocal.forEach((k) => {
      localStorage.removeItem(k)
      void idbDelete(k)
    })

    const toRemoveSession: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && (k.startsWith('sb-') || k.includes('auth-token') || k.startsWith('gv_order_idempotency_'))) {
        toRemoveSession.push(k)
      }
    }
    toRemoveSession.forEach((k) => sessionStorage.removeItem(k))
  } catch {}

  window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key: CURRENT_USER_KEY } }))
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
    geoLat: data.geoLat,
    geoLng: data.geoLng,
    landmark: data.landmark?.trim(),
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

