# `/403`-despite-access Incident — Root Cause + Correction Plan (2026-06-17)

Investigated with systematic-debugging against `UsuarioSemPermissãotestlandwatch…har`, `UsuarioAdmin…har`, `testlandwatch…har` + source. Root cause proven; Codex's proposals reviewed and largely **rejected as not-the-cause** (see end).

## Evidence (HAR: `UsuarioSemPermissão…`)
- User `otavio.marques20@hotmail.com`, `status: active`, memberships = **only** `776fd355` (role `member`). **Not** a PLATFORM member.
- Frontend sent `X-Org-Id: 72426d8b` (the PLATFORM org, which belongs to the *other* admin account) for the first ~108s → `/v1/access/me` **403 ×5**.
- At ~138s `X-Org-Id` switched to `776fd355` → `/access/me` **200**, features = **`["FARMS","ANALYSES","CAR_SEARCH"]`** (no `ANALYSIS_CREATE`, no `SCHEDULES`), `isPlatformAdmin: false`.
- Backend 403 is correct: [actor-context.service.ts:227](apps/api/src/auth/actor-context.service.ts#L227) throws `ORG_ACCESS_DENIED` when the requested org isn't a membership.

## Root Causes (two independent bugs)

**RC-A — stale / non-member active org sent as `X-Org-Id`.**
`activeOrgId` is an in-memory ref ([org-context.ts:9](apps/web/src/state/org-context.ts#L9)). `logout()` ([auth.ts:45]) clears the token + auth session but **never resets `activeOrgId` or the `me` cache** (`clearMeCache` is not called). `hydrateActiveOrgFromMemberships` only resets the active org when the current one is absent from memberships — but it runs against the **45s `me` cache**, so right after a membership change (admin added/removed `otavio20` from an org) the cached memberships are stale and the active org keeps pointing at an org the backend no longer accepts → `/access/me` 403. There is **no recovery**: a 403 → `getAccessCached` returns null → guard sees no features → `/403`.

**RC-B — the guard's "safe landing" requires a permission many users lack.**
`/` (and `""`) redirect to `/analyses/new` ([router/index.ts:30]), which requires `ANALYSIS_CREATE` ([:54]). The guard's fallback for any inaccessible route is also `/analyses/new` ([auth-guard.ts:60-62]):
```ts
if (!canAccessRoute(to, access)) {
  if (to.path !== "/analyses/new") return "/analyses/new";
  return "/403";
}
```
A tenant user **without `ANALYSIS_CREATE`** (exactly otavio20: `FARMS,ANALYSES,CAR_SEARCH`) is therefore bounced to `/analyses/new` → which they also can't access → `/403`. **This is the "já tinha acesso liberado mas ainda ia para /403"** — even with the correct org and real features, the landing route is forbidden to them.

## Fix Plan

### Fix B — guard lands users on a route they can actually access (highest impact, lowest risk)

**Files:** `apps/web/src/router/auth-guard.ts`, `apps/web/src/router/index.ts`

- [ ] Add a resolver that picks the first accessible route from access (order by product priority):
```ts
// auth-guard.ts
const FEATURE_ROUTE: Array<{ feature: AppFeature; path: string }> = [
  { feature: "ANALYSIS_CREATE", path: "/analyses/new" },
  { feature: "CAR_SEARCH", path: "/analyses/search" },
  { feature: "ANALYSES", path: "/analyses" },
  { feature: "FARMS", path: "/farms" },
  { feature: "SCHEDULES", path: "/schedules" },
];
function landingRouteFor(access: AccessMeResponse | null): string | null {
  if (access?.isPlatformAdmin) return "/dashboard";
  for (const { feature, path } of FEATURE_ROUTE) {
    if (access?.features?.includes(feature)) return path;
  }
  return null; // no accessible feature → real /403
}
```
- [ ] In `enforceAccess`, replace the hardcoded `/analyses/new` fallback:
```ts
if (!canAccessRoute(to, access)) {
  const landing = landingRouteFor(access);
  if (landing && to.path !== landing) return landing;
  return "/403";
}
```
- [ ] Make the post-login landing dynamic: add a lightweight `/` resolver (a `beforeEnter` or a tiny `LandingRedirect` view) that redirects to `landingRouteFor(await getAccessCached())` instead of a static `/analyses/new`. (Keeps `/analyses/new` for users who have `ANALYSIS_CREATE`.)
- [ ] Tests (`auth-guard.test.ts`): user with `["FARMS","ANALYSES","CAR_SEARCH"]` hitting a forbidden route → redirected to `/analyses` (not `/403`); user with no features → `/403`; platform admin → `/dashboard`.

### Fix A — active-org correctness + self-heal

**Files:** `apps/web/src/auth/auth.ts`, `apps/web/src/state/org-context.ts`, `apps/web/src/auth/me.ts`, guard.

- [ ] **A1 — reset org + identity on logout/user-change.** In `logout()` and `hardResetAuthState()` call `setActiveOrgId(null)` and `clearMeCache()`. Prevents one account's org leaking into the next session.
- [ ] **A2 — validate active org against fresh memberships.** On cold boot / login, force a fresh `me` (not the 45s cache) before hydrating; `hydrateActiveOrgFromMemberships` already drops an org that isn't a membership — feed it fresh data. Add `clearActiveOrgIfNotIn(memberships)` and call it after every `me` refresh so a removed-membership org can't linger.
- [ ] **A3 — self-heal on org-scoped 403.** In `me.ts`/guard: if `/access/me` returns 403 (`ORG_ACCESS_DENIED`/`ORG_NOT_FOUND`/`ORG_DISABLED`) while `me` is active with memberships, clear the active org, re-derive from memberships, and retry `/access/me` once. Only `/403` if it still fails. (Today a single 403 dead-ends at `/403`.)
- [ ] **A4 (backend hardening, optional but recommended).** For `orgMode: 'optional'` (used by `/access/me`, [access.controller.ts:25]), when `requestedOrg` is not a membership, **fall back to the user's default-membership context instead of throwing 403**. Access *discovery* should never hard-fail on a stale header. Keep strict 403 for tenant **write** endpoints (`orgMode: 'tenant'`). This makes the system resilient even if the frontend briefly sends a stale org.
- [ ] Tests: org-context drops a non-membership org; logout resets org + me cache; access/me 403 triggers one re-hydrate+retry; (backend) `fromSubject` with `orgMode:'optional'` + non-member org falls back instead of 403.

## Prod-readiness verdict
**Not yet.** RC-A and RC-B are real access-control UX defects that (a) block any tenant user lacking `ANALYSIS_CREATE` from entering the app at all, and (b) strand users on `/403` after org/membership changes. Both are in-repo, low-risk, test-covered fixes. Ship Fix B + Fix A (A1–A3 frontend; A4 optional backend) before production. The auth-token-reuse and org-null-guard work from earlier this day is independent and fine.

## Codex review — verified, mostly rejected
- **"PLATFORM member becomes `isPlatformAdmin` → over-privilege" → FALSE for current code.** `platformMembership()` already filters `role in ('owner','admin')` ([actor-context.service.ts:139]); a PLATFORM member is **not** an admin today, and a PLATFORM member using the platform org as tenant context is already blocked (`ORG_ACCESS_DENIED`, [:225]). The proposed `isPlatformUser`/`platformAdminOnly` split is a **product feature** (should platform members get operational access to platform-only modules?), not a bug fix, and is unrelated to this incident. Do **not** implement as part of this fix.
- **"1 user = 1 org DB unique index" → not the cause; do not implement now.** The affected user is in a single org; multi-org is allowed by schema (`@@unique([orgId,userId])`) and may be intended for admins. Forcing one-org needs a product decision + data audit/dedup migration and risks breaking legitimate multi-org accounts. The correct fix is graceful multi-org handling (validated active org + org switcher), not a hard DB constraint.
- **Net:** Codex identified neither real root cause (wrong active org; bad safe-landing). Its proposals are a security/feature tangent that current code already largely covers.

## Gates
`apps/web`: `npm run typecheck` · `npm test -- --run` · `npm run build`. `apps/api` (if A4): `npm run build` · `npm test`. No commits unless requested.
