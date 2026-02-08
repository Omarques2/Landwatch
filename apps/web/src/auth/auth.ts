import {
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  BrowserAuthError,
  InteractionRequiredAuthError,
} from "@azure/msal-browser";

const clientId = import.meta.env.VITE_ENTRA_SPA_CLIENT_ID as string;
const authority = import.meta.env.VITE_ENTRA_AUTHORITY as string;

const envRedirectUri = import.meta.env.VITE_ENTRA_REDIRECT_URI as string | undefined;
const envPostLogoutRedirectUri = import.meta.env.VITE_ENTRA_POST_LOGOUT_REDIRECT_URI as string | undefined;

const apiScope = import.meta.env.VITE_ENTRA_API_SCOPE as string;

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
    storeAuthStateInCookie: false,
  },
});

let initPromise: Promise<void> | null = null;

/**
 * Inicializa MSAL + processa redirect exatamente 1x (robusto para produção).
 */
export function initAuthOnce(): Promise<void> {
  if (!initPromise) initPromise = initAuth();
  return initPromise;
}

export async function initAuth(): Promise<void> {
  await msal.initialize();

  const result = await msal.handleRedirectPromise();
  if (result?.account) {
    msal.setActiveAccount(result.account);
    return;
  }

  // Restaura conta se já existir no cache
  const accounts = msal.getAllAccounts();
  msal.setActiveAccount(accounts[0] ?? null);
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

export async function acquireApiToken(): Promise<string> {
  await initAuthOnce();

  const account = getActiveAccount();
  if (!account) {
    await login();
    throw new Error("No active account (redirecting to login).");
  }

  try {
    const res: AuthenticationResult = await msal.acquireTokenSilent({
      account,
      scopes: [apiScope],
    });
    return res.accessToken;
  } catch (err) {
    const errorCode = (err as { errorCode?: string }).errorCode;
    const needsInteraction =
      err instanceof InteractionRequiredAuthError ||
      (err instanceof BrowserAuthError &&
        (errorCode === "monitor_window_timeout" ||
          errorCode === "silent_token_refresh_timeout" ||
          errorCode === "block_iframe_reload"));

    if (needsInteraction) {
      await msal.acquireTokenRedirect({
        scopes: [apiScope],
        prompt: "select_account",
      });
      throw new Error("Interaction required (redirecting).");
    }
    throw err;
  }
}
