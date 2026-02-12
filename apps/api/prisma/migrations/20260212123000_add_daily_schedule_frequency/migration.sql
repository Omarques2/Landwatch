DO $$
BEGIN
  ALTER TYPE app.schedule_frequency ADD VALUE IF NOT EXISTS 'DAILY';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;