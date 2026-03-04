# AuthZ Matrix

This table documents the guard coverage for MVP endpoints.

| Route group | Guards | Notes |
| --- | --- | --- |
| /v1/admin/api-keys/* | AuthGuard + PlatformAdminGuard | Admin-only API key management |
| /v1/users/me | AuthGuard + ActiveUserGuard | User profile/status |
| /v1/farms/* | AuthGuard + ActiveUserGuard | Farm CRUD |
| /v1/analyses/* | AuthGuard + ActiveUserGuard | User analyses (web) |
| /v1/schedules/* | AuthGuard + ActiveUserGuard | User schedules (web) |
| /v1/cars/* | AuthGuard + ActiveUserGuard | CAR lookup |
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
- Platform admin uses a subject allowlist (env `PLATFORM_ADMIN_SUBS`).
- ActiveUserGuard blocks disabled users.
- Automation endpoints use auth mode `automation` and do not accept JWT-only access.
