# AuthZ Matrix

This table documents the guard coverage for MVP endpoints.

| Route group | Guards | Notes |
| --- | --- | --- |
| /v1/admin/api-keys/* | AuthGuard + PlatformAdminGuard | Admin-only API key management |
| /v1/users/me | AuthGuard + ActiveUserGuard | User profile/status |
| /v1/farms/* | AuthGuard + ActiveUserGuard + org feature `FARMS` | Org-scoped: tenant sees its org + public farms |
| /v1/analyses/* | AuthGuard + ActiveUserGuard + org feature `ANALYSES`/`ANALYSIS_CREATE` | Org-scoped; every analysis has an org (no null-org) |
| /v1/schedules/* | AuthGuard + ActiveUserGuard + org feature `SCHEDULES` | Schedules require an org-scoped farm; public/null-org farms cannot be scheduled |
| /v1/cars/* | AuthGuard + ActiveUserGuard + org feature `CAR_SEARCH` | CAR lookup, org-scoped sessions |
| /v1/attachments/* | AuthGuard + ActiveUserGuard + platform admin | Platform admins only; tenants cannot access attachment routes |
| /v1/access/me | AuthGuard + ActiveUserGuard | Returns active org, role, enabled features and permissions |
| /v1/dashboard/* | AuthGuard + ActiveUserGuard | Dashboard summary |
| /v1/alerts/* | AuthGuard + ActiveUserGuard | Alerts list |
| /v1/landwatch/* | AuthGuard + ActiveUserGuard | Landwatch status |
| /v1/automation/auth/me | ApiKeyGuard + ApiKeyScopes(analysis_read) | Automation API key self-check |
| /v1/automation/analyses | ApiKeyGuard + ApiKeyScopes(analysis_write) | Automation analysis creation |
| /v1/automation/analyses/:id | ApiKeyGuard + ApiKeyScopes(analysis_read) | Automation analysis detail |
| /v1/automation/analyses/:id/map | ApiKeyGuard + ApiKeyScopes(analysis_read) | Automation analysis map |
| /v1/public/analyses/* | Public | Public analysis view by id |
| /health, /ready | Public | Liveness/readiness |
| /internal/schedules/run-due | Public + x-job-token | Internal job endpoint guarded by shared token |

Additional notes:
- **Platform admin** means either a subject in `PLATFORM_ADMIN_SUBS` (or the local dev bypass) or an active user with owner/admin membership in an active org whose `kind` is `PLATFORM`. This is resolved centrally by `ActorContextService` and reused everywhere (admin, attachments, guards). Env/dev-bypass admins without a `user` row are auto-provisioned on first use.
- ActiveUserGuard blocks disabled users.
- Automation endpoints use auth mode `automation` and do not accept JWT-only access.
- **Org feature access is opt-in.** `org_feature_access.enabled` defaults to `false`. A new TENANT org starts with **no** features enabled; a platform admin enables them via `PATCH /v1/admin/orgs/:id/features` before first use. Only tenant features (`FARMS`, `ANALYSES`, `ANALYSIS_CREATE`, `CAR_SEARCH`, `SCHEDULES`) are configurable. `ATTACHMENTS`/`ATTACHMENTS_REVIEW` exist in the enum but are unused (attachments are platform-only).
- **Org kinds.** A single `PLATFORM` org holds platform-owned/legacy data. Non-platform-admin members cannot use the PLATFORM org as a tenant context. Feature access cannot be configured for non-TENANT orgs.
- **Automation API keys.** A `TENANT` key is pinned to its own org. A `PLATFORM` key carries no org; for analysis creation it must specify the target tenant org via `X-Org-Id` (`POST /v1/automation/analyses`). Analysis creation never writes a null org, and an analysis created in org X cannot reference a farm owned by org Y (enforced for all actors, including platform admins).
- **Legacy API clients** with `org_id IS NULL` are disabled by migration and must be audited before re-enabling — they would otherwise become PLATFORM (super-admin) clients.
