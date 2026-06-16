import type { RouteLocationNormalized } from "vue-router";
import { isLocalAuthBypassEnabled } from "@/auth/local-bypass";
import type { AccessMeResponse, AppFeature } from "@/auth/me";
import { hydrateActiveOrgFromMemberships } from "@/state/org-context";

type AuthGuardDeps = {
  ensureSession: () => Promise<unknown | null>;
  exchangeSession: () => Promise<unknown>;
  getMeCached: (force?: boolean) => Promise<{ status?: string } | null>;
  getAccessStatus: () => Promise<{ status?: string } | null>;
  getAccessCached: (force?: boolean) => Promise<AccessMeResponse | null>;
};

type AuthGuardResult = true | string;

const EXCHANGE_RETRY_ATTEMPTS = 2;
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
  const feature = to.meta.feature as AppFeature | undefined;
  if (!feature) return true;
  if (access?.isPlatformAdmin) return true;
  return Boolean(access?.features?.includes(feature));
}

type EnsureSessionOptions = {
  attempts: number;
  allowProfileFallback: boolean;
};

export function createAuthNavigationGuard(deps: AuthGuardDeps) {
  async function enforceAccess(to: RouteLocationNormalized) {
    const me = (await deps.getMeCached(false)) ?? (await deps.getAccessStatus());
    if (!me) return "/pending";
    if (!canAccessApp(me)) return "/pending";
    hydrateActiveOrgFromMemberships((me as any).memberships);
    const access = await deps.getAccessCached(false);
    if (!canAccessRoute(to, access)) {
      if (to.path !== "/analyses/new") return "/analyses/new";
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

    const session = await ensureSessionWithExchange({
      attempts: EXCHANGE_RETRY_ATTEMPTS,
      allowProfileFallback: true,
    });
    if (!session) return `/login?returnTo=${encodeURIComponent(to.fullPath || to.path)}`;

    if (to.path === "/pending") {
      return true;
    }

    return enforceAccess(to);
  };
}
