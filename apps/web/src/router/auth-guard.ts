import type { RouteLocationNormalized } from "vue-router";

type AuthGuardDeps = {
  ensureSession: () => Promise<unknown | null>;
  exchangeSession: () => Promise<unknown>;
  getMeCached: (force?: boolean) => Promise<{ status?: string } | null>;
};

type AuthGuardResult = true | string;

const EXCHANGE_RETRY_ATTEMPTS = 2;
const LOGIN_EXCHANGE_RETRY_ATTEMPTS = 1;

function canAccessApp(me: { status?: string } | null): boolean {
  return Boolean(me && me.status !== "disabled");
}

type EnsureSessionOptions = {
  attempts: number;
  allowProfileFallback: boolean;
};

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
    if (to.path === "/login") {
      const session = await ensureSessionWithExchange({
        attempts: LOGIN_EXCHANGE_RETRY_ATTEMPTS,
        allowProfileFallback: false,
      });
      if (!session) return true;
      const me = await deps.getMeCached(false);
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

    const me = await deps.getMeCached(false);
    if (!me) return "/pending";
    if (!canAccessApp(me)) return "/pending";
    return true;
  };
}
