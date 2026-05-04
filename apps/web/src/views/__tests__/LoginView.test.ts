import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import LoginView from "@/views/LoginView.vue";
import { authClient, getRouteReturnTo } from "@/auth/sigfarm-auth";
import { getAccessStatus, getMeCached } from "@/auth/me";

const replaceMock = vi.fn();
let currentRouteQuery: Record<string, unknown> = {};

vi.mock("vue-router", () => ({
  useRoute: () => ({
    query: currentRouteQuery,
  }),
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("@/auth/sigfarm-auth", () => ({
  authClient: {
    exchangeSession: vi.fn(),
  },
  buildAuthCallbackReturnTo: vi.fn(() => "https://testlandwatch.sigfarmintelligence.com/auth/callback"),
  buildAuthPortalLoginUrl: vi.fn(() => "https://testauth.sigfarmintelligence.com/login"),
  getRouteReturnTo: vi.fn(() => "https://testlandwatch.sigfarmintelligence.com/dashboard"),
}));

vi.mock("@/auth/me", () => ({
  getMeCached: vi.fn(),
  getAccessStatus: vi.fn(),
}));

describe("LoginView", () => {
  beforeEach(() => {
    currentRouteQuery = {};
    replaceMock.mockReset();
    replaceMock.mockResolvedValue(undefined);
    (authClient.exchangeSession as unknown as ReturnType<typeof vi.fn>).mockReset();
    (authClient.exchangeSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { accessToken: "token" },
    });
    (getRouteReturnTo as unknown as ReturnType<typeof vi.fn>).mockReset();
    (getRouteReturnTo as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      `${window.location.origin}/dashboard`,
    );
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockReset();
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getAccessStatus as unknown as ReturnType<typeof vi.fn>).mockReset();
    (getAccessStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "pending" });
  });

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("redirects pending users to /pending during login auto-resume", async () => {
    currentRouteQuery = { returnTo: "/dashboard" };

    mount(LoginView, {
      global: {
        stubs: {
          UiButton: { template: "<button><slot /></button>" },
        },
      },
    });

    await flushPromises();
    await flushPromises();

    expect(authClient.exchangeSession).toHaveBeenCalled();
    expect(getMeCached).toHaveBeenCalledWith(true);
    expect(getAccessStatus).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/pending");
  });

  it("auto-resumes session and redirects active users when login has returnTo", async () => {
    currentRouteQuery = { returnTo: "/dashboard" };
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "active" });

    mount(LoginView, {
      global: {
        stubs: {
          UiButton: { template: "<button><slot /></button>" },
        },
      },
    });

    await flushPromises();
    await flushPromises();

    expect(authClient.exchangeSession).toHaveBeenCalled();
    expect(getMeCached).toHaveBeenCalledWith(true);
    expect(getAccessStatus).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/dashboard");
  });

  it("skips auto-resume when login has no returnTo query", async () => {
    currentRouteQuery = {};

    mount(LoginView, {
      global: {
        stubs: {
          UiButton: { template: "<button><slot /></button>" },
        },
      },
    });

    await flushPromises();
    await flushPromises();

    expect(authClient.exchangeSession).not.toHaveBeenCalled();
    expect(getMeCached).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("retries exchange before resolving login auto-resume", async () => {
    vi.useFakeTimers();
    currentRouteQuery = { returnTo: "/dashboard" };
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "active" });
    (authClient.exchangeSession as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ session: { accessToken: "token" } });

    mount(LoginView, {
      global: {
        stubs: {
          UiButton: { template: "<button><slot /></button>" },
        },
      },
    });

    await flushPromises();
    await vi.advanceTimersByTimeAsync(350);
    await flushPromises();

    expect((authClient.exchangeSession as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(getMeCached).toHaveBeenCalledWith(true);
    expect(getAccessStatus).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/dashboard");
  });
});
