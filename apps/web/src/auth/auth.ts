import {
  authClient,
  buildAuthCallbackReturnTo,
  buildAuthPortalLoginUrl,
  resolveReturnTo,
  sigfarmAuthApiBaseUrl,
} from "./sigfarm-auth";
import { AuthApiError } from "@sigfarm/auth-client-vue";

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
  await authClient.logout();
  if (typeof window !== "undefined") {
    window.location.assign("/login");
  }
}

export async function hardResetAuthState(): Promise<void> {
  authClient.clearSession();
}

export async function acquireApiToken(
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
