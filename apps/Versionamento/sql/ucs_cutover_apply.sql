-- UCS cutover apply (CARD-13.2)
-- Execute este script no pgAdmin para fechar o estado ativo atual
-- e preparar o dataset UNIDADES_CONSERVACAO para usar natural_id_col='cnuc_code'.
--
-- IMPORTANTE:
-- 1) Ajuste as duas datas no bloco DECLARE antes de executar.
-- 2) v_cutoff_date deve ser maior que o ultimo snapshot do dataset.
-- 3) O primeiro ingest pos-cutover deve usar snapshot_date novo (maior que v_cutoff_date).

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

DO $$
DECLARE
  v_dataset_code text := 'UNIDADES_CONSERVACAO';
  v_cutoff_date date := DATE '2026-04-09';            -- EDITAR
  v_cutover_snapshot_date date := DATE '2026-04-09';  -- EDITAR (normalmente igual ao cutoff)
  v_cutover_version_label text;
  v_source_path text := 'manual://ucs-cutover/card-13.2';
  v_dataset_id bigint;
  v_cutover_version_id bigint;
  v_last_snapshot date;
  v_running_count integer;
  v_rows integer;
BEGIN
  v_cutover_version_label := format('%s_CUTOVER_%s', v_dataset_code, to_char(v_cutover_snapshot_date, 'YYYY-MM-DD'));

  SELECT d.dataset_id
    INTO v_dataset_id
  FROM landwatch.lw_dataset d
  WHERE d.code = v_dataset_code;

  IF v_dataset_id IS NULL THEN
    RAISE EXCEPTION 'Dataset % nao encontrado em landwatch.lw_dataset.', v_dataset_code;
  END IF;

  SELECT COUNT(*)
    INTO v_running_count
  FROM landwatch.lw_dataset_version v
  WHERE v.dataset_id = v_dataset_id
    AND v.status = 'RUNNING';

  IF v_running_count > 0 THEN
    RAISE EXCEPTION 'Ha % versao(oes) RUNNING para %, abortando cutover.', v_running_count, v_dataset_code;
  END IF;

  SELECT MAX(v.snapshot_date)
    INTO v_last_snapshot
  FROM landwatch.lw_dataset_version v
  WHERE v.dataset_id = v_dataset_id
    AND v.status IN ('COMPLETED', 'SKIPPED_NO_CHANGES');

  IF v_last_snapshot IS NOT NULL AND v_cutoff_date <= v_last_snapshot THEN
    RAISE EXCEPTION
      'v_cutoff_date (%) deve ser maior que ultimo snapshot_date bom (%).',
      v_cutoff_date, v_last_snapshot;
  END IF;

  SELECT v.version_id
    INTO v_cutover_version_id
  FROM landwatch.lw_dataset_version v
  WHERE v.dataset_id = v_dataset_id
    AND v.version_label = v_cutover_version_label
  ORDER BY v.version_id DESC
  LIMIT 1;

  IF v_cutover_version_id IS NULL THEN
    INSERT INTO landwatch.lw_dataset_version
      (dataset_id, version_label, snapshot_date, status, source_path, source_fingerprint, error_message)
    VALUES
      (v_dataset_id, v_cutover_version_label, v_cutover_snapshot_date, 'COMPLETED', v_source_path, NULL, NULL)
    RETURNING version_id INTO v_cutover_version_id;
  END IF;

  UPDATE landwatch.lw_feature_geom_hist h
  SET valid_to = v_cutoff_date
  WHERE h.dataset_id = v_dataset_id
    AND h.valid_to IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Geom active fechadas: %', v_rows;

  UPDATE landwatch.lw_feature_attr_pack_hist h
  SET valid_to = v_cutoff_date
  WHERE h.dataset_id = v_dataset_id
    AND h.valid_to IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Attr active fechadas: %', v_rows;

  UPDATE landwatch.lw_doc_index d
  SET valid_to = v_cutoff_date
  WHERE d.dataset_id = v_dataset_id
    AND d.valid_to IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Doc index active fechadas: %', v_rows;

  UPDATE landwatch.lw_feature_state s
  SET
    is_present = FALSE,
    snapshot_date = v_cutoff_date,
    current_version_id = v_cutover_version_id,
    updated_at = now()
  WHERE s.dataset_id = v_dataset_id
    AND s.is_present = TRUE;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Feature_state marcadas ausentes: %', v_rows;

  UPDATE landwatch.lw_dataset d
  SET natural_id_col = 'cnuc_code'
  WHERE d.dataset_id = v_dataset_id
    AND d.natural_id_col IS DISTINCT FROM 'cnuc_code';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Dataset natural_id_col ajustado (linhas): %', v_rows;

  IF EXISTS (
    SELECT 1
    FROM landwatch.lw_feature_geom_hist h
    WHERE h.dataset_id = v_dataset_id
      AND h.valid_to IS NULL
  ) THEN
    RAISE EXCEPTION 'Ainda existem geometrias ativas apos o cutover.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM landwatch.lw_feature_attr_pack_hist h
    WHERE h.dataset_id = v_dataset_id
      AND h.valid_to IS NULL
  ) THEN
    RAISE EXCEPTION 'Ainda existem atributos ativos apos o cutover.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM landwatch.lw_feature_state s
    WHERE s.dataset_id = v_dataset_id
      AND s.is_present = TRUE
  ) THEN
    RAISE EXCEPTION 'Ainda existem features presentes apos o cutover.';
  END IF;

  RAISE NOTICE 'Cutover UCS concluido. dataset_id=%, cutover_version_id=%, cutoff_date=%',
    v_dataset_id, v_cutover_version_id, v_cutoff_date;
END $$;

COMMIT;

