# Auth Token Reuse + Guard Bootstrap + CORS — Correction Plan (2026-06-17)

Investigated with systematic-debugging against source + `testlandwatch.sigfarmintelligence.com.har` (staging, 30.3s, 70 entries). Root causes are **proven from evidence**, not assumed.

## Evidence (HAR)
- **20× `POST /v1/auth/refresh`** + 20 preflights in 30s. Each response: `expiresInSeconds: 900`, valid body `{accessToken, refreshToken, expiresInSeconds, tokenType}`.
- **7× `GET /v1/users/access-status`** (the guard's profile fallback).
- `/v1/users/me` ×1, `/v1/access/me` ×1 (these ARE cached — me.ts TTL works).
- Every request has a 1:1 `OPTIONS` (two cross-origin hosts: auth `api-testauth…`, API `landwatch-api-staging…`).
- Refreshes come in **pairs** then an access-status/API call — one burst per navigation.
- **The refresh requests carry NO `x-correlation-id`.** The vendor client's `requestJson` ALWAYS sets `x-correlation-id` ([auth-client.js:313]); the manual fallback (`auth.ts`) sends only `content-type`. → **All 20 refreshes are the manual fallback, not the vendor client.**

## Root Causes (proven)

**RC1 — access token is never cached (Problem 1).**
The vendor client (`@sigfarm/auth-client-vue`) *does* cache (`tokenSnapshot` + `expiresAtEpochMs`, fresh ~900s) — but in staging its token path yields nothing, so [auth.ts:106-135](apps/web/src/auth/auth.ts#L106) falls through to `refreshAccessTokenFromCookieSession()` (raw `POST /v1/auth/refresh`). That fallback **returns the token but stores it nowhere** — not in a local cache, and there's no API to push it into the client's `tokenSnapshot`. The existing single-flight (`tokenInflight`) only dedups *concurrent* callers, not sequential ones. So every `acquireApiToken()` — the Axios request interceptor (per request, [http.ts:84]), `me.ts authenticatedGet`, and the guard — triggers a brand-new refresh. `expiresInSeconds: 900` is ignored.

**RC2 — guard bootstraps the session on every navigation (Problem 2).**
[auth-guard.ts:138](apps/web/src/router/auth-guard.ts#L138) runs `ensureSessionWithExchange` for each protected route. `authClient.ensureSession()` returns null (no `tokenSnapshot`) → `exchangeSession()` (no usable token) → `hasProfileFallback()` → `GET /v1/users/access-status`. That's the per-nav refresh-pair + access-status churn. (No `/v1/auth/session` appears in the HAR because `ensureSession()` early-returns null when `getAccessToken()` is null.)

**RC3 — preflight repetition (Problem 3).**
The in-repo API CORS is already correct: `maxAge: 600` and `allowedHeaders` unset so it reflects `Access-Control-Request-Headers` ([main.ts:60-68](apps/api/src/main.ts#L60)). The gap is the **external auth service** (`api-testauth…`, the `sigfarm-auth-platform` deployment) whose `/v1/auth/refresh` preflight has **no `Access-Control-Max-Age`** → preflight repeats. That service is not in this repo. NOTE: fixing RC1 cuts refreshes to ~1/15min, so the auth-preflight storm largely disappears regardless.

## Robust Solution

The vendor client path is unreliable in staging and we can't inject a token into it. The robust, in-our-control, vendor-agnostic fix is an **app-level access-token cache** keyed off the token's own expiry, reused by the interceptor, `me.ts`, and the guard.

---

### Fix 1 — App-level access token cache (auth.ts)

**File:** `apps/web/src/auth/auth.ts`

- [ ] **Step 1: Capture `expiresInSeconds` from the manual fallback**

Change `refreshAccessTokenFromCookieSession` to also return the lifetime:
```ts
type CookieRefreshResult =
  | { kind: "ok"; token: string; expiresInSeconds: number | null }
  | { kind: "unauthorized" }
  | { kind: "failed" };

async function refreshAccessTokenFromCookieSession(): Promise<CookieRefreshResult> {
  try {
    const endpoint = new URL("/v1/auth/refresh", sigfarmAuthApiBaseUrl).toString();
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (response.status === 401) return { kind: "unauthorized" };
    if (!response.ok) return { kind: "failed" };
    const payload = await response.json().catch(() => null);
    const accessToken = payload?.data?.accessToken;
    const expiresInSeconds =
      typeof payload?.data?.expiresInSeconds === "number"
        ? payload.data.expiresInSeconds
        : null;
    if (typeof accessToken === "string" && accessToken.length > 0) {
      return { kind: "ok", token: accessToken, expiresInSeconds };
    }
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
```

- [ ] **Step 2: Add the cache + JWT-exp helper + store/clear**

Add near the top (after `tokenInflight`):
```ts
type CachedToken = { token: string; expMs: number };
let cachedToken: CachedToken | null = null;
// Refresh a bit before expiry so in-flight requests never carry an
// about-to-expire token.
const TOKEN_EXP_MARGIN_MS = 60_000;

function decodeJwtExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = JSON.parse(
      atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof json?.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function storeToken(token: string, expiresInSeconds?: number | null): string {
  const expMs =
    decodeJwtExpMs(token) ??
    (expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : Date.now() + 900_000);
  cachedToken = { token, expMs };
  return token;
}

function cachedTokenIfFresh(): string | null {
  if (!cachedToken) return null;
  if (Date.now() < cachedToken.expMs - TOKEN_EXP_MARGIN_MS) return cachedToken.token;
  return null;
}

export function clearApiTokenCache(): void {
  cachedToken = null;
}
```

- [ ] **Step 3: Short-circuit `acquireApiToken` on cache hit; store on every success**

```ts
export async function acquireApiToken(
  options: AcquireApiTokenOptions = {},
): Promise<string> {
  if (isLocalAuthBypassEnabled()) return "";

  if (options.forceRefresh) {
    cachedToken = null; // a forced refresh must not return a stale cached token
    return acquireAndStore(options);
  }
  const fresh = cachedTokenIfFresh();
  if (fresh) return fresh;

  if (tokenInflight) return tokenInflight;
  tokenInflight = acquireAndStore(options).finally(() => {
    tokenInflight = null;
  });
  return tokenInflight;
}

async function acquireAndStore(options: AcquireApiTokenOptions): Promise<string> {
  const token = await acquireApiTokenInner(options);
  return storeToken(token);
}
```
In `acquireApiTokenInner`, the manual-fallback success path must pass the lifetime through:
```ts
    const refreshResult = await refreshAccessTokenFromCookieSession();
    if (refreshResult.kind === "ok") {
      return storeToken(refreshResult.token, refreshResult.expiresInSeconds);
    }
```
(Returning via `storeToken` here is redundant with `acquireAndStore` but harmless and keeps the lifetime; alternatively thread `expiresInSeconds` out — pick one. Simplest: keep `acquireApiTokenInner` returning the string and let `acquireAndStore` store via JWT exp, since the JWT `exp` is authoritative and present in the token.)

- [ ] **Step 4: Clear cache on logout / hard reset**

In `logout()` and `hardResetAuthState()` add `clearApiTokenCache();` alongside `authClient.clearSession();`.

- [ ] **Step 5: Tests** — `apps/web/src/auth/__tests__/acquire-api-token.spec.ts`
  - cache hit: two sequential `acquireApiToken()` → underlying `authClient`/fetch called once.
  - expiry: advance clock past `expMs - margin` → second call re-acquires.
  - `forceRefresh: true` → bypasses cache, re-acquires, updates cache.
  - `clearApiTokenCache()` → next call re-acquires.
  - bypass mode returns "".
  (Mock `authClient.getAccessToken`/`exchangeSession` + `globalThis.fetch`; inject a controllable clock or use `vi.useFakeTimers`.)

**Success criteria:** after the first token, no `/v1/auth/refresh` until ~840s later (900 − 60 margin). `forceRefresh` still works for the 401 retry path.

---

### Fix 2 — Guard uses the cached token as the session signal (auth-guard.ts + router/index.ts)

**Files:** `apps/web/src/router/auth-guard.ts`, `apps/web/src/router/index.ts`

The guard should treat "we can get a valid API token" as "session is valid", reusing Fix 1's cache instead of re-running `ensureSession`/`exchangeSession`/`access-status` per navigation.

- [ ] **Step 1: Add `acquireToken` to guard deps**

`router/index.ts`:
```ts
import { acquireApiToken } from "@/auth/auth";
// ...
createAuthNavigationGuard({
  acquireToken: () => acquireApiToken({ reason: "auth-guard" }),
  getMeResult,
  getAccessStatus,
  getAccessCached,
  // keep ensureSession/exchangeSession only if still needed for /login callback
});
```

- [ ] **Step 2: Replace `ensureSessionWithExchange` with a token check on protected routes**

In `authNavigationGuard`, for `to.meta.requiresAuth`:
```ts
let token: string | null = null;
try {
  token = await deps.acquireToken();
} catch {
  token = null;
}
if (!token) return `/login?returnTo=${encodeURIComponent(to.fullPath || to.path)}`;
if (to.path === "/pending") return true;
return enforceAccess(to);
```
`acquireApiToken` already bootstraps on cold boot (exchange + manual fallback) and now caches, so the first navigation pays one refresh and the rest are instant cache hits. The `/login` branch keeps its existing cold-boot bootstrap. Drop the `hasProfileFallback()` → `/users/access-status` churn (keep `getAccessStatus` only as the `enforceAccess` identity fallback it already is).

- [ ] **Step 3: Update guard unit tests** (`auth-guard` spec) to inject `acquireToken` (resolves token → allowed; throws/empty → `/login`). Remove assertions that expected `exchangeSession`/`access-status` per navigation.

**Success criteria:** switching `/dashboard` ↔ `/analyses` ↔ `/farms` triggers no auth refresh and no `/users/access-status`; users are not bounced to `/pending` on transient blips (the `getMeResult` transient handling already covers this).

---

### Fix 3 — CORS / preflight

- [ ] **Step 1 (in-repo, verify only):** API CORS already sets `maxAge: 600` and reflects request headers ([main.ts:60-68]). Confirm `CORS_MAX_AGE` and `CORS_CREDENTIALS` are set in the staging API env. No code change needed.
- [ ] **Step 2 (external — flag, cannot fix here):** the auth service (`api-testauth…`, `sigfarm-auth-platform`) must add `Access-Control-Max-Age` (e.g. 600) and keep `Access-Control-Allow-Credentials: true` + specific origin on `/v1/auth/refresh`. Owned by the auth platform repo/deploy — raise there. NOTE: Fix 1 alone reduces `/v1/auth/refresh` to ~1/15min, so this is secondary.
- [ ] **Step 3 (optional, long-term):** put API + auth behind the same origin as the web app (reverse proxy), as already done in dev via the Vite proxy ([http.ts:18-24]). Same-origin removes the cross-origin preflight entirely. Infra decision.

---

### Optional Fix 0 — temporary instrumentation (validate in staging)
Behind `import.meta.env.DEV || VITE_AUTH_DEBUG`, `console.debug` in `auth.ts`: `getAccessToken hit/miss`, `exchange ok/fail`, `fallback refresh used`, `expiresInSeconds`, `token cache hit/miss`. Ship to staging, capture a fresh HAR, then remove. Confirms the cache hit-rate and which path produces the token.

## Validation (re-capture HAR after deploy)
- `/v1/auth/refresh`: ~1 on boot, not per navigation.
- `/v1/users/me`, `/v1/access/me`: respect the 45s TTL.
- `/v1/users/access-status`: ~0.
- `OPTIONS`: drastically reduced (cross-origin preflights only on cache-miss boundaries).

## Gates
`apps/web`: `npm run typecheck` · `npm test -- --run` · `npm run build`. No commits unless requested.
