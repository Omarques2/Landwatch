DO $$
DECLARE
  platform_org_id uuid;
  conflict_count integer;
BEGIN
  SELECT id
  INTO platform_org_id
  FROM app.org
  WHERE kind = 'PLATFORM'
  ORDER BY created_at ASC
  LIMIT 1;

  IF platform_org_id IS NULL THEN
    RAISE NOTICE 'No PLATFORM organization found; legacy farm ownership backfill skipped.';
    RETURN;
  END IF;

  SELECT count(*)
  INTO conflict_count
  FROM app.farm platform_farm
  JOIN app.farm legacy_farm
    ON legacy_farm.car_key = platform_farm.car_key
   AND legacy_farm.org_id IS NULL
  WHERE platform_farm.org_id = platform_org_id;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Cannot move legacy farms to PLATFORM org: % CAR key conflict(s)', conflict_count;
  END IF;

  UPDATE app.farm
  SET org_id = platform_org_id
  WHERE org_id IS NULL;

  UPDATE app.analysis
  SET org_id = platform_org_id
  WHERE org_id IS NULL;

  UPDATE app.analysis_schedule
  SET org_id = platform_org_id
  WHERE org_id IS NULL;
END $$;
