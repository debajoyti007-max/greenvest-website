import { SEED_PRODUCTS } from '../data/seed'
import type { CartItem, Lang, Order, Product, User } from '../types'

const KEYS = {
  users: 'gv_users',
  products: 'gv_products',
  orders: 'gv_orders',
  cart: 'gv_cart',
  session: 'gv_session',
  lang: 'gv_lang',
  seeded: 'gv_seeded',
} as const

export const STORE_EVENT = 'greenvest-store-update'

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
  return read(KEYS.orders, [])
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

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
