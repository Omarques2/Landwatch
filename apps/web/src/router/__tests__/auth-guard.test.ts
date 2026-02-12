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
  it("redirects protected route to pending when session exists but profile is unavailable", async () => {
    const initAuthSafe = vi.fn().mockResolvedValue(true);
    const getActiveAccount = vi.fn(() => ({ homeAccountId: "acc-1" }));
    const getMeCached = vi.fn().mockResolvedValue(null);

    const guard = createAuthNavigationGuard({
      initAuthSafe,
      getActiveAccount,
      getMeCached,
    });

    const result = await guard(route("/dashboard") as any);
    expect(result).toBe("/pending");
    expect(initAuthSafe).toHaveBeenCalledWith(4_000);
    expect(getMeCached).toHaveBeenCalledWith(false);
  });

  it("allows /pending once session is initialized", async () => {
    const initAuthSafe = vi.fn().mockResolvedValue(true);
    const getActiveAccount = vi.fn(() => ({ homeAccountId: "acc-1" }));
    const getMeCached = vi.fn();

    const guard = createAuthNavigationGuard({
      initAuthSafe,
      getActiveAccount,
      getMeCached,
    });

    const result = await guard(route("/pending") as any);
    expect(result).toBe(true);
    expect(getMeCached).not.toHaveBeenCalled();
  });

  it("redirects /login to app root when active profile already exists", async () => {
    const initAuthSafe = vi.fn().mockResolvedValue(true);
    const getActiveAccount = vi.fn(() => ({ homeAccountId: "acc-1" }));
    const getMeCached = vi.fn().mockResolvedValue({ status: "active" });

    const guard = createAuthNavigationGuard({
      initAuthSafe,
      getActiveAccount,
      getMeCached,
    });

    const result = await guard(route("/login", false) as any);
    expect(result).toBe("/");
  });

  it("keeps /login accessible when there is no session", async () => {
    const initAuthSafe = vi.fn().mockResolvedValue(true);
    const getActiveAccount = vi.fn(() => null);
    const getMeCached = vi.fn();

    const guard = createAuthNavigationGuard({
      initAuthSafe,
      getActiveAccount,
      getMeCached,
    });

    const result = await guard(route("/login", false) as any);
    expect(result).toBe(true);
  });
});
