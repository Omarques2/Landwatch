import type { RouteLocationNormalized } from "vue-router";

type AuthGuardDeps = {
  getActiveAccount: () => unknown;
  initAuthSafe: (timeoutMs?: number) => Promise<boolean>;
  getMeCached: (force?: boolean) => Promise<{ status?: string } | null>;
};

type AuthGuardResult = true | string;

export function createAuthNavigationGuard(deps: AuthGuardDeps) {
  return async function authNavigationGuard(
    to: RouteLocationNormalized,
  ): Promise<AuthGuardResult> {
    if (to.path === "/login") {
      await deps.initAuthSafe(2_500);
      if (!deps.getActiveAccount()) return true;
      const me = await deps.getMeCached(false);
      if (!me) return "/pending";
      if (me.status !== "active") return "/pending";
      return "/";
    }

    if (!to.meta.requiresAuth) return true;

    const initialized = await deps.initAuthSafe(4_000);
    if (!initialized) return "/login";
    if (!deps.getActiveAccount()) return "/login";

    if (to.path === "/pending") {
      return true;
    }

    const me = await deps.getMeCached(false);
    if (!me) return "/pending";
    if (me.status !== "active") return "/pending";
    return true;
  };
}
