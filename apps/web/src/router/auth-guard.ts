import type { RouteLocationNormalized } from "vue-router";

type AuthGuardDeps = {
  getActiveAccount: () => unknown;
  initAuthSafe: (timeoutMs?: number) => Promise<boolean>;
  navigateToLogin: () => void;
};

type AuthGuardResult = true | string;

export function createAuthNavigationGuard(deps: AuthGuardDeps) {
  let initialProtectedWarmupDone = false;

  return async function authNavigationGuard(
    to: RouteLocationNormalized,
  ): Promise<AuthGuardResult> {
    if (to.path === "/login") {
      await deps.initAuthSafe(2_500);
      if (deps.getActiveAccount()) return "/";
      return true;
    }

    if (!to.meta.requiresAuth) return true;
    if (deps.getActiveAccount()) return true;

    if (!initialProtectedWarmupDone) {
      initialProtectedWarmupDone = true;
      void deps
        .initAuthSafe(4_000)
        .then((initialized) => {
          if (!initialized || !deps.getActiveAccount()) {
            deps.navigateToLogin();
          }
        })
        .catch(() => {
          deps.navigateToLogin();
        });
      return true;
    }

    const initialized = await deps.initAuthSafe(4_000);
    if (!initialized) return "/login";
    if (!deps.getActiveAccount()) return "/login";
    return true;
  };
}
