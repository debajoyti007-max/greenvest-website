// ============================================================
// TWO BHAI TRAVELS — TypeScript Types
// ============================================================

export type TravelBookingStatus = 'pending' | 'confirmed' | 'dispatched' | 'completed' | 'cancelled'
export type TravelPaymentMode = 'advance' | 'full' | 'pay_on_trip'

export interface TravelBooking {
  id: string
  bookingCode: string
  userId: string | null
  customerName: string
  customerPhone: string
  customerEmail?: string
  pickupAddress: string
  dropAddress: string
  pickupDate: string   // ISO date YYYY-MM-DD
  pickupTime: string   // e.g. '05:30 AM'
  geoLat?: number | null
  geoLng?: number | null
  landmark?: string
  passengers: number   // 1–4 strictly
  luggageBags?: number
  carType: string
  estimatedFare: number
  advanceAmount: number
  balanceDue: number
  paymentMode: TravelPaymentMode
  utr?: string
  utrVerified: boolean
  paymentStatus: string
  status: TravelBookingStatus
  assignedDriverId?: string | null
  driverName?: string
  driverPhone?: string
  carNumber?: string
  cancellationReason?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface TravelBookingInsert {
  booking_code: string
  user_id: string | null
  customer_name: string
  customer_phone: string
  customer_email?: string
  pickup_address: string
  drop_address: string
  pickup_date: string
  pickup_time: string
  geo_lat?: number | null
  geo_lng?: number | null
  landmark?: string
  passengers: number
  luggage_bags?: number
  car_type: string
  estimated_fare: number
  advance_amount: number
  balance_due: number
  payment_mode: TravelPaymentMode
  utr?: string
  notes?: string
}
