import { describe, expect, it, vi } from "vitest";
import { createAuthNavigationGuard } from "@/router/auth-guard";

type MockRoute = {
  path: string;
  meta: {
    requiresAuth?: boolean;
  };
};

function route(path: string, requiresAuth = true): MockRoute {
  return { path, meta: { requiresAuth } };
}

describe("createAuthNavigationGuard", () => {
  it("does not block first protected navigation while warm-up runs", async () => {
    const initAuthSafe = vi.fn(() => new Promise<boolean>(() => {}));
    const getActiveAccount = vi.fn(() => null);
    const navigateToLogin = vi.fn();

    const guard = createAuthNavigationGuard({
      initAuthSafe,
      getActiveAccount,
      navigateToLogin,
    });

    const result = await guard(route("/dashboard") as any);
    expect(result).toBe(true);
    expect(initAuthSafe).toHaveBeenCalledWith(4_000);
    expect(navigateToLogin).not.toHaveBeenCalled();
  });

  it("redirects to login on subsequent protected navigation when init fails", async () => {
    const initAuthSafe = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const getActiveAccount = vi.fn(() => null);
    const navigateToLogin = vi.fn();

    const guard = createAuthNavigationGuard({
      initAuthSafe,
      getActiveAccount,
      navigateToLogin,
    });

    await guard(route("/dashboard") as any);
    const second = await guard(route("/analyses") as any);
    expect(second).toBe("/login");
  });
});
