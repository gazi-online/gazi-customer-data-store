-- Add middle_name column to customers table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema='public' AND table_name='customers' AND column_name='middle_name') THEN
        ALTER TABLE public.customers ADD COLUMN middle_name text;
    END IF;
END $$;
