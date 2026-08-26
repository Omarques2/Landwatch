CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

ALTER TYPE "app"."subject_type" ADD VALUE IF NOT EXISTS 'GEOMETRY';

CREATE TABLE IF NOT EXISTS app.analysis_subject_geometry (
  analysis_id uuid PRIMARY KEY,
  geom public.geometry(MultiPolygon, 4674) NOT NULL,
  source_format text NOT NULL,
  feature_count integer NOT NULL,
  area_m2 numeric NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT analysis_subject_geometry_analysis_fk
    FOREIGN KEY (analysis_id)
    REFERENCES app.analysis(id)
    ON DELETE CASCADE,
  CONSTRAINT analysis_subject_geometry_source_format_ck
    CHECK (source_format IN ('KML', 'SHP')),
  CONSTRAINT analysis_subject_geometry_feature_count_ck
    CHECK (feature_count > 0),
  CONSTRAINT analysis_subject_geometry_area_ck
    CHECK (area_m2 > 0)
);

CREATE INDEX IF NOT EXISTS analysis_subject_geometry_geom_gist
  ON app.analysis_subject_geometry USING gist (geom);
