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
    const ensureSession = vi.fn().mockResolvedValue({ data: { sessionId: "sid" } });
    const exchangeSession = vi.fn();
    const getMeCached = vi.fn().mockResolvedValue(null);

    const guard = createAuthNavigationGuard({
      ensureSession,
      exchangeSession,
      getMeCached,
    });

    const result = await guard(route("/dashboard") as any);
    expect(result).toBe("/pending");
    expect(ensureSession).toHaveBeenCalledWith();
    expect(getMeCached).toHaveBeenCalledWith(false);
  });

  it("allows /pending once session is initialized", async () => {
    const ensureSession = vi.fn().mockResolvedValue({ data: { sessionId: "sid" } });
    const exchangeSession = vi.fn();
    const getMeCached = vi.fn();

    const guard = createAuthNavigationGuard({
      ensureSession,
      exchangeSession,
      getMeCached,
    });

    const result = await guard(route("/pending") as any);
    expect(result).toBe(true);
    expect(getMeCached).not.toHaveBeenCalled();
  });

  it("redirects /login to app root when active profile already exists", async () => {
    const ensureSession = vi.fn().mockResolvedValue({ data: { sessionId: "sid" } });
    const exchangeSession = vi.fn();
    const getMeCached = vi.fn().mockResolvedValue({ status: "active" });

    const guard = createAuthNavigationGuard({
      ensureSession,
      exchangeSession,
      getMeCached,
    });

    const result = await guard(route("/login", false) as any);
    expect(result).toBe("/");
  });

  it("redirects /login to app root when profile is pending", async () => {
    const ensureSession = vi.fn().mockResolvedValue({ data: { sessionId: "sid" } });
    const exchangeSession = vi.fn();
    const getMeCached = vi.fn().mockResolvedValue({ status: "pending" });

    const guard = createAuthNavigationGuard({
      ensureSession,
      exchangeSession,
      getMeCached,
    });

    const result = await guard(route("/login", false) as any);
    expect(result).toBe("/");
  });

  it("keeps /login accessible when there is no session", async () => {
    const ensureSession = vi.fn().mockResolvedValue(null);
    const exchangeSession = vi.fn().mockRejectedValue(new Error("no session"));
    const getMeCached = vi.fn();

    const guard = createAuthNavigationGuard({
      ensureSession,
      exchangeSession,
      getMeCached,
    });

    const result = await guard(route("/login", false) as any);
    expect(result).toBe(true);
  });

  it("redirects protected route to /login when no session is available", async () => {
    const ensureSession = vi.fn().mockResolvedValue(null);
    const exchangeSession = vi.fn().mockRejectedValue(new Error("no session"));
    const getMeCached = vi.fn().mockResolvedValue(null);

    const guard = createAuthNavigationGuard({
      ensureSession,
      exchangeSession,
      getMeCached,
    });

    const result = await guard(route("/dashboard") as any);
    expect(result).toBe("/login?returnTo=%2Fdashboard");
    expect(getMeCached).toHaveBeenCalledWith(true);
  });

  it("tries session exchange before redirecting protected route", async () => {
    const ensureSession = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ data: { sessionId: "sid" } });
    const exchangeSession = vi.fn().mockResolvedValue({ session: { accessToken: "token" } });
    const getMeCached = vi.fn().mockResolvedValue({ status: "active" });

    const guard = createAuthNavigationGuard({
      ensureSession,
      exchangeSession,
      getMeCached,
    });

    const result = await guard(route("/dashboard") as any);
    expect(result).toBe(true);
    expect(exchangeSession).toHaveBeenCalledTimes(1);
    expect(ensureSession).toHaveBeenCalledTimes(2);
  });

  it("retries session exchange after transient failure before redirecting", async () => {
    const ensureSession = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ data: { sessionId: "sid" } });
    const exchangeSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ session: { accessToken: "token" } });
    const getMeCached = vi.fn().mockResolvedValue(null);

    const guard = createAuthNavigationGuard({
      ensureSession,
      exchangeSession,
      getMeCached,
    });

    const result = await guard(route("/dashboard") as any);
    expect(result).toBe("/pending");
    expect(exchangeSession).toHaveBeenCalledTimes(2);
  });

  it("keeps protected route when exchange fails but profile fallback succeeds", async () => {
    const ensureSession = vi.fn().mockResolvedValue(null);
    const exchangeSession = vi.fn().mockRejectedValue(new Error("exchange down"));
    const getMeCached = vi.fn().mockResolvedValue({ status: "pending" });

    const guard = createAuthNavigationGuard({
      ensureSession,
      exchangeSession,
      getMeCached,
    });

    const result = await guard(route("/dashboard") as any);
    expect(result).toBe(true);
    expect(getMeCached).toHaveBeenCalledWith(true);
  });

  it("falls back to /users/me when /v1/auth/session stays unavailable", async () => {
    const ensureSession = vi.fn().mockResolvedValue(null);
    const exchangeSession = vi.fn().mockResolvedValue({ session: { accessToken: "token" } });
    const getMeCached = vi.fn().mockResolvedValue({ status: "active" });

    const guard = createAuthNavigationGuard({
      ensureSession,
      exchangeSession,
      getMeCached,
    });

    const result = await guard(route("/dashboard") as any);
    expect(result).toBe(true);
    expect(ensureSession).toHaveBeenCalled();
    expect(getMeCached).toHaveBeenCalledWith(true);
  });

  it("handles thrown ensureSession and still uses profile fallback", async () => {
    const ensureSession = vi.fn().mockRejectedValue(new Error("session endpoint down"));
    const exchangeSession = vi.fn().mockResolvedValue({ session: { accessToken: "token" } });
    const getMeCached = vi.fn().mockResolvedValue({ status: "pending" });

    const guard = createAuthNavigationGuard({
      ensureSession,
      exchangeSession,
      getMeCached,
    });

    const result = await guard(route("/dashboard") as any);
    expect(result).toBe(true);
    expect(getMeCached).toHaveBeenCalledWith(true);
  });
});
