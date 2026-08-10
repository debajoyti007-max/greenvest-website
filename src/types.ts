export type Role = 'customer' | 'rider' | 'seller' | 'admin'
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
  isBlocked?: boolean
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

export interface Address { id?: number; user_id?: string; label: string; address: string; phone: string; pin: string; is_default: boolean }
export interface Coupon { code: string; discount_type: 'flat' | 'percent'; discount_value: number; min_order: number; valid: boolean; discount?: number; message?: string }
export interface DailyReport { id?: number; report_date: string; total_orders: number; total_revenue: number; total_cancelled: number; mandi_cost: number; delivery_cost: number; profit: number }
export interface DeliveryZone { pin_prefix: string; zone: string; fee: number; eta_hours: string }
export interface AppNotification { id: string; userId?: string; title: string; message: string; sender: string; createdAt: string }

