import { createAuthClient, resolveSafeReturnTo } from "@sigfarm/auth-client-vue";

const defaultAppBaseUrl =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
const defaultAuthApiBaseUrl = "https://api-auth.sigfarmintelligence.com";
const defaultAuthPortalBaseUrl = "https://auth.sigfarmintelligence.com";

const authApiBaseUrl =
  (import.meta.env.VITE_SIGFARM_AUTH_API_BASE_URL as string | undefined) ??
  defaultAuthApiBaseUrl;
const authPortalBaseUrl =
  (import.meta.env.VITE_SIGFARM_AUTH_PORTAL_BASE_URL as string | undefined) ??
  defaultAuthPortalBaseUrl;
const appBaseUrl =
  (import.meta.env.VITE_SIGFARM_APP_BASE_URL as string | undefined) ?? defaultAppBaseUrl;
const defaultReturnTo =
  (import.meta.env.VITE_SIGFARM_AUTH_DEFAULT_RETURN_TO as string | undefined) ??
  `${defaultAppBaseUrl}/`;

const configuredAllowedOrigins = parseAllowedOrigins(
  import.meta.env.VITE_SIGFARM_AUTH_ALLOWED_RETURN_ORIGINS as string | undefined,
);

const allowedReturnOrigins =
  configuredAllowedOrigins.length > 0
    ? configuredAllowedOrigins
    : [new URL(appBaseUrl).origin, new URL(authPortalBaseUrl).origin];

export const authClient = createAuthClient({
  authApiBaseUrl,
  authPortalBaseUrl,
  appBaseUrl,
  allowedReturnOrigins,
  defaultReturnTo,
});

export function resolveReturnTo(
  returnTo?: string | null,
  referrer?: string | null,
): string {
  return resolveSafeReturnTo({
    returnTo,
    appBaseUrl,
    authPortalBaseUrl,
    defaultReturnTo,
    allowedOrigins: allowedReturnOrigins,
    referrer: referrer ?? undefined,
  });
}

export function getRouteReturnTo(rawValue: unknown): string {
  const value = typeof rawValue === "string" ? rawValue : undefined;
  return resolveReturnTo(value);
}

export function buildAuthCallbackReturnTo(returnTo?: string | null): string {
  const safeReturnTo = resolveReturnTo(returnTo);
  const callbackUrl = new URL("/auth/callback", appBaseUrl);
  callbackUrl.searchParams.set("returnTo", safeReturnTo);
  return callbackUrl.toString();
}

export function buildAuthPortalLoginUrl(returnTo?: string): string {
  const loginUrl = new URL("/login", authPortalBaseUrl);
  const safeReturnTo = resolvePortalReturnTo(returnTo);
  loginUrl.searchParams.set("returnTo", safeReturnTo ?? defaultReturnTo);
  return loginUrl.toString();
}

export function buildProductLoginRoute(returnTo?: string): string {
  if (!returnTo) return "/login";
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

function parseAllowedOrigins(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function resolvePortalReturnTo(raw?: string): string | null {
  if (!raw) return null;

  const candidate = safelyDecode(raw);
  if (!candidate) return null;

  if (candidate.startsWith("/")) {
    return new URL(candidate, appBaseUrl).toString();
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!allowedReturnOrigins.includes(parsed.origin)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function safelyDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
