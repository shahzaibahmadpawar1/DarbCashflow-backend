-- Migration: Add Office User (OU) role to user_role enum
-- This migration adds the 'OU' (Office User) role to the existing user_role enum

-- Add the new value to the enum (safe approach that checks if value already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'OU' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'user_role'
        )
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'OU';
    END IF;
END $$;
