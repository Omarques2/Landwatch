-- Reconcile the PLATFORM org to be `sigfarm` and consolidate all legacy /
-- platform-owned data, memberships and API clients onto it.
--
-- Context: migrations 20260611130000 / 20260611160000 / 20260616150000 create
-- an auto `landwatch-platform` PLATFORM org and backfill every org-less legacy
-- farm/analysis/schedule onto it. The product decision is that `sigfarm` is the
-- PLATFORM org and owns everything. This migration runs AFTER those (timestamp
-- ordering) so it never edits an already-applied migration.
--
-- Confirmed preconditions (product owner): the `sigfarm` org exists in prod;
-- there are no two farms sharing a CAR key (so farm_org_car_key_key cannot
-- collide on the move); all current users become `admin` of sigfarm; all
-- current automation API clients are sigfarm-scoped (TENANT of sigfarm).
--
-- Idempotent + safe on staging and prod. Only data owned by a former PLATFORM
-- org (or org-less legacy rows) is moved — real tenant orgs are never touched.

DO $$
DECLARE
  sigfarm_id uuid;
  legacy_platform_ids uuid[];
BEGIN
  -- 1. Ensure the sigfarm org exists (guaranteed in prod; created if absent in
  --    other environments so the migration is self-sufficient).
  INSERT INTO app.org (name, slug, kind, status)
  VALUES ('Sigfarm', 'sigfarm', 'TENANT', 'active')
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO sigfarm_id FROM app.org WHERE slug = 'sigfarm';
  IF sigfarm_id IS NULL THEN
    RAISE EXCEPTION 'Required org slug=sigfarm not found and could not be created';
  END IF;

  -- 2. Capture the existing PLATFORM org(s) other than sigfarm (e.g. the
  --    auto-created landwatch-platform) BEFORE demoting them, so we move only
  --    their data — never a legitimate tenant org's data.
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO legacy_platform_ids
  FROM app.org
  WHERE kind = 'PLATFORM' AND id <> sigfarm_id;

  -- 3. Free the single-PLATFORM unique index (org_single_platform_kind_idx) by
  --    demoting + disabling the former platform org(s) BEFORE promoting sigfarm.
  UPDATE app.org
  SET kind = 'TENANT', status = 'disabled'
  WHERE id = ANY(legacy_platform_ids);

  -- 4. Promote sigfarm to PLATFORM.
  UPDATE app.org
  SET kind = 'PLATFORM', status = 'active'
  WHERE id = sigfarm_id;

  -- 5. Move all legacy (org-less) and former-platform-owned operational data
  --    onto sigfarm. No CAR-key collisions per the product guarantee.
  UPDATE app.farm
  SET org_id = sigfarm_id
  WHERE org_id IS NULL OR org_id = ANY(legacy_platform_ids);

  UPDATE app.analysis
  SET org_id = sigfarm_id
  WHERE org_id IS NULL OR org_id = ANY(legacy_platform_ids);

  UPDATE app.analysis_schedule
  SET org_id = sigfarm_id
  WHERE org_id IS NULL OR org_id = ANY(legacy_platform_ids);

  -- 5b. Re-point the remaining org-referencing tables that were OWNED BY a
  --     former platform org. IMPORTANT: these move ONLY `= ANY(legacy)` rows and
  --     never org-less (NULL) rows — a NULL org on these tables can be a
  --     meaningful GLOBAL scope (e.g. a global attachment_target / unowned
  --     attachment) that must be preserved. Real tenant orgs are never touched.
  --     None of these columns carries a unique constraint on the org, so the
  --     move is collision-free. (Auto-created platform orgs hold none of this
  --     data, so this is a no-op in the expected prod state — it is here purely
  --     to guarantee nothing is left owned by the disabled legacy org.)
  UPDATE app.attachment
  SET owner_org_id = sigfarm_id
  WHERE owner_org_id = ANY(legacy_platform_ids);

  UPDATE app.attachment_target
  SET applies_org_id = sigfarm_id
  WHERE applies_org_id = ANY(legacy_platform_ids);

  UPDATE app.attachment_event
  SET actor_org_id = sigfarm_id
  WHERE actor_org_id = ANY(legacy_platform_ids);

  UPDATE app.analysis_attachment_effective
  SET captured_applies_org_id = sigfarm_id
  WHERE captured_applies_org_id = ANY(legacy_platform_ids);

  UPDATE app.attachment_map_filter_session
  SET actor_org_id = sigfarm_id
  WHERE actor_org_id = ANY(legacy_platform_ids);

  UPDATE app.car_map_search_session
  SET actor_org_id = sigfarm_id
  WHERE actor_org_id = ANY(legacy_platform_ids);

  -- 5c. Structural rows (NOT NULL org, unique per org+key) owned by the legacy
  --     platform org move to sigfarm. Touch ONLY legacy-owned rows — never a
  --     real tenant's groups/permissions, never NULL.
  UPDATE app.org_group
  SET org_id = sigfarm_id
  WHERE org_id = ANY(legacy_platform_ids);

  UPDATE app.org_user_permission
  SET org_id = sigfarm_id
  WHERE org_id = ANY(legacy_platform_ids);

  -- 6. Current automation API clients become TENANT clients of sigfarm (the
  --    api_client_kind_org_check requires TENANT => org_id NOT NULL). This
  --    targets org-less / former-platform / PLATFORM-kind clients only; tenant
  --    clients of real orgs are left untouched.
  UPDATE app.api_client
  SET kind = 'TENANT', org_id = sigfarm_id, status = 'active'
  WHERE org_id IS NULL
     OR org_id = ANY(legacy_platform_ids)
     OR kind = 'PLATFORM';

  -- 7. Every current user becomes an admin of sigfarm. Re-points existing
  --    sigfarm memberships to admin too. Memberships in the now-disabled legacy
  --    platform org(s) are left in place (inert: the org is disabled).
  INSERT INTO app.org_membership (org_id, user_id, role)
  SELECT sigfarm_id, u.id, 'admin'::app.org_role
  FROM app.app_user u
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'admin'::app.org_role;

  -- 8. sigfarm is now a PLATFORM org → it must not carry tenant feature flags
  --    (PLATFORM features are granted in code, not per-org rows).
  DELETE FROM app.org_feature_access WHERE org_id = sigfarm_id;
END $$;
