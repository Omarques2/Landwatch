CREATE TABLE IF NOT EXISTS app.car_map_search_geometry (
  search_id uuid PRIMARY KEY,
  geom public.geometry(MultiPolygon, 4674) NOT NULL,
  source_format text NOT NULL,
  feature_count integer NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT car_map_search_geometry_session_fk
    FOREIGN KEY (search_id)
    REFERENCES app.car_map_search_session(id)
    ON DELETE CASCADE,
  CONSTRAINT car_map_search_geometry_source_format_ck
    CHECK (source_format IN ('KML', 'SHP')),
  CONSTRAINT car_map_search_geometry_feature_count_ck
    CHECK (feature_count > 0)
);

CREATE INDEX IF NOT EXISTS car_map_search_geometry_geom_gist
  ON app.car_map_search_geometry USING gist (geom);
