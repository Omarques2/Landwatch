import type { RouteLocationNormalized } from "vue-router";
import { isLocalAuthBypassEnabled } from "@/auth/local-bypass";
import type { AccessMeResponse, AppFeature, MeOutcome } from "@/auth/me";
import { hydrateActiveOrgFromMemberships } from "@/state/org-context";

type AuthGuardDeps = {
  // Session signal for protected routes: a cached, reusable access token. The
  // token cache lives in auth.ts, so navigating between routes no longer
  // re-bootstraps the session (no per-nav refresh / access-status churn).
  acquireToken: () => Promise<string>;
  // Cold-boot/login bootstrap only.
  ensureSession: () => Promise<unknown | null>;
  exchangeSession: () => Promise<unknown>;
  getMeCached: (force?: boolean) => Promise<{ status?: string } | null>;
  getMeResult: (force?: boolean) => Promise<MeOutcome>;
  getAccessStatus: () => Promise<{ status?: string } | null>;
  getAccessCached: (force?: boolean) => Promise<AccessMeResponse | null>;
};

type AuthGuardResult = true | string;

const LOGIN_EXCHANGE_RETRY_ATTEMPTS = 1;

function canAccessApp(me: { status?: string } | null): boolean {
  return me?.status === "active";
}

function canAccessRoute(
  to: RouteLocationNormalized,
  access: AccessMeResponse | null,
): boolean {
  if (to.path === "/403") return true;
  if (to.meta.platformOnly) return Boolean(access?.isPlatformAdmin);
  if (to.meta.platformUserOnly) return Boolean(access?.isPlatformAdmin || access?.isPlatformUser);
  const feature = to.meta.feature as AppFeature | undefined;
  if (!feature) return true;
  if (access?.isPlatformAdmin) return true;
  return Boolean(access?.features?.includes(feature));
}

// A route the user can actually reach, used as the redirect target when they
// hit a forbidden route. Ordered by product priority. Returns null only when
// the user has no usable feature at all (a real /403).
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
  return null;
}

type EnsureSessionOptions = {
  attempts: number;
  allowProfileFallback: boolean;
};

export function createAuthNavigationGuard(deps: AuthGuardDeps) {
  async function enforceAccess(to: RouteLocationNormalized) {
    // Cache-first: getMeResult serves a known identity immediately (and
    // revalidates in background) instead of re-hitting the network on every
    // navigation. enforceAccess is only reached after a valid session was
    // established upstream, so a transient /me failure means the endpoint
    // blipped — keep the user in rather than bouncing to /pending.
    const meOutcome = await deps.getMeResult(false);
    if (meOutcome.kind === "transient") return true;

    const me =
      meOutcome.kind === "ok" || meOutcome.kind === "inactive"
        ? meOutcome.me
        : await deps.getAccessStatus();
    if (!me) return "/pending";
    if (!canAccessApp(me)) return "/pending";
    // Hydrate the active org BEFORE fetching access (access is org-scoped).
    hydrateActiveOrgFromMemberships((me as any).memberships);
    let access = await deps.getAccessCached(false);
    if (!access) {
      // Access could not be resolved — usually a stale/non-member active org
      // (e.g. left over from a previous session, or a membership that changed).
      // A 403 marks that org rejected; refresh identity, re-pick a usable org
      // from current memberships, and retry once before giving up.
      const fresh = await deps.getMeResult(true);
      const freshMe =
        fresh.kind === "ok" || fresh.kind === "inactive" ? fresh.me : null;
      if (freshMe && (freshMe as any).memberships?.length) {
        hydrateActiveOrgFromMemberships((freshMe as any).memberships);
        access = await deps.getAccessCached(true);
      }
    }
    if (!canAccessRoute(to, access)) {
      // Land the user on a route they CAN reach (not a hardcoded one that may
      // itself require a permission they lack — the old /analyses/new bounce
      // sent users without ANALYSIS_CREATE straight to /403).
      const landing = landingRouteFor(access);
      if (landing && to.path !== landing) return landing;
      return "/403";
    }
    return true;
  }

  async function ensureSessionSafely(): Promise<unknown | null> {
    try {
      return await deps.ensureSession();
    } catch {
      return null;
    }
  }

  async function hasProfileFallback(): Promise<boolean> {
    try {
      const me = await deps.getAccessStatus();
      return Boolean(me);
    } catch {
      return false;
    }
  }

  async function ensureSessionWithExchange(
    options: EnsureSessionOptions,
  ): Promise<unknown | null> {
    for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
      const session = await ensureSessionSafely();
      if (session) return session;

      try {
        await deps.exchangeSession();
      } catch {
        if (options.allowProfileFallback && (await hasProfileFallback())) {
          return { source: "profile-fallback" };
        }
        if (attempt >= options.attempts) {
          return null;
        }
        continue;
      }

      const refreshedSession = await ensureSessionSafely();
      if (refreshedSession) return refreshedSession;

      if (options.allowProfileFallback && (await hasProfileFallback())) {
        return { source: "profile-fallback" };
      }
    }

    return null;
  }

  return async function authNavigationGuard(
    to: RouteLocationNormalized,
  ): Promise<AuthGuardResult> {
    if (isLocalAuthBypassEnabled()) {
      if (to.path === "/login") return "/";
      if (!to.meta.requiresAuth) return true;
      if (to.path === "/pending") return true;
      return enforceAccess(to);
    }

    if (to.path === "/login") {
      const session = await ensureSessionWithExchange({
        attempts: LOGIN_EXCHANGE_RETRY_ATTEMPTS,
        allowProfileFallback: false,
      });
      if (!session) return true;
      const me = (await deps.getMeCached(false)) ?? (await deps.getAccessStatus());
      if (!me) return "/pending";
      if (!canAccessApp(me)) return "/pending";
      return "/";
    }

    if (!to.meta.requiresAuth) return true;

    // Reuse the cached access token as the session signal. acquireToken
    // bootstraps once on cold boot (exchange + cookie-session fallback) and
    // then serves from cache, so route changes don't re-hit auth.
    let token: string | null = null;
    try {
      token = await deps.acquireToken();
    } catch {
      token = null;
    }
    if (!token) return `/login?returnTo=${encodeURIComponent(to.fullPath || to.path)}`;

    if (to.path === "/pending") {
      return true;
    }

    return enforceAccess(to);
  };
}
