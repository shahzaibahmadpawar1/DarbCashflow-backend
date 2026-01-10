-- Add acceptedAt column to cash_transfers table
ALTER TABLE cash_transfers ADD COLUMN accepted_at TIMESTAMP;
