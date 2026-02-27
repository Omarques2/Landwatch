import { authClient, resolveReturnTo } from "./sigfarm-auth";

type AcquireApiTokenOptions = {
  forceRefresh?: boolean;
  interactive?: boolean;
  reason?: string;
};

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
  const loginUrl = authClient.buildLoginUrl({ returnTo: safeReturnTo });
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

  await authClient.exchangeSession();
  token = await authClient.getAccessToken();
  if (token) return token;

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
