# AuthZ Matrix

This table documents the guard coverage for admin, RLS, and Power BI endpoints.

| Route group | Guards | Notes |
| --- | --- | --- |
| /admin/* | AuthGuard + PlatformAdminGuard | Admin-only surface |
| /admin/rls/* | AuthGuard + PlatformAdminGuard | RLS operations |
| /admin/powerbi/* | AuthGuard + PlatformAdminGuard | Power BI catalog ops |
| /powerbi/* | AuthGuard + ActiveUserGuard | Requires active user + membership |
| /admin/bootstrap/* | AuthGuard + BOOTSTRAP_TOKEN header | One-time bootstrap |
| /users/me | AuthGuard | User profile/status |

Additional notes:
- Platform admin is scoped to appKey=PBI_EMBED.
- ActiveUserGuard blocks pending/disabled users and users without active memberships.
