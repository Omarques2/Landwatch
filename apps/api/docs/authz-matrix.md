# AuthZ Matrix

This table documents the guard coverage for MVP endpoints.

| Route group | Guards | Notes |
| --- | --- | --- |
| /v1/admin/api-keys/* | AuthGuard + PlatformAdminGuard | Admin-only API key management |
| /v1/users/me | AuthGuard | User profile/status |
| /v1/farms/* | AuthGuard + ActiveUserGuard | Farm CRUD |
| /v1/analyses/* | AuthGuard + ActiveUserGuard | Analyses |
| /v1/cars/* | AuthGuard + ActiveUserGuard | CAR lookup |

Additional notes:
- Platform admin uses a subject allowlist (env `PLATFORM_ADMIN_SUBS`).
- ActiveUserGuard blocks disabled users.
