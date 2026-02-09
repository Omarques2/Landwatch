-- LandWatch - Index Audit Recommendations (app + landwatch)
-- Generated after EXPLAIN (ANALYZE, BUFFERS) review.
-- Safe to run multiple times (IF NOT EXISTS).

-- =========================================================
-- APP schema (app.*)
-- =========================================================

-- Needed for ILIKE/contains searches in farms (q filter).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- app_user: case-insensitive lookup by email.
CREATE INDEX IF NOT EXISTS idx_app_user_email_lower
  ON app.app_user (lower(email));

-- farm: search + sort
CREATE INDEX IF NOT EXISTS idx_farm_name_trgm
  ON app.farm USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_farm_car_key_trgm
  ON app.farm USING gin (car_key gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_farm_cpf_cnpj_trgm
  ON app.farm USING gin (cpf_cnpj gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_farm_created_at
  ON app.farm (created_at DESC);

-- analysis: filters + ordering
CREATE INDEX IF NOT EXISTS idx_analysis_car_key_created_at
  ON app.analysis (car_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_farm_id_created_at
  ON app.analysis (farm_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_created_at
  ON app.analysis (created_at DESC);

-- analysis_result: fast detail lookup by analysis_id
CREATE INDEX IF NOT EXISTS idx_analysis_result_analysis_id
  ON app.analysis_result (analysis_id);

-- api_key: list ordering
CREATE INDEX IF NOT EXISTS idx_api_key_created_at
  ON app.api_key (created_at DESC);

-- org-ready indices (future-proofing)
CREATE INDEX IF NOT EXISTS idx_org_membership_user_id
  ON app.org_membership (user_id);

CREATE INDEX IF NOT EXISTS idx_org_membership_org_id
  ON app.org_membership (org_id);

CREATE INDEX IF NOT EXISTS idx_org_group_org_id
  ON app.org_group (org_id);

CREATE INDEX IF NOT EXISTS idx_org_group_membership_user_id
  ON app.org_group_membership (user_id);

CREATE INDEX IF NOT EXISTS idx_org_group_membership_group_id
  ON app.org_group_membership (group_id);


-- =========================================================
-- LANDWATCH schema (landwatch.*)
-- =========================================================

-- dataset lookup by category
CREATE INDEX IF NOT EXISTS idx_lw_dataset_category_id
  ON landwatch.lw_dataset (category_id);

-- as-of queries on geom/attr history
CREATE INDEX IF NOT EXISTS idx_lw_feature_geom_hist_asof
  ON landwatch.lw_feature_geom_hist (dataset_id, feature_id, valid_from, valid_to);

CREATE INDEX IF NOT EXISTS idx_lw_feature_attr_pack_hist_asof
  ON landwatch.lw_feature_attr_pack_hist (dataset_id, feature_id, valid_from, valid_to);

-- doc_index: current + as-of searches by doc_normalized
CREATE INDEX IF NOT EXISTS idx_lw_doc_index_doc_active
  ON landwatch.lw_doc_index (doc_normalized)
  WHERE valid_to IS NULL AND date_closed IS NULL;

CREATE INDEX IF NOT EXISTS idx_lw_doc_index_doc_asof
  ON landwatch.lw_doc_index (doc_normalized, valid_from, valid_to, date_closed);

-- MV: extra lookups
CREATE INDEX IF NOT EXISTS idx_mv_feature_geom_active_version
  ON landwatch.mv_feature_geom_active (version_id);

CREATE INDEX IF NOT EXISTS idx_mv_indigena_phase_dataset_feature
  ON landwatch.mv_indigena_phase_active (dataset_code, feature_id);

CREATE INDEX IF NOT EXISTS idx_mv_ucs_sigla_dataset_feature
  ON landwatch.mv_ucs_sigla_active (dataset_code, feature_id);

-- MV distinct values by dataset_code (matches API distinct phase/sigla queries).
CREATE INDEX IF NOT EXISTS idx_mv_indigena_phase_dataset_phase
  ON landwatch.mv_indigena_phase_active (dataset_code, fase_ti)
  WHERE fase_ti IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mv_ucs_sigla_dataset_sigla
  ON landwatch.mv_ucs_sigla_active (dataset_code, sigla_categ)
  WHERE sigla_categ IS NOT NULL;

-- Optional: only if bbox/nearby queries keep ST_Transform(geom, 4326) in WHERE.
-- Prefer rewriting queries to compare in SRID 4674 (avoids functional index).
-- CREATE INDEX IF NOT EXISTS idx_mv_feature_geom_active_geom_4326
--   ON landwatch.mv_feature_geom_active USING GIST (ST_Transform(geom, 4326));

-- Optional: update stats after index creation
-- ANALYZE app.farm;
-- ANALYZE app.analysis;
-- ANALYZE landwatch.lw_doc_index;
-- ANALYZE landwatch.lw_feature_geom_hist;
