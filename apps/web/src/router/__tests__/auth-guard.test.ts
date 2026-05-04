import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthNavigationGuard } from "@/router/auth-guard";

type MockRoute = {
  path: string;
  fullPath?: string;
  meta: {
    requiresAuth?: boolean;
  };
};

function route(path: string, requiresAuth = true): MockRoute {
  return { path, fullPath: path, meta: { requiresAuth } };
}

function makeDeps(overrides: Partial<{
  ensureSession: ReturnType<typeof vi.fn>;
  exchangeSession: ReturnType<typeof vi.fn>;
  getMeCached: ReturnType<typeof vi.fn>;
  getAccessStatus: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    ensureSession: overrides.ensureSession ?? vi.fn().mockResolvedValue(null),
    exchangeSession: overrides.exchangeSession ?? vi.fn().mockResolvedValue(null),
    getMeCached: overrides.getMeCached ?? vi.fn().mockResolvedValue(null),
    getAccessStatus: overrides.getAccessStatus ?? vi.fn().mockResolvedValue(null),
  };
}

describe("createAuthNavigationGuard", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_AUTH_BYPASS_LOCALHOST", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bypasses authentication flow on localhost when VITE_AUTH_BYPASS_LOCALHOST is enabled", async () => {
    vi.stubEnv("VITE_AUTH_BYPASS_LOCALHOST", "true");

    const deps = makeDeps();
    const guard = createAuthNavigationGuard(deps);

    const result = await guard(route("/dashboard") as any);

    expect(result).toBe(true);
    expect(deps.ensureSession).not.toHaveBeenCalled();
    expect(deps.exchangeSession).not.toHaveBeenCalled();
    expect(deps.getMeCached).not.toHaveBeenCalled();
    expect(deps.getAccessStatus).not.toHaveBeenCalled();
  });

  it("redirects protected route to pending when session exists but account is pending", async () => {
    const deps = makeDeps({
      ensureSession: vi.fn().mockResolvedValue({ data: { sessionId: "sid" } }),
      getMeCached: vi.fn().mockResolvedValue(null),
      getAccessStatus: vi.fn().mockResolvedValue({ status: "pending" }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/dashboard") as any);

    expect(result).toBe("/pending");
    expect(deps.getMeCached).toHaveBeenCalledWith(false);
    expect(deps.getAccessStatus).toHaveBeenCalledWith();
  });

  it("allows /pending once session is initialized", async () => {
    const deps = makeDeps({
      ensureSession: vi.fn().mockResolvedValue({ data: { sessionId: "sid" } }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/pending") as any);

    expect(result).toBe(true);
    expect(deps.getMeCached).not.toHaveBeenCalled();
    expect(deps.getAccessStatus).not.toHaveBeenCalled();
  });

  it("redirects /login to app root when active profile already exists", async () => {
    const deps = makeDeps({
      ensureSession: vi.fn().mockResolvedValue({ data: { sessionId: "sid" } }),
      getMeCached: vi.fn().mockResolvedValue({ status: "active" }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/login", false) as any);

    expect(result).toBe("/");
    expect(deps.getAccessStatus).not.toHaveBeenCalled();
  });

  it("redirects /login to /pending when profile is pending", async () => {
    const deps = makeDeps({
      ensureSession: vi.fn().mockResolvedValue({ data: { sessionId: "sid" } }),
      getMeCached: vi.fn().mockResolvedValue(null),
      getAccessStatus: vi.fn().mockResolvedValue({ status: "pending" }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/login", false) as any);

    expect(result).toBe("/pending");
    expect(deps.getAccessStatus).toHaveBeenCalledWith();
  });

  it("keeps /login accessible when there is no session", async () => {
    const deps = makeDeps({
      exchangeSession: vi.fn().mockRejectedValue(new Error("no session")),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/login", false) as any);

    expect(result).toBe(true);
  });

  it("redirects protected route to /login when no session is available", async () => {
    const deps = makeDeps({
      exchangeSession: vi.fn().mockRejectedValue(new Error("no session")),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/dashboard") as any);

    expect(result).toBe("/login?returnTo=%2Fdashboard");
    expect(deps.getAccessStatus).toHaveBeenCalledWith();
  });

  it("tries session exchange before allowing protected route", async () => {
    const deps = makeDeps({
      ensureSession: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ data: { sessionId: "sid" } }),
      exchangeSession: vi.fn().mockResolvedValue({ session: { accessToken: "token" } }),
      getMeCached: vi.fn().mockResolvedValue({ status: "active" }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/dashboard") as any);

    expect(result).toBe(true);
    expect(deps.exchangeSession).toHaveBeenCalledTimes(1);
    expect(deps.ensureSession).toHaveBeenCalledTimes(2);
  });

  it("retries session exchange after transient failure before redirecting", async () => {
    const deps = makeDeps({
      ensureSession: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ data: { sessionId: "sid" } }),
      exchangeSession: vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary failure"))
        .mockResolvedValueOnce({ session: { accessToken: "token" } }),
      getMeCached: vi.fn().mockResolvedValue(null),
      getAccessStatus: vi.fn().mockResolvedValue({ status: "pending" }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/dashboard") as any);

    expect(result).toBe("/pending");
    expect(deps.exchangeSession).toHaveBeenCalledTimes(1);
  });

  it("falls back to access-status when /v1/auth/session stays unavailable", async () => {
    const deps = makeDeps({
      exchangeSession: vi.fn().mockResolvedValue({ session: { accessToken: "token" } }),
      getMeCached: vi.fn().mockResolvedValue(null),
      getAccessStatus: vi.fn().mockResolvedValue({ status: "active" }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/dashboard") as any);

    expect(result).toBe(true);
    expect(deps.getAccessStatus).toHaveBeenCalledWith();
  });

  it("handles thrown ensureSession and redirects pending profile to /pending", async () => {
    const deps = makeDeps({
      ensureSession: vi.fn().mockRejectedValue(new Error("session endpoint down")),
      exchangeSession: vi.fn().mockResolvedValue({ session: { accessToken: "token" } }),
      getMeCached: vi.fn().mockResolvedValue(null),
      getAccessStatus: vi.fn().mockResolvedValue({ status: "pending" }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/dashboard") as any);

    expect(result).toBe("/pending");
    expect(deps.getAccessStatus).toHaveBeenCalledWith();
  });
});
