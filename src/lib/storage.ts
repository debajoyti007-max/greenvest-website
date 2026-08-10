import { SEED_PRODUCTS } from '../data/seed'
import type { CartItem, DeliverySlot, Lang, Order, Product, User } from '../types'

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

export type SavedDelivery = {
  address: string
  phone: string
  pin: string
  deliverySlot?: DeliverySlot
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key } }))
}

/** Local DEV catalog bootstrap (no demo accounts). */
export function ensureSeeded() {
  if (localStorage.getItem(KEYS.seeded) === '1') {
    if (!localStorage.getItem(KEYS.users)) write(KEYS.users, [] as User[])
    const products = read<Product[]>(KEYS.products, [])
    const needsRefresh =
      products.length < SEED_PRODUCTS.length ||
      products.some((p) => !p.bnName || /^[?\s]+$/.test(p.bnName) || !/[\u0980-\u09FF]/.test(p.bnName))
    if (needsRefresh) {
      write(KEYS.products, SEED_PRODUCTS)
    }
    return
  }
  write(KEYS.users, [] as User[])
  write(KEYS.products, SEED_PRODUCTS)
  write(KEYS.orders, [] as Order[])
  write(KEYS.cart, [] as CartItem[])
  localStorage.setItem(KEYS.seeded, '1')
}

export function getUsers(): User[] {
  return read(KEYS.users, [])
}

export function saveUsers(users: User[]) {
  write(KEYS.users, users)
}

export function getProducts(): Product[] {
  return read(KEYS.products, SEED_PRODUCTS)
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
  write(KEYS.orders, orders)
}

export function getCart(): CartItem[] {
  return read(KEYS.cart, [])
}

export function saveCart(cart: CartItem[]) {
  write(KEYS.cart, cart)
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
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function getAppNotifications(): import('../types').AppNotification[] {
  return read<import('../types').AppNotification[]>('gv_app_notifications', [])
}

export function saveAppNotifications(notifications: import('../types').AppNotification[]) {
  write('gv_app_notifications', notifications)
}

