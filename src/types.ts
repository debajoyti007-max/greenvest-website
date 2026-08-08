export type Role = 'customer' | 'seller' | 'admin'
export type Grade = 'A' | 'B' | 'C'
export type OrderStatus = 'pending' | 'advance_paid' | 'confirmed' | 'delivered' | 'cancelled'

export interface User {
  id: string
  email: string
  password: string
  name: string
  role: Role
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
  createdAt: string
  updatedAt: string
}

export type Lang = 'en' | 'bn'
