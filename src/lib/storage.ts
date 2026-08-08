import { SEED_PRODUCTS, SEED_USERS } from '../data/seed'
import type { CartItem, Order, Product, User } from '../types'

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

export function ensureSeeded() {
  if (localStorage.getItem(KEYS.seeded) === '1') {
    // Ensure seed accounts still exist if users were wiped
    const users = read<User[]>(KEYS.users, [])
    if (users.length === 0) {
      write(KEYS.users, SEED_USERS)
    }
    const products = read<Product[]>(KEYS.products, [])
    if (products.length === 0) {
      write(KEYS.products, SEED_PRODUCTS)
    }
    return
  }
  write(KEYS.users, SEED_USERS)
  write(KEYS.products, SEED_PRODUCTS)
  write(KEYS.orders, [] as Order[])
  write(KEYS.cart, [] as CartItem[])
  localStorage.setItem(KEYS.seeded, '1')
}

export function getUsers(): User[] {
  return read(KEYS.users, SEED_USERS)
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

export function getLang(): 'en' | 'bn' {
  return (localStorage.getItem(KEYS.lang) as 'en' | 'bn') || 'en'
}

export function setLang(lang: 'en' | 'bn') {
  localStorage.setItem(KEYS.lang, lang)
  window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { key: KEYS.lang } }))
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
