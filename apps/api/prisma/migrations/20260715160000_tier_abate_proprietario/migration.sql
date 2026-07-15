ALTER TABLE app.tier_abate
  ADD COLUMN IF NOT EXISTS proprietario_id uuid;

-- Infer legacy owners only when every linked tier belongs to the same owner.
UPDATE app.tier_abate AS abate
SET proprietario_id = inferred.proprietario_id
FROM (
  SELECT
    consumo.abate_id,
    MIN(tier.proprietario_id::text)::uuid AS proprietario_id
  FROM app.tier_abate_consumo AS consumo
  JOIN app.tier AS tier ON tier.id = consumo.tier_id
  GROUP BY consumo.abate_id
  HAVING COUNT(DISTINCT tier.proprietario_id) = 1
) AS inferred
WHERE inferred.abate_id = abate.id
  AND abate.proprietario_id IS NULL;

DO $$
DECLARE
  unresolved_count integer;
BEGIN
  SELECT COUNT(*) INTO unresolved_count
  FROM app.tier_abate
  WHERE proprietario_id IS NULL;

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION
      'tier_abate has % row(s) without an inferable proprietario_id',
      unresolved_count;
  END IF;
END $$;

ALTER TABLE app.tier_abate
  ALTER COLUMN proprietario_id SET NOT NULL;

ALTER TABLE app.tier_abate
  ADD CONSTRAINT tier_abate_proprietario_id_fkey
  FOREIGN KEY (proprietario_id)
  REFERENCES app.tier_proprietario(id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS tier_abate_proprietario_id_idx
  ON app.tier_abate (proprietario_id);
