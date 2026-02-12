import {
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  InteractionRequiredAuthError,
} from "@azure/msal-browser";
import { isTransientMsalError, runWithRetryBackoff } from "./resilience";

const clientId = import.meta.env.VITE_ENTRA_SPA_CLIENT_ID as string;
const authority = import.meta.env.VITE_ENTRA_AUTHORITY as string;

const envRedirectUri = import.meta.env.VITE_ENTRA_REDIRECT_URI as string | undefined;
const envPostLogoutRedirectUri = import.meta.env.VITE_ENTRA_POST_LOGOUT_REDIRECT_URI as string | undefined;

const apiScope = import.meta.env.VITE_ENTRA_API_SCOPE as string;
const SILENT_TOKEN_TIMEOUT_MS = 7_000;

// Opcional (somente CIAM/B2C/custom domains)
const knownAuthority = (import.meta.env.VITE_ENTRA_KNOWN_AUTHORITY as string | undefined) ?? undefined;

if (!clientId) throw new Error("Missing VITE_ENTRA_SPA_CLIENT_ID");
if (!authority) throw new Error("Missing VITE_ENTRA_AUTHORITY");
const redirectUri = resolveRedirectUri();
const postLogoutRedirectUri = resolvePostLogoutRedirectUri();

function resolveRedirectUri(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/auth/callback`;
  }
  if (envRedirectUri) return envRedirectUri;
  throw new Error("Missing redirectUri (window origin unavailable)");
}

function resolvePostLogoutRedirectUri(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/`;
  }
  if (envPostLogoutRedirectUri) return envPostLogoutRedirectUri;
  throw new Error("Missing postLogoutRedirectUri (window origin unavailable)");
}
if (!apiScope) throw new Error("Missing VITE_ENTRA_API_SCOPE");

const isCiamLike =
  authority.includes(".ciamlogin.com/") ||
  authority.includes(".b2clogin.com/");

export const msal = new PublicClientApplication({
  auth: {
    clientId,
    authority,
    redirectUri,
    postLogoutRedirectUri,
    navigateToLoginRequestUrl: false,
    ...(isCiamLike && knownAuthority ? { knownAuthorities: [knownAuthority] } : {}),
  },
  cache: {
    cacheLocation: "localStorage",
    // Safari/Edge costumam perder estado sem cookie fallback.
    storeAuthStateInCookie: true,
  },
});

let initPromise: Promise<void> | null = null;
let resetInProgress = false;
let tokenGate: Promise<void> = Promise.resolve();
let tokenInFlight: Promise<string> | null = null;
let lifecycleStarted = false;
let lifecycleTimer: number | null = null;
let recoveryInFlight: Promise<void> | null = null;
let lastRecoveryAt = 0;

type AcquireApiTokenOptions = {
  forceRefresh?: boolean;
  interactive?: boolean;
  reason?: string;
};

function isInteractiveAllowed(options?: AcquireApiTokenOptions): boolean {
  return options?.interactive !== false;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

/**
 * Inicializa MSAL + processa redirect exatamente 1x (robusto para produção).
 */
export function initAuthOnce(): Promise<void> {
  if (!initPromise) initPromise = initAuth();
  return initPromise;
}

export async function initAuth(): Promise<void> {
  try {
    await msal.initialize();

    const result = await msal.handleRedirectPromise();
    if (result?.account) {
      msal.setActiveAccount(result.account);
      return;
    }

    // Restaura conta se já existir no cache
    const accounts = msal.getAllAccounts();
    msal.setActiveAccount(accounts[0] ?? null);
  } catch (err) {
    await hardResetAuthState();
    throw err;
  }
}

export function getActiveAccount(): AccountInfo | null {
  return msal.getActiveAccount() ?? null;
}

export async function login(): Promise<void> {
  await msal.loginRedirect({
    scopes: ["openid", "profile", "email", apiScope],
    prompt: "select_account",
  });
}

export async function logout(): Promise<void> {
  await msal.logoutRedirect();
}

function shouldClearAuthStorageKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("msal")) return true;
  if (normalized.includes(clientId.toLowerCase())) return true;
  return false;
}

function clearStorageScope(storage: Storage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  for (const key of keys) {
    if (shouldClearAuthStorageKey(key)) {
      storage.removeItem(key);
    }
  }
}

async function clearIndexedDbSafely(): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  try {
    const dbs = await (indexedDB as any).databases?.();
    if (!Array.isArray(dbs)) return;
    await Promise.all(
      dbs
        .map((db: any) => db?.name)
        .filter((name: string | undefined) =>
          Boolean(name && name.toLowerCase().includes("msal")),
        )
        .map(
          (name: string) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(name);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            }),
        ),
    );
  } catch {
    // best effort only
  }
}

export async function hardResetAuthState(): Promise<void> {
  if (resetInProgress) return;
  resetInProgress = true;
  try {
    msal.setActiveAccount(null);
    const cache = msal.getTokenCache() as unknown as {
      removeAccount?: (account: AccountInfo) => Promise<void> | void;
    };
    const accounts = msal.getAllAccounts();
    await Promise.all(
      accounts.map(async (account) => {
        try {
          await cache.removeAccount?.(account);
        } catch {
          // best effort only
        }
      }),
    );
  } catch {
    // best effort only
  }
  try {
    const anyMsal = msal as unknown as { clearCache?: () => Promise<void> | void };
    await anyMsal.clearCache?.();
  } catch {
    // best effort only
  }
  try {
    clearStorageScope(localStorage);
    clearStorageScope(sessionStorage);
  } catch {
    // best effort only
  }
  await clearIndexedDbSafely();
  initPromise = null;
  tokenInFlight = null;
  resetInProgress = false;
}

export async function initAuthSafe(timeoutMs = 4_000): Promise<boolean> {
  if (typeof window === "undefined") return true;
  try {
    await withTimeout(initAuthOnce(), timeoutMs, "MSAL init");
    return true;
  } catch {
    initPromise = null;
    await hardResetAuthState();
    return false;
  }
}

async function withTokenGate<T>(operation: () => Promise<T>): Promise<T> {
  const previous = tokenGate;
  let releaseGate!: () => void;
  tokenGate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });

  await previous;
  try {
    return await operation();
  } finally {
    releaseGate();
  }
}

async function acquireApiTokenInternal(
  options: AcquireApiTokenOptions = {},
): Promise<string> {
  await initAuthOnce();

  let account = getActiveAccount();
  if (!account) {
    const accounts = msal.getAllAccounts();
    if (accounts.length) {
      msal.setActiveAccount(accounts[0] ?? null);
      account = msal.getActiveAccount() ?? null;
    }
  }

  if (!account) {
    if (!isInteractiveAllowed(options)) {
      throw new Error("No active account available.");
    }
    await login();
    throw new Error("No active account (redirecting to login).");
  }

  try {
    const res: AuthenticationResult = await runWithRetryBackoff(
      async () =>
        withTimeout(
          msal.acquireTokenSilent({
            account,
            scopes: [apiScope],
            forceRefresh: options.forceRefresh === true,
          }),
          SILENT_TOKEN_TIMEOUT_MS,
          "MSAL acquireTokenSilent",
        ),
      {
        attempts: 3,
        baseDelayMs: 200,
        maxDelayMs: 1_500,
        jitterMs: 100,
        shouldRetry: (error) =>
          !(error instanceof InteractionRequiredAuthError) &&
          isTransientMsalError(error),
      },
    );
    return res.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      if (!isInteractiveAllowed(options)) throw err;
      await msal.acquireTokenRedirect({
        scopes: [apiScope],
        prompt: "select_account",
      });
      throw new Error("Interaction required (redirecting).");
    }
    throw err;
  }
}

export async function acquireApiToken(
  options: AcquireApiTokenOptions = {},
): Promise<string> {
  if (!options.forceRefresh && tokenInFlight) {
    return tokenInFlight;
  }

  const run = async () => withTokenGate(() => acquireApiTokenInternal(options));

  if (options.forceRefresh) {
    return run();
  }

  tokenInFlight = run().finally(() => {
    tokenInFlight = null;
  });
  return tokenInFlight;
}

async function recoverFromBackground(reason: string): Promise<void> {
  const now = Date.now();
  if (now - lastRecoveryAt < 15_000) return;
  lastRecoveryAt = now;

  if (recoveryInFlight) return recoveryInFlight;

  recoveryInFlight = (async () => {
    const initialized = await initAuthSafe(3_500);
    if (!initialized) return;

    if (!getActiveAccount()) return;

    try {
      await acquireApiToken({
        interactive: false,
        reason,
      });
    } catch {
      // best effort only
    }
  })().finally(() => {
    recoveryInFlight = null;
  });

  return recoveryInFlight;
}

export function startAuthLifecycleRecovery(): void {
  if (lifecycleStarted || typeof window === "undefined") return;
  lifecycleStarted = true;

  const onFocusLikeEvent = () => {
    if (document.visibilityState !== "visible") return;
    void recoverFromBackground("focus-like");
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      void recoverFromBackground("visibilitychange");
    }
  };

  window.addEventListener("focus", onFocusLikeEvent);
  window.addEventListener("pageshow", onFocusLikeEvent);
  window.addEventListener("online", () => {
    void recoverFromBackground("online");
  });
  document.addEventListener("visibilitychange", onVisibilityChange);

  lifecycleTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void recoverFromBackground("heartbeat");
    }
  }, 5 * 60 * 1000);
}

export function stopAuthLifecycleRecoveryForTests(): void {
  if (typeof window === "undefined") return;
  if (lifecycleTimer) {
    window.clearInterval(lifecycleTimer);
    lifecycleTimer = null;
  }
  lifecycleStarted = false;
}
