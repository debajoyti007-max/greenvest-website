// ============================================================
// TWO BHAI TRAVELS — Supabase API Layer
// Reuses: withTimeout from src/lib/api.ts
// Reuses: supabase client from src/lib/supabase.ts
// ============================================================
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/api'
import type { TravelBooking, TravelBookingInsert } from './travelTypes'

function mapRow(row: Record<string, unknown>): TravelBooking {
  return {
    id: String(row.id),
    bookingCode: String(row.booking_code),
    userId: (row.user_id as string) || null,
    customerName: String(row.customer_name),
    customerPhone: String(row.customer_phone),
    customerEmail: (row.customer_email as string) || undefined,
    pickupAddress: String(row.pickup_address),
    dropAddress: String(row.drop_address),
    pickupDate: String(row.pickup_date),
    pickupTime: String(row.pickup_time),
    geoLat: (row.geo_lat as number) ?? null,
    geoLng: (row.geo_lng as number) ?? null,
    landmark: (row.landmark as string) || undefined,
    passengers: Number(row.passengers),
    luggageBags: (row.luggage_bags as number) ?? undefined,
    carType: String(row.car_type),
    estimatedFare: Number(row.estimated_fare),
    advanceAmount: Number(row.advance_amount),
    balanceDue: Number(row.balance_due),
    paymentMode: (row.payment_mode as TravelBooking['paymentMode']) || 'advance',
    utr: (row.utr as string) || undefined,
    utrVerified: Boolean(row.utr_verified),
    paymentStatus: String(row.payment_status),
    status: (row.status as TravelBooking['status']) || 'pending',
    assignedDriverId: (row.assigned_driver_id as string) || null,
    driverName: (row.driver_name as string) || undefined,
    driverPhone: (row.driver_phone as string) || undefined,
    carNumber: (row.car_number as string) || undefined,
    cancellationReason: (row.cancellation_reason as string) || undefined,
    notes: (row.notes as string) || undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export async function insertTravelBooking(payload: TravelBookingInsert): Promise<TravelBooking> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await withTimeout(
    supabase.from('travel_bookings').insert(payload).select().single(),
    10000,
    'Booking timed out. Please retry.',
  )
  if (error) throw new Error(error.message)
  return mapRow(data as Record<string, unknown>)
}

export async function fetchTravelBookingByCode(code: string): Promise<TravelBooking | null> {
  if (!supabase) return null
  const { data, error } = await withTimeout(
    supabase.from('travel_bookings').select('*').eq('booking_code', code).maybeSingle(),
    8000,
  )
  if (error || !data) return null
  return mapRow(data as Record<string, unknown>)
}

export async function fetchMyTravelBookings(userId: string): Promise<TravelBooking[]> {
  if (!supabase) return []
  const { data, error } = await withTimeout(
    supabase.from('travel_bookings').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    8000,
  )
  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(mapRow)
}

// Manager/Seller: fetch all bookings
export async function fetchAllTravelBookings(): Promise<TravelBooking[]> {
  if (!supabase) return []
  const { data, error } = await withTimeout(
    supabase.from('travel_bookings').select('*').order('created_at', { ascending: false }).limit(100),
    8000,
  )
  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(mapRow)
}

// Manager: update booking status + assign driver
export async function updateTravelBooking(
  id: string,
  update: Partial<{
    status: TravelBooking['status']
    driver_name: string
    driver_phone: string
    car_number: string
    assigned_driver_id: string
    utr: string
    utr_verified: boolean
    payment_status: string
    cancellation_reason: string
  }>,
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await withTimeout(
    supabase.from('travel_bookings').update({ ...update, updated_at: new Date().toISOString() }).eq('id', id),
    8000,
  )
  if (error) throw new Error(error.message)
}

// Realtime subscription for a single booking pass
export function subscribeTravelBooking(
  bookingCode: string,
  onUpdate: (b: TravelBooking) => void,
) {
  const sb = supabase
  if (!sb) return () => {}
  const channel = sb
    .channel(`tbt-booking-${bookingCode}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'travel_bookings', filter: `booking_code=eq.${bookingCode}` },
      (payload) => { if (payload.new) onUpdate(mapRow(payload.new as Record<string, unknown>)) },
    )
    .subscribe()
  return () => { void sb.removeChannel(channel) }
}

// Realtime subscription for manager dashboard (all new bookings)
export function subscribeTravelBookingsAll(onInsert: (b: TravelBooking) => void) {
  const sb = supabase
  if (!sb) return () => {}
  const channel = sb
    .channel('tbt-all-bookings')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'travel_bookings' },
      (payload) => { if (payload.new) onInsert(mapRow(payload.new as Record<string, unknown>)) },
    )
    .subscribe()
  return () => { void sb.removeChannel(channel) }
}
