-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.user_role AS ENUM ('SM', 'AM', 'Admin');
CREATE TYPE public.shift_type AS ENUM ('DAY', 'NIGHT');
CREATE TYPE public.shift_status AS ENUM ('OPEN', 'CLOSED', 'LOCKED');
CREATE TYPE public.cash_transfer_status AS ENUM ('PENDING_ACCEPTANCE', 'WITH_AM', 'DEPOSITED');

-- =========================
-- STATIONS
-- =========================
CREATE TABLE public.stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_stations_name ON public.stations(name);

-- =========================
-- USERS
-- =========================
CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password text NOT NULL,
  name text NOT NULL,
  role public.user_role NOT NULL,
  station_id uuid REFERENCES public.stations(id) ON DELETE SET NULL,
  area_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_station_id ON public.users(station_id);

-- =========================
-- TANKS
-- =========================
CREATE TABLE public.tanks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  fuel_type text NOT NULL,
  capacity float8 NOT NULL,
  current_level float8 DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tanks_station_id ON public.tanks(station_id);

-- =========================
-- NOZZLES
-- =========================
CREATE TABLE public.nozzles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  tank_id uuid NOT NULL REFERENCES public.tanks(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_nozzles_station_id ON public.nozzles(station_id);
CREATE INDEX idx_nozzles_tank_id ON public.nozzles(tank_id);
CREATE INDEX idx_nozzles_name ON public.nozzles(name);

-- =========================
-- SHIFTS
-- =========================
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  shift_type public.shift_type NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  status public.shift_status DEFAULT 'OPEN',
  locked boolean DEFAULT false,
  locked_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_shifts_station_id ON public.shifts(station_id);
CREATE INDEX idx_shifts_status ON public.shifts(status);
CREATE INDEX idx_shifts_start_time ON public.shifts(start_time);

-- =========================
-- SHIFT READINGS
-- =========================
CREATE TABLE public.shift_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  nozzle_id uuid NOT NULL REFERENCES public.nozzles(id) ON DELETE CASCADE,
  opening_reading float8 NOT NULL,
  closing_reading float8,
  consumption float8,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (shift_id, nozzle_id)
);

CREATE INDEX idx_shift_readings_shift_id ON public.shift_readings(shift_id);
CREATE INDEX idx_shift_readings_nozzle_id ON public.shift_readings(nozzle_id);

-- =========================
-- CASH TRANSACTIONS
-- =========================
CREATE TABLE public.cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL UNIQUE REFERENCES public.shifts(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  liters_sold float8 NOT NULL,
  rate_per_liter float8 NOT NULL,
  total_revenue float8 NOT NULL,
  card_payments float8 DEFAULT 0,
  cash_on_hand float8 NOT NULL,
  bank_deposit float8 DEFAULT 0,
  cash_to_am float8 NOT NULL,
  status public.cash_transfer_status DEFAULT 'PENDING_ACCEPTANCE',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_cash_transactions_station_id ON public.cash_transactions(station_id);
CREATE INDEX idx_cash_transactions_status ON public.cash_transactions(status);
CREATE INDEX idx_cash_transactions_created_at ON public.cash_transactions(created_at);

-- =========================
-- CASH TRANSFERS
-- =========================
CREATE TABLE public.cash_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_transaction_id uuid NOT NULL UNIQUE REFERENCES public.cash_transactions(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status public.cash_transfer_status DEFAULT 'PENDING_ACCEPTANCE',
  receipt_url text,
  deposited_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_cash_transfers_from_user ON public.cash_transfers(from_user_id);
CREATE INDEX idx_cash_transfers_to_user ON public.cash_transfers(to_user_id);
CREATE INDEX idx_cash_transfers_status ON public.cash_transfers(status);

-- =========================
-- TANKER DELIVERIES
-- =========================
CREATE TABLE public.tanker_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id uuid NOT NULL REFERENCES public.tanks(id) ON DELETE CASCADE,
  liters float8 NOT NULL,
  delivery_date timestamptz DEFAULT now(),
  recorded_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tanker_deliveries_tank_id ON public.tanker_deliveries(tank_id);
CREATE INDEX idx_tanker_deliveries_delivery_date ON public.tanker_deliveries(delivery_date);

-- Add area_manager_id to stations to link stations to an Area Manager
ALTER TABLE public.stations ADD COLUMN IF NOT EXISTS area_manager_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stations_area_manager_id ON public.stations(area_manager_id);

-- RENAME email TO employee_id
ALTER TABLE public.users RENAME COLUMN email TO employee_id;
DROP INDEX IF EXISTS idx_users_email;
CREATE INDEX idx_users_employee_id ON public.users(employee_id);

-- Add area_manager_id to stations to link stations to an Area Manager
ALTER TABLE public.stations ADD COLUMN IF NOT EXISTS area_manager_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stations_area_manager_id ON public.stations(area_manager_id);

-- Remove area_manager_id from stations (incorrect location)
ALTER TABLE public.stations DROP COLUMN IF EXISTS area_manager_id;
DROP INDEX IF EXISTS idx_stations_area_manager_id;

-- Add area_manager_id to users table (correct location - SMs report to AMs)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS area_manager_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_area_manager_id ON public.users(area_manager_id);

-- Remove unused area_id text column from users
ALTER TABLE public.users DROP COLUMN IF EXISTS area_id;

-- Cash Transactions table
CREATE TABLE IF NOT EXISTS public.cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL UNIQUE REFERENCES public.shifts(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  liters_sold float8 NOT NULL,
  rate_per_liter float8 NOT NULL,
  total_revenue float8 NOT NULL,
  card_payments float8 DEFAULT 0,
  cash_on_hand float8 NOT NULL,
  bank_deposit float8 DEFAULT 0,
  cash_to_am float8 NOT NULL,
  status public.cash_transfer_status DEFAULT 'PENDING_ACCEPTANCE',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Cash Transfers table
CREATE TABLE IF NOT EXISTS public.cash_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_transaction_id uuid NOT NULL UNIQUE REFERENCES public.cash_transactions(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status public.cash_transfer_status DEFAULT 'PENDING_ACCEPTANCE',
  receipt_url text,
  deposited_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cash_transactions_station_id ON public.cash_transactions(station_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_status ON public.cash_transactions(status);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_created_at ON public.cash_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_from_user_id ON public.cash_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_to_user_id ON public.cash_transfers(to_user_id);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_status ON public.cash_transfers(status);

CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'receipts');

-- Add fuel_type enum
CREATE TYPE public.fuel_type AS ENUM ('91_GASOLINE', '95_GASOLINE', 'DIESEL');

-- Update tanks table
ALTER TABLE public.tanks 
  ALTER COLUMN fuel_type TYPE public.fuel_type USING fuel_type::public.fuel_type,
  ALTER COLUMN capacity DROP NOT NULL;

-- Update nozzles table
ALTER TABLE public.nozzles
  ADD COLUMN IF NOT EXISTS fuel_type public.fuel_type,
  ADD COLUMN IF NOT EXISTS meter_limit DECIMAL(12, 2) DEFAULT 999999;

-- Rename shift_readings to nozzle_readings
ALTER TABLE public.shift_readings RENAME TO nozzle_readings;

-- Add missing fields to nozzle_readings
ALTER TABLE public.nozzle_readings
  ADD COLUMN IF NOT EXISTS is_rollover BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS price_per_liter DECIMAL(10, 2);

-- Update shifts table
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- Update tanker_deliveries table
ALTER TABLE public.tanker_deliveries
  RENAME COLUMN liters TO liters_delivered;

ALTER TABLE public.tanker_deliveries
  RENAME COLUMN recorded_by TO delivered_by;

ALTER TABLE public.tanker_deliveries
  ALTER COLUMN delivery_date SET NOT NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.tanker_deliveries
ADD COLUMN IF NOT EXISTS aramco_ticket TEXT;

-- Create tanks for all stations
INSERT INTO public.tanks (station_id, fuel_type, capacity, current_level)
SELECT 
  s.id as station_id,
  fuel_type::public.fuel_type,  -- Cast to enum type
  NULL as capacity,
  0 as current_level
FROM 
  public.stations s
CROSS JOIN (
  VALUES 
    ('91_GASOLINE'),
    ('95_GASOLINE'),
    ('DIESEL')
) AS fuel_types(fuel_type)
WHERE NOT EXISTS (
  -- Don't create duplicates
  SELECT 1 FROM public.tanks t 
  WHERE t.station_id = s.id 
  AND t.fuel_type::text = fuel_types.fuel_type  -- Cast enum to text for comparison
);

-- Verify tanks were created
SELECT 
  s.name as station_name,
  t.fuel_type::text as fuel_type,
  t.current_level,
  t.capacity
FROM public.tanks t
JOIN public.stations s ON t.station_id = s.id
ORDER BY s.name, t.fuel_type;

-- Create nozzles for all stations
-- This creates 6 nozzles per station (2 for each fuel type)

INSERT INTO public.nozzles (station_id, name, tank_id, fuel_type, meter_limit)
SELECT 
  t.station_id,
  s.name || '-' || CASE 
    WHEN t.fuel_type::text = '91_GASOLINE' AND nozzle_num = 1 THEN '91-1'
    WHEN t.fuel_type::text = '91_GASOLINE' AND nozzle_num = 2 THEN '91-2'
    WHEN t.fuel_type::text = '95_GASOLINE' AND nozzle_num = 1 THEN '95-1'
    WHEN t.fuel_type::text = '95_GASOLINE' AND nozzle_num = 2 THEN '95-2'
    WHEN t.fuel_type::text = 'DIESEL' AND nozzle_num = 1 THEN 'DIESEL-1'
    WHEN t.fuel_type::text = 'DIESEL' AND nozzle_num = 2 THEN 'DIESEL-2'
  END as name,
  t.id as tank_id,
  t.fuel_type,
  999999 as meter_limit
FROM public.tanks t
JOIN public.stations s ON t.station_id = s.id
CROSS JOIN (VALUES (1), (2)) AS nozzles(nozzle_num)
WHERE NOT EXISTS (
  SELECT 1 FROM public.nozzles n
  WHERE n.tank_id = t.id
  AND n.name = s.name || '-' || CASE 
    WHEN t.fuel_type::text = '91_GASOLINE' AND nozzle_num = 1 THEN '91-1'
    WHEN t.fuel_type::text = '91_GASOLINE' AND nozzle_num = 2 THEN '91-2'
    WHEN t.fuel_type::text = '95_GASOLINE' AND nozzle_num = 1 THEN '95-1'
    WHEN t.fuel_type::text = '95_GASOLINE' AND nozzle_num = 2 THEN '95-2'
    WHEN t.fuel_type::text = 'DIESEL' AND nozzle_num = 1 THEN 'DIESEL-1'
    WHEN t.fuel_type::text = 'DIESEL' AND nozzle_num = 2 THEN 'DIESEL-2'
  END
);

-- Verify nozzles were created
SELECT 
  s.name as station_name,
  n.name as nozzle_name,
  n.fuel_type::text as fuel_type,
  n.meter_limit
FROM public.nozzles n
JOIN public.tanks t ON n.tank_id = t.id
JOIN public.stations s ON t.station_id = s.id
ORDER BY s.name, n.fuel_type, n.name;

-- Check if nozzles exist
SELECT 
  s.name as station_name,
  COUNT(n.id) as nozzle_count,
  STRING_AGG(n.name, ', ') as nozzle_names
FROM public.stations s
LEFT JOIN public.tanks t ON s.id = t.station_id
LEFT JOIN public.nozzles n ON t.id = n.tank_id
GROUP BY s.id, s.name
ORDER BY s.name;

-- Check current shifts
SELECT 
  s.name as station_name,
  sh.shift_type,
  sh.status,
  sh.start_time,
  COUNT(nr.id) as reading_count
FROM public.shifts sh
JOIN public.stations s ON sh.station_id = s.id
LEFT JOIN public.nozzle_readings nr ON sh.id = nr.shift_id
WHERE sh.status = 'OPEN'
GROUP BY s.id, s.name, sh.id, sh.shift_type, sh.status, sh.start_time
ORDER BY sh.start_time DESC;

-- Create nozzles for all stations
-- This creates 6 nozzles per station (2 for each fuel type)

INSERT INTO public.nozzles (station_id, name, tank_id, fuel_type, meter_limit)
SELECT 
  t.station_id,
  s.name || '-' || CASE 
    WHEN t.fuel_type::text = '91_GASOLINE' AND nozzle_num = 1 THEN '91-1'
    WHEN t.fuel_type::text = '91_GASOLINE' AND nozzle_num = 2 THEN '91-2'
    WHEN t.fuel_type::text = '95_GASOLINE' AND nozzle_num = 1 THEN '95-1'
    WHEN t.fuel_type::text = '95_GASOLINE' AND nozzle_num = 2 THEN '95-2'
    WHEN t.fuel_type::text = 'DIESEL' AND nozzle_num = 1 THEN 'DIESEL-1'
    WHEN t.fuel_type::text = 'DIESEL' AND nozzle_num = 2 THEN 'DIESEL-2'
  END as name,
  t.id as tank_id,
  t.fuel_type,
  999999 as meter_limit
FROM public.tanks t
JOIN public.stations s ON t.station_id = s.id
CROSS JOIN (VALUES (1), (2)) AS nozzles(nozzle_num)
WHERE NOT EXISTS (
  SELECT 1 FROM public.nozzles n
  WHERE n.tank_id = t.id
  AND n.name = s.name || '-' || CASE 
    WHEN t.fuel_type::text = '91_GASOLINE' AND nozzle_num = 1 THEN '91-1'
    WHEN t.fuel_type::text = '91_GASOLINE' AND nozzle_num = 2 THEN '91-2'
    WHEN t.fuel_type::text = '95_GASOLINE' AND nozzle_num = 1 THEN '95-1'
    WHEN t.fuel_type::text = '95_GASOLINE' AND nozzle_num = 2 THEN '95-2'
    WHEN t.fuel_type::text = 'DIESEL' AND nozzle_num = 1 THEN 'DIESEL-1'
    WHEN t.fuel_type::text = 'DIESEL' AND nozzle_num = 2 THEN 'DIESEL-2'
  END
);

-- Verify nozzles were created
SELECT 
  s.name as station_name,
  n.name as nozzle_name,
  n.fuel_type::text as fuel_type,
  n.meter_limit
FROM public.nozzles n
JOIN public.tanks t ON n.tank_id = t.id
JOIN public.stations s ON t.station_id = s.id
ORDER BY s.name, n.fuel_type, n.name;


-- Quick fix: Delete existing shifts and recreate with proper nozzle readings

-- 1. Delete all open shifts (they'll be recreated with readings)
DELETE FROM public.shifts WHERE status = 'OPEN';

-- 2. Verify nozzles exist
SELECT COUNT(*) as nozzle_count FROM public.nozzles;

-- If count is 0, run the create-nozzles script first!

-- 3. Check tanks
SELECT 
  s.name as station,
  t.fuel_type::text,
  t.current_level
FROM public.tanks t
JOIN public.stations s ON t.station_id = s.id
ORDER BY s.name, t.fuel_type;


-- New simplified inventory system schema

-- 1. Add fuel prices table (Admin sets prices per station per fuel type)
CREATE TABLE IF NOT EXISTS public.fuel_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  fuel_type public.fuel_type NOT NULL,
  price_per_liter DECIMAL(10, 2) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(station_id, fuel_type, effective_from)
);

-- 2. Simplify nozzle_sales table (replaces nozzle_readings)
-- Station manager enters quantity sold per nozzle
CREATE TABLE IF NOT EXISTS public.nozzle_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  nozzle_id UUID NOT NULL REFERENCES public.nozzles(id) ON DELETE CASCADE,
  quantity_liters DECIMAL(12, 2) NOT NULL DEFAULT 0,
  price_per_liter DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(12, 2) GENERATED ALWAYS AS (quantity_liters * price_per_liter) STORED,
  card_amount DECIMAL(12, 2) DEFAULT 0,
  cash_amount DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shift_id, nozzle_id)
);

-- 3. Add indexes
CREATE INDEX IF NOT EXISTS idx_fuel_prices_station ON public.fuel_prices(station_id);
CREATE INDEX IF NOT EXISTS idx_fuel_prices_effective ON public.fuel_prices(effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_nozzle_sales_shift ON public.nozzle_sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_nozzle_sales_nozzle ON public.nozzle_sales(nozzle_id);

-- 4. Create view for current fuel prices
CREATE OR REPLACE VIEW public.current_fuel_prices AS
SELECT DISTINCT ON (station_id, fuel_type)
  id,
  station_id,
  fuel_type,
  price_per_liter,
  effective_from,
  created_by
FROM public.fuel_prices
ORDER BY station_id, fuel_type, effective_from DESC;

COMMENT ON TABLE public.fuel_prices IS 'Admin-managed fuel prices per station';
COMMENT ON TABLE public.nozzle_sales IS 'Station manager enters quantities sold per nozzle';
COMMENT ON VIEW public.current_fuel_prices IS 'Latest fuel prices for each station and fuel type';



-- Set default fuel prices for all stations (100 SAR per liter as default)
-- Admin can update these later

INSERT INTO public.fuel_prices (station_id, fuel_type, price_per_liter, created_by)
SELECT 
  s.id as station_id,
  fuel_type::public.fuel_type,
  100.00 as price_per_liter,
  (SELECT id FROM public.users WHERE role = 'Admin' LIMIT 1) as created_by
FROM public.stations s
CROSS JOIN (
  VALUES 
    ('91_GASOLINE'),
    ('95_GASOLINE'),
    ('DIESEL')
) AS fuel_types(fuel_type)
WHERE NOT EXISTS (
  SELECT 1 FROM public.fuel_prices fp
  WHERE fp.station_id = s.id 
  AND fp.fuel_type::text = fuel_types.fuel_type
);

-- Verify prices were created
SELECT 
  s.name as station_name,
  fp.fuel_type::text,
  fp.price_per_liter
FROM public.fuel_prices fp
JOIN public.stations s ON fp.station_id = s.id
ORDER BY s.name, fp.fuel_type;
DELETE FROM public.shifts WHERE status = 'OPEN';

-- ============================================
-- Station Type Migration
-- ============================================
-- This script adds station_type enum and column to stations table
-- Run this in your SQL editor to apply the changes
-- ============================================

-- Step 1: Create the station_type enum (only if it doesn't exist)
-- Note: PostgreSQL doesn't support IF NOT EXISTS for CREATE TYPE
-- So we use a DO block to handle this safely
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'station_type') THEN
        CREATE TYPE public.station_type AS ENUM ('OPERATIONAL', 'RENTAL', 'FRANCHISE');
    END IF;
END $$;

-- Step 2: Add station_type column to stations table (if it doesn't exist)
ALTER TABLE public.stations 
ADD COLUMN IF NOT EXISTS station_type public.station_type DEFAULT 'OPERATIONAL';

-- Step 3: Set default value for any existing stations that might have NULL
UPDATE public.stations 
SET station_type = 'OPERATIONAL' 
WHERE station_type IS NULL;

-- Verification: Check that all stations have a station_type
SELECT 
  id, 
  name, 
  station_type,
  CASE 
    WHEN station_type IS NULL THEN 'ERROR: NULL station_type found!'
    ELSE 'OK'
  END as status
FROM public.stations;

-- Daily Shift System Migration
-- This migration adds support for daily shifts with meter readings

-- Step 1: Update shift_status enum to include SAVED
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SAVED' AND enumtypid = 'shift_status'::regtype) THEN
        ALTER TYPE shift_status ADD VALUE 'SAVED';
    END IF;
END $$;

-- Step 2: Add openingReading to nozzles table
ALTER TABLE nozzles ADD COLUMN IF NOT EXISTS opening_reading DOUBLE PRECISION DEFAULT 0;

-- Step 3: Modify shifts table for daily shifts
ALTER TABLE shifts ALTER COLUMN shift_type DROP NOT NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_date TIMESTAMP;

-- Step 4: Create daily_shift_readings table
CREATE TABLE IF NOT EXISTS daily_shift_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    nozzle_id UUID NOT NULL REFERENCES nozzles(id) ON DELETE CASCADE,
    opening_reading DOUBLE PRECISION NOT NULL,
    shift_a_reading DOUBLE PRECISION,
    shift_b_reading DOUBLE PRECISION,
    shift_a_liters DOUBLE PRECISION DEFAULT 0,
    shift_b_liters DOUBLE PRECISION DEFAULT 0,
    price_per_liter DOUBLE PRECISION NOT NULL,
    shift_a_amount DOUBLE PRECISION DEFAULT 0,
    shift_b_amount DOUBLE PRECISION DEFAULT 0,
    total_amount DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(shift_id, nozzle_id)
);

-- Step 5: Create payment_summary table
CREATE TABLE IF NOT EXISTS payment_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL UNIQUE REFERENCES shifts(id) ON DELETE CASCADE,
    card_amount DOUBLE PRECISION DEFAULT 0,
    cash_amount DOUBLE PRECISION DEFAULT 0,
    option3_amount DOUBLE PRECISION DEFAULT 0,
    option4_amount DOUBLE PRECISION DEFAULT 0,
    total_collected DOUBLE PRECISION DEFAULT 0,
    difference DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 6: Update cash_transactions table to support new payment options
ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS option3_payments DOUBLE PRECISION DEFAULT 0;
ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS option4_payments DOUBLE PRECISION DEFAULT 0;

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_shift_readings_shift_id ON daily_shift_readings(shift_id);
CREATE INDEX IF NOT EXISTS idx_daily_shift_readings_nozzle_id ON daily_shift_readings(nozzle_id);
CREATE INDEX IF NOT EXISTS idx_payment_summary_shift_id ON payment_summary(shift_id);
CREATE INDEX IF NOT EXISTS idx_shifts_shift_date ON shifts(shift_date);

-- Verification queries
SELECT 'Migration completed successfully!' as status;

-- Verify new columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'nozzles' AND column_name = 'opening_reading';

SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'shifts' AND column_name IN ('shift_type', 'shift_date');

-- Verify new tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('daily_shift_readings', 'payment_summary');