import {
  authClient,
  buildAuthCallbackReturnTo,
  buildAuthPortalLoginUrl,
  resolveReturnTo,
  sigfarmAuthApiBaseUrl,
} from "./sigfarm-auth";

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
    } catch {
      await authClient.exchangeSession();
    }
  }

  let token = await authClient.getAccessToken();
  if (token) return token;

  for (let attempt = 1; attempt <= TOKEN_BOOTSTRAP_ATTEMPTS; attempt += 1) {
    try {
      await authClient.exchangeSession();
    } catch {
      // keep going, manual refresh fallback below can still recover via cookie session
    }

    token = await authClient.getAccessToken();
    if (token) return token;

    token = await refreshAccessTokenFromCookieSession();
    if (token) return token;

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

async function refreshAccessTokenFromCookieSession(): Promise<string | null> {
  try {
    const endpoint = new URL("/v1/auth/refresh", sigfarmAuthApiBaseUrl).toString();
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const accessToken = payload?.data?.accessToken;
    return typeof accessToken === "string" && accessToken.length > 0 ? accessToken : null;
  } catch {
    return null;
  }
}
