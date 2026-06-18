# Runbook — Reconcile `sigfarm` as the PLATFORM org (prod data migration)

Migration: `apps/api/prisma/migrations/20260617120000_reconcile_sigfarm_platform_org/migration.sql`
Applied automatically by GitHub Actions (`cd-main.yml`) via `npx prisma migrate deploy` in `api-staging` then (after manual approval) `api-prod`. **No manual pgAdmin writes.**

## What it does (idempotent, one transaction)
1. Ensures the `sigfarm` org exists (guaranteed in prod; created if absent elsewhere).
2. Captures existing PLATFORM org(s) other than sigfarm (the auto-created `landwatch-platform`).
3. Demotes + disables them (frees the `org_single_platform_kind_idx` single-PLATFORM unique index) **before** promoting sigfarm.
4. Promotes `sigfarm` → `PLATFORM`/active.
5. Moves all org-less + former-platform farms/analyses/schedules → sigfarm (no CAR collisions per guarantee).
5b/5c. Re-points the remaining org-referencing tables **owned by the legacy platform org** → sigfarm: `attachment`, `attachment_target`, `attachment_event`, `analysis_attachment_effective`, `attachment_map_filter_session`, `car_map_search_session`, `org_group`, `org_user_permission`. NULL (global-scope) rows are **preserved**; real tenant orgs untouched.
6. Reclassifies org-less / former-platform / PLATFORM API clients → `TENANT` of sigfarm, `active` (satisfies `api_client_kind_org_check`). Real tenant clients untouched.
7. Makes **every current user** an `admin` member of sigfarm (upsert).
8. Deletes sigfarm's tenant feature-flag rows (PLATFORM grants features in code).

## Deploy sequence
1. Commit + push the migration (and the platform-operator code) to `main`.
2. Let `api-build` → `api-staging` run. **Validate staging (below).**
3. Approve `api-prod` (production environment gate). Validate prod (below).
4. `web-prod` follows.

## Prechecks (before approving prod)
```sql
select id, name, slug, kind, status from app.org order by created_at;
-- expect a row slug='sigfarm' in prod; the PLATFORM org is likely 'landwatch-platform'
```

### Org-reference audit (every org-referencing table)
The migration re-points all org FKs. For the attachment/session tables it moves
ONLY rows owned by the legacy platform org (`= legacy`), and **preserves NULL
org** (a NULL there can be an intentional GLOBAL scope — e.g. a global
`attachment_target`). Run this to see the state and confirm nothing important is
left on the legacy org. `L` = the legacy platform org id (the `PLATFORM` row that
is NOT sigfarm).
```sql
-- moved when = legacy (NULL preserved as global/unowned):
select count(*) from app.attachment                   where owner_org_id is not null;
select count(*) from app.attachment_target            where applies_org_id is not null;
select count(*) from app.attachment_event             where actor_org_id is not null;
select count(*) from app.analysis_attachment_effective where captured_applies_org_id is not null;
select count(*) from app.attachment_map_filter_session where actor_org_id is not null;
select count(*) from app.car_map_search_session       where actor_org_id is not null;
-- structural (NOT NULL); expect 0 rows pointing at the legacy platform org:
select count(*) from app.org_group;
select count(*) from app.org_user_permission;
-- how much is owned by the legacy platform org L (this is what moves):
-- select count(*) from app.attachment where owner_org_id = 'L';  -- etc.
```
If any of these hold rows owned by the legacy org, the migration moves them to
sigfarm. If they hold NULL (global) rows you believe should also become
sigfarm-owned, that's a deliberate review decision — handle it explicitly, not
via this migration (it intentionally preserves NULL=global).

## Post-deploy verification (run in staging, then prod)
```sql
-- sigfarm is the single PLATFORM org; landwatch-platform demoted+disabled
select slug, kind, status from app.org order by created_at;
--   sigfarm            -> PLATFORM / active
--   landwatch-platform -> TENANT  / disabled   (if it existed)

-- no org-less operational rows remain
select count(*) from app.farm             where org_id is null;  -- 0
select count(*) from app.analysis         where org_id is null;  -- 0
select count(*) from app.analysis_schedule where org_id is null; -- 0

-- all operational data belongs to sigfarm
select o.slug, o.kind, count(*) from app.farm f     join app.org o on o.id=f.org_id group by 1,2;
select o.slug, o.kind, count(*) from app.analysis a join app.org o on o.id=a.org_id group by 1,2;
--   sigfarm / PLATFORM -> all rows  (prod ~134 farms / ~735 analyses)

-- every user is an admin of sigfarm
select count(*) from app.org_membership m
  join app.org o on o.id=m.org_id
 where o.slug='sigfarm' and m.role='admin';            -- = total users
select count(*) from app.app_user;                      -- same number

-- API clients are TENANT of sigfarm
select c.name, c.kind, c.status, o.slug
from app.api_client c left join app.org o on o.id=c.org_id order by c.created_at;
--   all -> TENANT / active / sigfarm

-- sigfarm carries no tenant feature flags
select count(*) from app.org_feature_access fa join app.org o on o.id=fa.org_id
 where o.slug='sigfarm';                                -- 0

-- the disabled legacy org owns no operational/attachment/structural data
-- (memberships are intentionally left and are inert since the org is disabled)
with L as (select id from app.org where kind='TENANT' and status='disabled' and slug<>'sigfarm')
select
 (select count(*) from app.farm where org_id in (select id from L))                       as farms,
 (select count(*) from app.analysis where org_id in (select id from L))                   as analyses,
 (select count(*) from app.analysis_schedule where org_id in (select id from L))          as schedules,
 (select count(*) from app.api_client where org_id in (select id from L))                 as api_clients,
 (select count(*) from app.attachment where owner_org_id in (select id from L))           as attachments,
 (select count(*) from app.attachment_target where applies_org_id in (select id from L))  as att_targets,
 (select count(*) from app.org_group where org_id in (select id from L))                  as groups,
 (select count(*) from app.org_user_permission where org_id in (select id from L))        as perms;
-- all expected 0
```

## Notes / caveats
- Validated by static review (no local Postgres available); the authoritative check is the staging `migrate deploy`. If staging fails, prod is never reached (the env gate).
- Memberships in the now-disabled `landwatch-platform` are left in place (inert — org disabled).
- All users become `admin` of the PLATFORM org → all become platform admins (per product decision; current prod = Sigfarm staff only). Future external client users should be added as `member` of their own TENANT org, not sigfarm.
- Requires the platform-operator **code** (the `isPlatformUser` work) deployed alongside for operator behavior; the migration is the data side.
