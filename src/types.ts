export type Role = 'customer' | 'rider' | 'seller' | 'admin'
export type CustomerTier = 'regular' | 'vip' | 'wholesale'
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
  tier?: CustomerTier
  phone?: string
  isBlocked?: boolean
  khataApproved?: boolean
  khataCreditLimit?: number
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
  /** Strikethrough Market MRP; computed automatically if omitted */
  mrp?: number
  /** Available grade options (A, B, C) enabled by Admin/Seller */
  availableGrades?: Grade[]
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
  paymentType?: 'full' | 'advance' | 'khata'
  paymentMode?: 'online' | 'khata'
  isKhataOrder?: boolean
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
  rejectionReason?: string
  createdAt: string
  updatedAt: string
}

export interface KhataEntry {
  id: string
  userId: string
  userName?: string
  userPhone?: string
  orderId?: string
  type: 'order_debit' | 'payment_credit' | 'adjustment'
  amount: number
  balanceAfter?: number
  notes?: string
  paymentMethod?: 'upi' | 'cash'
  recordedBy?: string
  createdBy?: string
  createdAt: string
}

export interface ShiftInfo {
  currentShift: 'morning' | 'evening' | 'break' | 'closed'
  isOpen: boolean
  shiftNameEn: string
  shiftNameBn: string
  nextShiftNoticeEn: string
  nextShiftNoticeBn: string
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

export interface PromotionalDeal {
  id: string
  titleEn: string
  titleBn: string
  subtitleEn: string
  subtitleBn: string
  badgeEn: string
  badgeBn: string
  couponCode?: string
  linkUrl?: string
  buttonTextEn?: string
  buttonTextBn?: string
  bgGradient?: string
  emoji?: string
  isActive: boolean
  expiresAt?: string
  autoRemoveOnExpiry?: boolean
  createdAt?: string
}

