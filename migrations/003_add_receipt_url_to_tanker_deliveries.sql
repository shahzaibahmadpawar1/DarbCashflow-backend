-- Add receipt_url column to tanker_deliveries table
ALTER TABLE tanker_deliveries ADD COLUMN IF NOT EXISTS receipt_url TEXT;
