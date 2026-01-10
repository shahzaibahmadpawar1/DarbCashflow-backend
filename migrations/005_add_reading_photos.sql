-- Add photo URLs for shift A and shift B readings
ALTER TABLE daily_shift_readings ADD COLUMN shift_a_photo_url TEXT;
ALTER TABLE daily_shift_readings ADD COLUMN shift_b_photo_url TEXT;
