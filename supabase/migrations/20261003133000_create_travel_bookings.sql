-- Migration: 20261003133000_create_travel_bookings.sql
-- Description: Dedicated table, RLS, and Realtime for Two Bhai Travels
-- Note: Vegetable tables (products, orders, profiles) remain strictly untouched.

-- 1. Create status enumeration types
DO $$ BEGIN
    CREATE TYPE travel_booking_status AS ENUM (
        'pending',      -- Booking submitted, awaiting driver assignment
        'confirmed',    -- Driver assigned, car locked
        'dispatched',   -- Car en route to customer doorstep
        'completed',    -- Journey completed, balance settled
        'cancelled'     -- Cancelled with documented reason
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE travel_payment_mode AS ENUM (
        'advance',      -- 10% token advance paid online; 90% balance on trip
        'full',         -- 100% paid upfront (cashless journey)
        'pay_on_trip'   -- Direct cash/UPI to driver on trip
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create the travel_bookings table
CREATE TABLE IF NOT EXISTS public.travel_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_code TEXT NOT NULL UNIQUE,          -- Human-readable ID, e.g., 'TBT-829104'
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Authenticated user link
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    
    -- Route & Location
    pickup_address TEXT NOT NULL,
    drop_address TEXT NOT NULL,
    pickup_date DATE NOT NULL,
    pickup_time TEXT NOT NULL,                  -- e.g., '05:30 AM'
    geo_lat NUMERIC(10, 7),
    geo_lng NUMERIC(10, 7),
    landmark TEXT,
    
    -- Capacity Constraints (Strictly 4-seater)
    passengers SMALLINT NOT NULL DEFAULT 1 CHECK (passengers >= 1 AND passengers <= 4),
    luggage_bags SMALLINT DEFAULT 2 CHECK (luggage_bags >= 0 AND luggage_bags <= 6),
    car_type TEXT NOT NULL DEFAULT '4-Seater AC Sedan',
    
    -- Financials (10% vs 100% Engine)
    estimated_fare NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    advance_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    balance_due NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_mode travel_payment_mode NOT NULL DEFAULT 'advance',
    utr TEXT,                                   -- 12-digit UPI transaction reference
    utr_verified BOOLEAN NOT NULL DEFAULT FALSE,
    payment_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'advance_paid', 'fully_paid'
    
    -- Operational Status & Driver Dispatch
    status travel_booking_status NOT NULL DEFAULT 'pending',
    assigned_driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    driver_name TEXT,
    driver_phone TEXT,
    car_number TEXT,                            -- e.g., 'WB-29-XXXX'
    cancellation_reason TEXT,
    notes TEXT,                                 -- Special trip instructions
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.travel_bookings ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Public users can insert travel bookings" ON public.travel_bookings;
DROP POLICY IF EXISTS "Users can insert travel bookings" ON public.travel_bookings;
CREATE POLICY "Users can insert travel bookings"
    ON public.travel_bookings
    FOR INSERT
    TO public
    WITH CHECK (
        length(customer_name) >= 2 AND
        length(customer_phone) >= 10 AND
        passengers >= 1 AND passengers <= 4
    );

DROP POLICY IF EXISTS "Public users can view booking by code" ON public.travel_bookings;
CREATE POLICY "Public users can view booking by code"
    ON public.travel_bookings
    FOR SELECT
    TO public
    USING (true);

DROP POLICY IF EXISTS "Staff can update travel bookings" ON public.travel_bookings;
CREATE POLICY "Staff can update travel bookings"
    ON public.travel_bookings
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_travel_bookings_code ON public.travel_bookings(booking_code);
CREATE INDEX IF NOT EXISTS idx_travel_bookings_user ON public.travel_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_travel_bookings_phone ON public.travel_bookings(customer_phone);
CREATE INDEX IF NOT EXISTS idx_travel_bookings_status ON public.travel_bookings(status);
CREATE INDEX IF NOT EXISTS idx_travel_bookings_driver ON public.travel_bookings(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_travel_bookings_date ON public.travel_bookings(pickup_date DESC);
CREATE INDEX IF NOT EXISTS idx_travel_bookings_created ON public.travel_bookings(created_at DESC);

-- 6. Enable Realtime Broadcast for live updates
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.travel_bookings;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN undefined_object THEN null;
END $$;
