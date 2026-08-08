export type Role = 'customer' | 'seller' | 'admin'
export type Grade = 'A' | 'B' | 'C'
export type OrderStatus = 'pending' | 'advance_paid' | 'confirmed' | 'delivered' | 'cancelled'
export type Season = 'all' | 'summer' | 'winter' | 'rainy'
export type DeliverySlot = 'morning' | 'evening'

export interface User {
  id: string
  email: string
  password: string
  name: string
  role: Role
  phone?: string
  createdAt: string
}

export interface Product {
  id: string
  emoji: string
  name: string
  bnName: string
  pA: number
  pB: number
  pC: number
  inStock: boolean
  /** Hidden from shop; kept for seller history / next season */
  archived?: boolean
  /** Approximate units left; low-stock alert when <= threshold */
  stockQty?: number
  season?: Season
  category: string
  unit: string
  /** Optional photo URL; emoji used as fallback */
  imageUrl?: string
}

export interface CartItem {
  productId: string
  grade: Grade
  qty: number
}

export interface OrderItem {
  productId: string
  name: string
  emoji: string
  grade: Grade
  qty: number
  unitPrice: number
}

export interface Order {
  id: string
  userId: string
  userName: string
  userEmail: string
  items: OrderItem[]
  subtotal: number
  deliveryFee: number
  total: number
  advanceAmount: number
  utr: string
  utrVerified: boolean
  status: OrderStatus
  address: string
  phone: string
  pin: string
  deliverySlot?: DeliverySlot
  createdAt: string
  updatedAt: string
}

export type Lang = 'en' | 'bn'
