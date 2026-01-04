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
