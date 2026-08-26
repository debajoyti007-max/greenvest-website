export type Role = 'customer' | 'rider' | 'seller' | 'admin'
export type Grade = 'A' | 'B' | 'C'
export type OrderStatus = 'pending' | 'advance_paid' | 'confirmed' | 'delivered' | 'cancelled' | 'refunded'
export type Season = 'all' | 'summer' | 'winter' | 'rainy'
export type DeliverySlot = 'morning' | 'evening'

export interface User {
  id: string
  email: string
  password?: string
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
  /** How product is sold: loose by weight, fixed packets, or both */
  soldAs?: 'loose' | 'packet' | 'both'
  /** Available gram sizes when soldAs is packet or both, e.g. [250, 500, 1000] */
  gramOptions?: number[]
}

export interface CartItem {
  productId: string
  grade: Grade
  qty: number
  weightMultiplier?: number
  weightLabel?: string
}

export interface OrderItem {
  productId: string
  name: string
  emoji: string
  grade: Grade
  qty: number
  unitPrice: number
  weightMultiplier?: number
  weightLabel?: string
}

export interface Order {
  id: string
  userId: string
  userName: string
  userEmail: string
  items: OrderItem[]
  subtotal: number
  deliveryFee: number
  discountAmount?: number
  total: number
  advanceAmount: number
  paymentType?: 'full' | 'advance'
  utr: string
  utrVerified: boolean
  status: OrderStatus
  address: string
  phone: string
  pin: string
  /** GPS latitude from customer's device */
  geoLat?: number
  /** GPS longitude from customer's device */
  geoLng?: number
  deliverySlot?: DeliverySlot
  createdAt: string
  updatedAt: string
}

export type Lang = 'en' | 'bn'

export interface Address { id?: number; user_id?: string; label: string; address: string; phone: string; pin: string; is_default: boolean }
export interface Coupon {
  code: string
  discount_type: 'flat' | 'percent'
  discount_value: number
  min_order: number
  valid: boolean
  active?: boolean
  expires_at?: string
  valid_until?: string
  discount?: number
  message?: string
}
export interface DailyReport { id?: number; report_date: string; total_orders: number; total_revenue: number; total_cancelled: number; mandi_cost: number; delivery_cost: number; profit: number }
export interface DeliveryZone { pin_prefix: string; zone: string; fee: number; eta_hours: string }
export interface AppNotification { id: string; userId?: string; title: string; message: string; sender: string; createdAt: string }
export interface ChatMessage {
  id: string
  orderId: string
  sender: 'customer' | 'seller'
  text: string
  time: string
  createdAt?: string
}

export interface ProductReview {
  id: string
  productId: string
  userId?: string
  userName: string
  rating: number
  comment: string
  tag?: string
  isVerifiedBuyer?: boolean
  createdAt: string
}

