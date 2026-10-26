-- Migration: Add attraction_reservations jsonb column and make attraction_name/time_window nullable on public.park_fast_passes
-- Idempotent script for schema updates

DO $$ 
BEGIN
  -- 1. Add attraction_reservations column if it does not exist
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'park_fast_passes' 
      AND column_name = 'attraction_reservations'
  ) THEN
    ALTER TABLE public.park_fast_passes 
    ADD COLUMN attraction_reservations jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  -- 2. Ensure attraction_reservations has array check constraint
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conrelid = 'public.park_fast_passes'::regclass 
      AND conname = 'park_fast_passes_attraction_reservations_array_check'
  ) THEN
    ALTER TABLE public.park_fast_passes 
    ADD CONSTRAINT park_fast_passes_attraction_reservations_array_check 
    CHECK (jsonb_typeof(attraction_reservations) = 'array');
  END IF;

  -- 3. Make attraction_name nullable
  ALTER TABLE public.park_fast_passes 
  ALTER COLUMN attraction_name DROP NOT NULL;

  -- 4. Make time_window nullable
  ALTER TABLE public.park_fast_passes 
  ALTER COLUMN time_window DROP NOT NULL;

END $$;
