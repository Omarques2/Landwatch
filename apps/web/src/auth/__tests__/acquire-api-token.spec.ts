import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAccessToken, exchangeSession, refreshSession, clearSession } = vi.hoisted(
  () => ({
    getAccessToken: vi.fn(),
    exchangeSession: vi.fn(),
    refreshSession: vi.fn(),
    clearSession: vi.fn(),
  }),
);

vi.mock("@/auth/sigfarm-auth", () => ({
  authClient: { getAccessToken, exchangeSession, refreshSession, clearSession },
  sigfarmAuthApiBaseUrl: "https://auth.example.com",
  buildAuthCallbackReturnTo: vi.fn(),
  buildAuthPortalLoginUrl: vi.fn(),
  resolveReturnTo: vi.fn((v?: string) => v ?? "/"),
}));

vi.mock("@/auth/local-bypass", () => ({
  isLocalAuthBypassEnabled: () => false,
}));

import { acquireApiToken, clearApiTokenCache } from "@/auth/auth";

describe("acquireApiToken cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearApiTokenCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T00:00:00Z"));
    getAccessToken.mockResolvedValue("tok-1");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reuses the cached token across sequential calls (one acquisition)", async () => {
    const a = await acquireApiToken();
    const b = await acquireApiToken();
    expect(a).toBe("tok-1");
    expect(b).toBe("tok-1");
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("re-acquires once the cached token nears expiry", async () => {
    await acquireApiToken(); // non-JWT token → default ~900s TTL
    vi.advanceTimersByTime(900_000); // past (exp - margin)
    getAccessToken.mockResolvedValue("tok-2");
    const t = await acquireApiToken();
    expect(t).toBe("tok-2");
    expect(getAccessToken).toHaveBeenCalledTimes(2);
  });

  it("forceRefresh bypasses the cache and refreshes", async () => {
    await acquireApiToken();
    refreshSession.mockResolvedValue(undefined);
    getAccessToken.mockResolvedValue("tok-forced");
    const t = await acquireApiToken({ forceRefresh: true });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(t).toBe("tok-forced");
  });

  it("clearApiTokenCache forces a fresh acquisition", async () => {
    await acquireApiToken();
    clearApiTokenCache();
    getAccessToken.mockResolvedValue("tok-3");
    const t = await acquireApiToken();
    expect(t).toBe("tok-3");
    expect(getAccessToken).toHaveBeenCalledTimes(2);
  });
});
