import {
  authClient,
  buildAuthCallbackReturnTo,
  buildAuthPortalLoginUrl,
  resolveReturnTo,
  sigfarmAuthApiBaseUrl,
} from "./sigfarm-auth";
import { AuthApiError } from "@sigfarm/auth-client-vue";
import { isLocalAuthBypassEnabled } from "./local-bypass";
import { clearRejectedOrgs, setActiveOrgId } from "@/state/org-context";

type AcquireApiTokenOptions = {
  forceRefresh?: boolean;
  interactive?: boolean;
  reason?: string;
};

const TOKEN_BOOTSTRAP_ATTEMPTS = 3;
const TOKEN_BOOTSTRAP_DELAY_MS = 350;

export function getActiveAccount(): null {
  // Compat layer: local OAuth account no longer exists.
  return null;
}

export async function initAuthSafe(_timeoutMs = 4_000): Promise<boolean> {
  if (isLocalAuthBypassEnabled()) return true;
  try {
    const session = await authClient.ensureSession();
    return Boolean(session);
  } catch {
    authClient.clearSession();
    return false;
  }
}

export async function login(returnTo?: string): Promise<void> {
  const safeReturnTo = resolveReturnTo(returnTo);
  const callbackReturnTo = buildAuthCallbackReturnTo(safeReturnTo);
  const loginUrl = buildAuthPortalLoginUrl(callbackReturnTo);
  if (typeof window !== "undefined") {
    window.location.assign(loginUrl);
  }
}

export async function logout(): Promise<void> {
  await Promise.allSettled([
    revokeSigfarmSessionBestEffort(),
    signOutBetterAuthSessionBestEffort(),
  ]);
  clearApiTokenCache();
  resetOrgState();
  authClient.clearSession();
  if (typeof window !== "undefined") {
    window.location.assign("/login");
  }
}

export async function hardResetAuthState(): Promise<void> {
  clearApiTokenCache();
  resetOrgState();
  authClient.clearSession();
}

// Drop the active org + session-rejected orgs so one account's org context can
// never leak into the next session/login.
function resetOrgState(): void {
  setActiveOrgId(null);
  clearRejectedOrgs();
}

// Single-flight guard for the non-forced token acquisition. Concurrent callers
// (e.g. getMeCached + getAccessCached firing in parallel on boot, or several
// HTTP requests at once) share ONE in-flight acquisition instead of each
// running exchangeSession()/refresh in parallel (which would race the refresh
// token). The token is app-wide, so a single shared result is correct.
let tokenInflight: Promise<string> | null = null;

// In-memory access-token cache. The app's working token path in some
// environments is the cookie-session refresh fallback, whose token the auth
// client does not retain — without this cache every request/navigation would
// trigger a fresh /v1/auth/refresh. We key freshness off the token's own expiry
// (JWT `exp`, falling back to a conservative TTL) minus a safety margin.
type CachedToken = { token: string; expMs: number };
let cachedToken: CachedToken | null = null;
const TOKEN_EXP_MARGIN_MS = 60_000;
const TOKEN_DEFAULT_TTL_MS = 900_000;

function decodeJwtExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function storeToken(token: string): string {
  const expMs = decodeJwtExpMs(token) ?? Date.now() + TOKEN_DEFAULT_TTL_MS;
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

export async function acquireApiToken(
  options: AcquireApiTokenOptions = {},
): Promise<string> {
  if (isLocalAuthBypassEnabled()) {
    return "";
  }
  // A forced refresh explicitly wants a fresh token and must not return (or be
  // deduped with) the cached/ongoing non-forced acquisition.
  if (options.forceRefresh) {
    cachedToken = null;
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
  return storeToken(await acquireApiTokenInner(options));
}

async function acquireApiTokenInner(
  options: AcquireApiTokenOptions = {},
): Promise<string> {
  if (options.forceRefresh) {
    try {
      await authClient.refreshSession();
    } catch (error) {
      if (isUnauthorizedAuthError(error)) {
        throw buildNoActiveSessionError(options.reason);
      }
      try {
        await authClient.exchangeSession();
      } catch (exchangeError) {
        if (isUnauthorizedAuthError(exchangeError)) {
          throw buildNoActiveSessionError(options.reason);
        }
        throw exchangeError;
      }
    }
  }

  let token = await authClient.getAccessToken();
  if (token) return token;

  for (let attempt = 1; attempt <= TOKEN_BOOTSTRAP_ATTEMPTS; attempt += 1) {
    try {
      await authClient.exchangeSession();
    } catch (error) {
      if (isUnauthorizedAuthError(error)) {
        throw buildNoActiveSessionError(options.reason);
      }
      // keep going, manual refresh fallback below can still recover via cookie session
    }

    token = await authClient.getAccessToken();
    if (token) return token;

    const refreshResult = await refreshAccessTokenFromCookieSession();
    if (refreshResult.kind === "ok") return refreshResult.token;
    if (refreshResult.kind === "unauthorized") {
      throw buildNoActiveSessionError(options.reason);
    }

    if (attempt < TOKEN_BOOTSTRAP_ATTEMPTS) {
      await delay(TOKEN_BOOTSTRAP_DELAY_MS);
    }
  }

  throw new Error(
    `No active authentication session${options.reason ? ` (${options.reason})` : ""}`,
  );
}

export function startAuthLifecycleRecovery(): void {
  // No-op: refresh lifecycle is handled internally by authClient.
}

export function stopAuthLifecycleRecoveryForTests(): void {
  // No-op for compatibility with existing tests.
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

type CookieRefreshResult =
  | { kind: "ok"; token: string }
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
    if (typeof accessToken === "string" && accessToken.length > 0) {
      return { kind: "ok", token: accessToken };
    }
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

function isUnauthorizedAuthError(error: unknown): boolean {
  if (error instanceof AuthApiError) {
    return error.status === 401;
  }

  if (!error || typeof error !== "object") return false;
  const maybeStatus =
    (error as { status?: unknown }).status ??
    (error as { response?: { status?: unknown } }).response?.status;
  return maybeStatus === 401;
}

function buildNoActiveSessionError(reason?: string): Error {
  return new Error(`No active authentication session${reason ? ` (${reason})` : ""}`);
}

async function revokeSigfarmSessionBestEffort(): Promise<void> {
  const endpoint = new URL("/v1/auth/logout", sigfarmAuthApiBaseUrl).toString();
  const token = await authClient.getAccessToken().catch(() => null);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers,
    body: "{}",
  }).catch(() => undefined);
}

async function signOutBetterAuthSessionBestEffort(): Promise<void> {
  const endpoint = new URL("/api/auth/sign-out", sigfarmAuthApiBaseUrl).toString();
  await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: "{}",
  }).catch(() => undefined);
}
