import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import LoginView from "@/views/LoginView.vue";
import { authClient, getRouteReturnTo } from "@/auth/sigfarm-auth";
import { getMeCached } from "@/auth/me";

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
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "pending" });
  });

  it("auto-resumes session and redirects when login has returnTo", async () => {
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
});
