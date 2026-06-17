import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthNavigationGuard } from "@/router/auth-guard";
import { hydrateActiveOrgFromMemberships } from "@/state/org-context";

vi.mock("@/state/org-context", () => ({
  hydrateActiveOrgFromMemberships: vi.fn(),
}));

type MockRoute = {
  path: string;
  fullPath?: string;
  meta: {
    requiresAuth?: boolean;
    feature?: string;
    platformOnly?: boolean;
    platformUserOnly?: boolean;
  };
};

function route(path: string, requiresAuth = true): MockRoute {
  return { path, fullPath: path, meta: { requiresAuth } };
}

// Helper to build a getMeResult mock returning the discriminated outcome.
function meResult(outcome: unknown) {
  return vi.fn().mockResolvedValue(outcome);
}

function makeDeps(overrides: Partial<{
  acquireToken: ReturnType<typeof vi.fn>;
  ensureSession: ReturnType<typeof vi.fn>;
  exchangeSession: ReturnType<typeof vi.fn>;
  getMeCached: ReturnType<typeof vi.fn>;
  getMeResult: ReturnType<typeof vi.fn>;
  getAccessStatus: ReturnType<typeof vi.fn>;
  getAccessCached: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    // Protected routes use the cached token as the session signal; default to a
    // valid token so the "happy path" reaches enforceAccess.
    acquireToken: overrides.acquireToken ?? vi.fn().mockResolvedValue("token"),
    ensureSession: overrides.ensureSession ?? vi.fn().mockResolvedValue(null),
    exchangeSession: overrides.exchangeSession ?? vi.fn().mockResolvedValue(null),
    // getMeCached is still used by the /login branch of the guard.
    getMeCached: overrides.getMeCached ?? vi.fn().mockResolvedValue(null),
    // enforceAccess uses the discriminated getMeResult; default to unauthorized
    // so the access-status fallback path runs (matches old null default).
    getMeResult: overrides.getMeResult ?? meResult({ kind: "unauthorized" }),
    getAccessStatus: overrides.getAccessStatus ?? vi.fn().mockResolvedValue(null),
    getAccessCached:
      overrides.getAccessCached ??
      vi.fn().mockResolvedValue({
        isPlatformAdmin: false,
        isPlatformUser: false,
        features: ["FARMS", "ANALYSES", "ANALYSIS_CREATE", "CAR_SEARCH", "SCHEDULES"],
      }),
  };
}

describe("createAuthNavigationGuard", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_AUTH_BYPASS_LOCALHOST", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bypasses session exchange but still checks access on localhost", async () => {
    vi.stubEnv("VITE_AUTH_BYPASS_LOCALHOST", "true");

    const deps = makeDeps({
      getMeResult: meResult({
        kind: "ok",
        me: { status: "active", memberships: [] },
      }),
    });
    const guard = createAuthNavigationGuard(deps);

    const result = await guard({
      ...route("/dashboard"),
      meta: { requiresAuth: true, platformOnly: true },
    } as any);

    expect(result).toBe("/analyses/new");
    expect(deps.ensureSession).not.toHaveBeenCalled();
    expect(deps.exchangeSession).not.toHaveBeenCalled();
    expect(deps.getMeResult).toHaveBeenCalledWith(false);
    expect(deps.getAccessStatus).not.toHaveBeenCalled();
  });

  it("redirects protected route to pending when session exists but account is pending", async () => {
    const deps = makeDeps({
      ensureSession: vi.fn().mockResolvedValue({ data: { sessionId: "sid" } }),
      getMeResult: meResult({ kind: "unauthorized" }),
      getAccessStatus: vi.fn().mockResolvedValue({ status: "pending" }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/dashboard") as any);

    expect(result).toBe("/pending");
    expect(deps.getMeResult).toHaveBeenCalledWith(false);
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

  it("redirects protected route to /login when no token is available", async () => {
    const deps = makeDeps({
      acquireToken: vi.fn().mockRejectedValue(new Error("no session")),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/dashboard") as any);

    expect(result).toBe("/login?returnTo=%2Fdashboard");
    // No per-navigation session bootstrap / access-status churn.
    expect(deps.exchangeSession).not.toHaveBeenCalled();
    expect(deps.getAccessStatus).not.toHaveBeenCalled();
  });

  it("allows a protected route when a cached token is available", async () => {
    const deps = makeDeps({
      acquireToken: vi.fn().mockResolvedValue("token"),
      getMeResult: meResult({ kind: "ok", me: { status: "active" } }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/dashboard") as any);

    expect(result).toBe(true);
    expect(deps.acquireToken).toHaveBeenCalledTimes(1);
    // The guard no longer re-bootstraps the session on every navigation.
    expect(deps.exchangeSession).not.toHaveBeenCalled();
    expect(deps.ensureSession).not.toHaveBeenCalled();
  });

  it("sends a token-holding but pending account to /pending", async () => {
    const deps = makeDeps({
      acquireToken: vi.fn().mockResolvedValue("token"),
      getMeResult: meResult({ kind: "unauthorized" }),
      getAccessStatus: vi.fn().mockResolvedValue({ status: "pending" }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/dashboard") as any);

    expect(result).toBe("/pending");
    expect(deps.exchangeSession).not.toHaveBeenCalled();
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

  it("redirects a forbidden route to a route the user can actually access", async () => {
    const deps = makeDeps({
      getMeResult: meResult({ kind: "ok", me: { status: "active" } }),
      getAccessCached: vi.fn().mockResolvedValue({
        isPlatformAdmin: false,
        features: ["FARMS"],
      }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard({
      ...route("/analyses"),
      meta: { requiresAuth: true, feature: "ANALYSES" },
    } as any);

    // User only has FARMS → land on /farms, never bounce to a route they lack.
    expect(result).toBe("/farms");
  });

  it("redirects a platform-only route for a tenant user to their accessible route", async () => {
    const deps = makeDeps({
      getMeResult: meResult({ kind: "ok", me: { status: "active" } }),
      getAccessCached: vi.fn().mockResolvedValue({
        isPlatformAdmin: false,
        features: ["FARMS"],
      }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard({
      ...route("/dashboard"),
      meta: { requiresAuth: true, platformOnly: true },
    } as any);

    expect(result).toBe("/farms");
  });

  it("does not bounce a user without ANALYSIS_CREATE to /analyses/new (regression)", async () => {
    // Reproduces the incident: features lacking ANALYSIS_CREATE must not be
    // sent to /analyses/new (which requires it) and then to /403.
    const deps = makeDeps({
      getMeResult: meResult({ kind: "ok", me: { status: "active" } }),
      getAccessCached: vi.fn().mockResolvedValue({
        isPlatformAdmin: false,
        features: ["FARMS", "ANALYSES", "CAR_SEARCH"],
      }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard({
      ...route("/analyses/new"),
      meta: { requiresAuth: true, feature: "ANALYSIS_CREATE" },
    } as any);

    expect(result).toBe("/analyses/search");
  });

  it("sends a user with no usable feature to /403", async () => {
    const deps = makeDeps({
      getMeResult: meResult({ kind: "ok", me: { status: "active" } }),
      getAccessCached: vi.fn().mockResolvedValue({ isPlatformAdmin: false, features: [] }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard({
      ...route("/analyses"),
      meta: { requiresAuth: true, feature: "ANALYSES" },
    } as any);

    expect(result).toBe("/403");
  });

  it("self-heals a stale active org: refreshes identity and retries access once", async () => {
    const getAccessCached = vi
      .fn()
      .mockResolvedValueOnce(null) // first attempt: stale org → access denied
      .mockResolvedValueOnce({
        isPlatformAdmin: false,
        features: ["FARMS", "ANALYSES", "CAR_SEARCH"],
      });
    const getMeResult = vi
      .fn()
      .mockResolvedValue({ kind: "ok", me: { status: "active", memberships: [{ orgId: "o" }] } });
    const deps = makeDeps({ getMeResult, getAccessCached });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard({
      ...route("/analyses"),
      meta: { requiresAuth: true, feature: "ANALYSES" },
    } as any);

    expect(result).toBe(true);
    expect(getMeResult).toHaveBeenCalledWith(true); // forced refresh during recovery
    expect(getAccessCached).toHaveBeenCalledTimes(2); // retried after re-hydrate
  });

  it("hydrates active org from memberships before loading access", async () => {
    const deps = makeDeps({
      ensureSession: vi.fn().mockResolvedValue({ data: { sessionId: "sid" } }),
      getMeResult: meResult({
        kind: "ok",
        me: {
          status: "active",
          memberships: [{ orgId: "org-1", role: "member" }],
        },
      }),
    });

    const guard = createAuthNavigationGuard(deps);
    await guard({
      ...route("/analyses/new"),
      meta: { requiresAuth: true, feature: "ANALYSIS_CREATE" },
    } as any);

    expect(hydrateActiveOrgFromMemberships).toHaveBeenCalledWith([
      { orgId: "org-1", role: "member" },
    ]);
    expect(deps.getAccessCached).toHaveBeenCalledWith(false);
  });

  it("does not bounce on a transient /me failure (keeps the user in)", async () => {
    const deps = makeDeps({
      ensureSession: vi.fn().mockResolvedValue({ data: { sessionId: "sid" } }),
      getMeResult: meResult({ kind: "transient" }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard(route("/dashboard") as any);

    // Session is valid; a transient identity blip must not redirect to /pending.
    expect(result).toBe(true);
    expect(deps.getAccessStatus).not.toHaveBeenCalled();
  });

  it("allows a platformUserOnly route for a platform user (non-admin)", async () => {
    const deps = makeDeps({
      getMeResult: meResult({ kind: "ok", me: { status: "active" } }),
      getAccessCached: vi.fn().mockResolvedValue({
        isPlatformAdmin: false,
        isPlatformUser: true,
        features: [],
      }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard({
      ...route("/dashboard"),
      meta: { requiresAuth: true, platformUserOnly: true },
    } as any);

    expect(result).toBe(true);
  });

  it("redirects a platformUserOnly route for a non-platform user", async () => {
    const deps = makeDeps({
      getMeResult: meResult({ kind: "ok", me: { status: "active" } }),
      getAccessCached: vi.fn().mockResolvedValue({
        isPlatformAdmin: false,
        isPlatformUser: false,
        features: ["FARMS"],
      }),
    });

    const guard = createAuthNavigationGuard(deps);
    const result = await guard({
      ...route("/dashboard"),
      meta: { requiresAuth: true, platformUserOnly: true },
    } as any);

    expect(result).not.toBe(true);
    expect(result).toBe("/farms");
  });
});
