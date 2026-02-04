-- LandWatch v2 - pipeline set-based (staging -> diff -> hist/state)
-- Data: 2026-01-29
-- Observação: executar dentro de uma transação por dataset/snapshot.
--
-- Convenções:
--   :dataset_id, :version_id, :snapshot_date são parâmetros.
--   staging tables são UNLOGGED e recriadas por dataset.

-- =========================================================
-- 1) Staging - CSV (exemplo)
-- =========================================================
-- Crie a staging antes de COPY:
-- CREATE UNLOGGED TABLE landwatch.stg_csv (
--   row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
--   payload JSONB NOT NULL,
--   geom_wkt TEXT
-- );
--
-- COPY landwatch.stg_csv(payload, geom_wkt) FROM STDIN WITH (FORMAT csv, DELIMITER ';', HEADER true);

-- =========================================================
-- 2) Normalização e hashes
-- =========================================================
-- feature_key = hash de todas as colunas normalizadas
-- attr_hash   = hash do JSON completo
-- geom_hash   = hash do WKB
--
-- Este bloco assume que payload contém todas as colunas do CSV já normalizadas.

DROP TABLE IF EXISTS __stg_norm_raw;
CREATE TEMP TABLE __stg_norm_raw AS
SELECT
    s.row_id,
    -- hash da linha inteira como feature_key
    COALESCE(
        s.feature_key_override,
        md5(s.payload::text)
    ) AS feature_key,
    md5(s.payload::text) AS attr_hash,
    s.payload AS attr_json,
    s.geom_wkt
FROM {{STG_TABLE}} s;

-- Deduplica por feature_key para evitar colisões no mapeamento de feature_id.
-- Mantém a linha mais recente (maior row_id) quando houver duplicatas.
DROP TABLE IF EXISTS __stg_norm;
CREATE TEMP TABLE __stg_norm AS
SELECT
    r.row_id,
    r.feature_key,
    r.attr_hash,
    r.attr_json,
    r.geom_wkt
FROM (
    SELECT
        r.*,
        ROW_NUMBER() OVER (PARTITION BY r.feature_key ORDER BY r.row_id DESC) AS __rn
    FROM __stg_norm_raw r
) r
WHERE r.__rn = 1;

-- doc_normalized + date_closed (para CSVs de CPF/CNPJ)
-- ajuste os nomes conforme dataset (config em lw_dataset)
ALTER TABLE __stg_norm ADD COLUMN doc_normalized TEXT;
ALTER TABLE __stg_norm ADD COLUMN date_closed DATE;

{{DOC_DATE_SQL}}

-- Geometria (se houver WKT)
ALTER TABLE __stg_norm ADD COLUMN geom geometry;
ALTER TABLE __stg_norm ADD COLUMN geom_hash TEXT;

{{GEOM_SQL}}

-- =========================================================
-- 3) Feature upsert
-- =========================================================
INSERT INTO landwatch.lw_feature(dataset_id, feature_key)
SELECT :dataset_id, n.feature_key
FROM __stg_norm n
ON CONFLICT (dataset_id, feature_key) DO NOTHING;

-- map feature_id
DROP TABLE IF EXISTS __stg_map;
CREATE TEMP TABLE __stg_map AS
SELECT
    f.feature_id,
    n.feature_key,
    n.attr_hash,
    n.attr_json,
    n.geom_hash,
    n.geom,
    n.doc_normalized,
    n.date_closed
FROM __stg_norm n
JOIN landwatch.lw_feature f
  ON f.dataset_id = :dataset_id
 AND f.feature_key = n.feature_key;

CREATE UNIQUE INDEX ON __stg_map(feature_id);

-- =========================================================
-- 4) Diff vs estado atual
-- =========================================================
DROP TABLE IF EXISTS __prev_state;
CREATE TEMP TABLE __prev_state AS
SELECT feature_id, is_present, geom_hash, attr_hash
FROM landwatch.lw_feature_state
WHERE dataset_id = :dataset_id;

CREATE UNIQUE INDEX ON __prev_state(feature_id);

-- novos
DROP TABLE IF EXISTS __new_features;
CREATE TEMP TABLE __new_features AS
SELECT m.feature_id, m.geom_hash, m.attr_hash
FROM __stg_map m
LEFT JOIN __prev_state p ON p.feature_id = m.feature_id
WHERE p.feature_id IS NULL;

-- alterados
DROP TABLE IF EXISTS __changed_features;
CREATE TEMP TABLE __changed_features AS
SELECT m.feature_id, m.geom_hash, m.attr_hash
FROM __stg_map m
JOIN __prev_state p ON p.feature_id = m.feature_id
WHERE p.geom_hash IS DISTINCT FROM m.geom_hash
   OR p.attr_hash IS DISTINCT FROM m.attr_hash
   OR p.is_present IS DISTINCT FROM TRUE;

-- desaparecidos (estavam presentes e não vieram no snapshot)
DROP TABLE IF EXISTS __disappeared;
CREATE TEMP TABLE __disappeared AS
SELECT p.feature_id
FROM __prev_state p
LEFT JOIN __stg_map m ON m.feature_id = p.feature_id
WHERE p.is_present = TRUE AND m.feature_id IS NULL;

-- =========================================================
-- 5) Atributos - packs deduplicados
-- =========================================================
-- inserir packs novos
INSERT INTO landwatch.lw_attr_pack(pack_hash, pack_json)
SELECT DISTINCT m.attr_hash, m.attr_json
FROM __stg_map m
LEFT JOIN landwatch.lw_attr_pack p ON p.pack_hash = m.attr_hash
WHERE p.pack_id IS NULL;

-- fechar packs antigos se mudou ou sumiu
UPDATE landwatch.lw_feature_attr_pack_hist h
SET valid_to = :snapshot_date
FROM __changed_features c
WHERE h.dataset_id = :dataset_id
  AND h.feature_id = c.feature_id
  AND h.valid_to IS NULL;

UPDATE landwatch.lw_feature_attr_pack_hist h
SET valid_to = :snapshot_date
FROM __disappeared d
WHERE h.dataset_id = :dataset_id
  AND h.feature_id = d.feature_id
  AND h.valid_to IS NULL;

-- inserir novos packs (novos + alterados)
INSERT INTO landwatch.lw_feature_attr_pack_hist
  (dataset_id, feature_id, pack_id, version_id, valid_from, valid_to)
SELECT
  :dataset_id,
  m.feature_id,
  p.pack_id,
  :version_id,
  :snapshot_date,
  NULL
FROM __stg_map m
JOIN landwatch.lw_attr_pack p ON p.pack_hash = m.attr_hash
LEFT JOIN landwatch.lw_feature_attr_pack_hist h
  ON h.dataset_id = :dataset_id
 AND h.feature_id = m.feature_id
 AND h.valid_to IS NULL
WHERE h.feature_id IS NULL
   OR h.pack_id IS DISTINCT FROM p.pack_id;

-- =========================================================
-- 6) Geometria - dedupe + histórico
-- =========================================================
-- inserir geoms novos
INSERT INTO landwatch.lw_geom_store(geom_hash, geom, srid)
SELECT DISTINCT m.geom_hash, m.geom, 4326
FROM __stg_map m
LEFT JOIN landwatch.lw_geom_store g ON g.geom_hash = m.geom_hash
WHERE m.geom IS NOT NULL
  AND g.geom_id IS NULL;

-- fechar geoms antigos se mudou ou sumiu
UPDATE landwatch.lw_feature_geom_hist h
SET valid_to = :snapshot_date
FROM __changed_features c
WHERE h.dataset_id = :dataset_id
  AND h.feature_id = c.feature_id
  AND h.valid_to IS NULL;

UPDATE landwatch.lw_feature_geom_hist h
SET valid_to = :snapshot_date
FROM __disappeared d
WHERE h.dataset_id = :dataset_id
  AND h.feature_id = d.feature_id
  AND h.valid_to IS NULL;

-- inserir geoms novos (novos + alterados)
INSERT INTO landwatch.lw_feature_geom_hist
  (dataset_id, feature_id, geom_id, version_id, valid_from, valid_to)
SELECT
  :dataset_id,
  m.feature_id,
  g.geom_id,
  :version_id,
  :snapshot_date,
  NULL
FROM __stg_map m
JOIN landwatch.lw_geom_store g ON g.geom_hash = m.geom_hash
LEFT JOIN landwatch.lw_feature_geom_hist h
  ON h.dataset_id = :dataset_id
 AND h.feature_id = m.feature_id
 AND h.valid_to IS NULL
WHERE m.geom_hash IS NOT NULL
  AND (h.feature_id IS NULL OR h.geom_id IS DISTINCT FROM g.geom_id);

-- =========================================================
-- 7) Doc index (CPF/CNPJ ativo)
-- =========================================================
-- Regras:
-- - somente linhas com doc_normalized
-- - somente se date_closed IS NULL
-- - se desaparecer ou date_closed virar preenchido, fecha

-- fechar registros quando sumiu
UPDATE landwatch.lw_doc_index d
SET valid_to = :snapshot_date
FROM __disappeared x
WHERE d.dataset_id = :dataset_id
  AND d.feature_id = x.feature_id
  AND d.valid_to IS NULL;

-- fechar registros quando date_closed ficou preenchido
UPDATE landwatch.lw_doc_index d
SET valid_to = :snapshot_date
FROM __stg_map m
WHERE d.dataset_id = :dataset_id
  AND d.feature_id = m.feature_id
  AND d.valid_to IS NULL
  AND m.date_closed IS NOT NULL;

-- inserir ativos
INSERT INTO landwatch.lw_doc_index
  (dataset_id, feature_id, doc_normalized, date_closed, version_id, valid_from, valid_to)
SELECT
  :dataset_id,
  m.feature_id,
  m.doc_normalized,
  m.date_closed,
  :version_id,
  :snapshot_date,
  NULL
FROM __stg_map m
LEFT JOIN landwatch.lw_doc_index d
  ON d.dataset_id = :dataset_id
 AND d.feature_id = m.feature_id
 AND d.valid_to IS NULL
WHERE m.doc_normalized IS NOT NULL
  AND m.doc_normalized <> ''
  AND m.date_closed IS NULL
  AND d.feature_id IS NULL;

-- =========================================================
-- 8) Feature state
-- =========================================================
-- novos
INSERT INTO landwatch.lw_feature_state
  (dataset_id, feature_id, is_present, geom_hash, attr_hash, snapshot_date, current_version_id, updated_at)
SELECT
  :dataset_id, m.feature_id, TRUE, m.geom_hash, m.attr_hash, :snapshot_date, :version_id, now()
FROM __stg_map m
LEFT JOIN landwatch.lw_feature_state s
  ON s.dataset_id = :dataset_id AND s.feature_id = m.feature_id
WHERE s.feature_id IS NULL;

-- atualiza quando mudou
UPDATE landwatch.lw_feature_state s
SET
  is_present = TRUE,
  geom_hash = m.geom_hash,
  attr_hash = m.attr_hash,
  snapshot_date = :snapshot_date,
  current_version_id = :version_id,
  updated_at = now()
FROM __stg_map m
WHERE s.dataset_id = :dataset_id
  AND s.feature_id = m.feature_id
  AND (
    s.is_present IS DISTINCT FROM TRUE
    OR s.geom_hash IS DISTINCT FROM m.geom_hash
    OR s.attr_hash IS DISTINCT FROM m.attr_hash
  );

-- marca ausentes
UPDATE landwatch.lw_feature_state s
SET
  is_present = FALSE,
  snapshot_date = :snapshot_date,
  current_version_id = :version_id,
  updated_at = now()
FROM __disappeared d
WHERE s.dataset_id = :dataset_id
  AND s.feature_id = d.feature_id
  AND s.is_present IS DISTINCT FROM FALSE;
