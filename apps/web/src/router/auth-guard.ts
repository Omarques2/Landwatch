import type { RouteLocationNormalized } from "vue-router";

type AuthGuardDeps = {
  ensureSession: () => Promise<unknown | null>;
  exchangeSession: () => Promise<unknown>;
  getMeCached: (force?: boolean) => Promise<{ status?: string } | null>;
};

type AuthGuardResult = true | string;

const EXCHANGE_RETRY_ATTEMPTS = 2;

function canAccessApp(me: { status?: string } | null): boolean {
  return Boolean(me && me.status !== "disabled");
}

export function createAuthNavigationGuard(deps: AuthGuardDeps) {
  async function ensureSessionSafely(): Promise<unknown | null> {
    try {
      return await deps.ensureSession();
    } catch {
      return null;
    }
  }

  async function hasProfileFallback(): Promise<boolean> {
    try {
      const me = await deps.getMeCached(true);
      return Boolean(me);
    } catch {
      return false;
    }
  }

  async function ensureSessionWithExchange(): Promise<unknown | null> {
    for (let attempt = 1; attempt <= EXCHANGE_RETRY_ATTEMPTS; attempt += 1) {
      const session = await ensureSessionSafely();
      if (session) return session;

      try {
        await deps.exchangeSession();
      } catch {
        if (await hasProfileFallback()) {
          return { source: "profile-fallback" };
        }
        if (attempt >= EXCHANGE_RETRY_ATTEMPTS) {
          return null;
        }
        continue;
      }

      const refreshedSession = await ensureSessionSafely();
      if (refreshedSession) return refreshedSession;

      if (await hasProfileFallback()) {
        return { source: "profile-fallback" };
      }
    }

    return null;
  }

  return async function authNavigationGuard(
    to: RouteLocationNormalized,
  ): Promise<AuthGuardResult> {
    if (to.path === "/login") {
      const session = await ensureSessionWithExchange();
      if (!session) return true;
      const me = await deps.getMeCached(false);
      if (!me) return "/pending";
      if (!canAccessApp(me)) return "/pending";
      return "/";
    }

    if (!to.meta.requiresAuth) return true;

    const session = await ensureSessionWithExchange();
    if (!session) return `/login?returnTo=${encodeURIComponent(to.fullPath || to.path)}`;

    if (to.path === "/pending") {
      return true;
    }

    const me = await deps.getMeCached(false);
    if (!me) return "/pending";
    if (!canAccessApp(me)) return "/pending";
    return true;
  };
}
