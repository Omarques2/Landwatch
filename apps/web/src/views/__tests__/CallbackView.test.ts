import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import CallbackView from "@/views/CallbackView.vue";
import { getMeCached } from "@/auth/me";
import { authClient, buildProductLoginRoute, getRouteReturnTo } from "@/auth/sigfarm-auth";

const replaceMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useRoute: () => ({
    query: {
      returnTo: "/dashboard",
    },
  }),
}));

vi.mock("@/auth/sigfarm-auth", () => ({
  authClient: {
    exchangeSession: vi.fn(),
    clearSession: vi.fn(),
  },
  buildProductLoginRoute: vi.fn((returnTo: string) => `/login?returnTo=${encodeURIComponent(returnTo)}`),
  getRouteReturnTo: vi.fn(() => "http://localhost:5173/dashboard"),
}));

vi.mock("@/auth/me", () => ({
  getMeCached: vi.fn(),
}));

async function flushTick() {
  await flushPromises();
  await flushPromises();
}

describe("CallbackView", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    replaceMock.mockResolvedValue(undefined);
    (authClient.exchangeSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { accessToken: "token" },
    });
    (authClient.clearSession as unknown as ReturnType<typeof vi.fn>).mockReset();
    (getRouteReturnTo as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      "http://localhost:5173/dashboard",
    );
    (buildProductLoginRoute as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (returnTo: string) => `/login?returnTo=${encodeURIComponent(returnTo)}`,
    );
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it("redirects to /pending when /users/me is unavailable", async () => {
    mount(CallbackView);
    await flushTick();

    expect(authClient.exchangeSession).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/pending");
  });

  it("redirects to safe returnTo path when profile is active", async () => {
    (getRouteReturnTo as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      "http://localhost:5173/analyses",
    );
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    mount(CallbackView);
    await flushTick();

    expect(getMeCached).toHaveBeenCalledWith(true);
    expect(replaceMock).toHaveBeenCalledWith("/pending");
  });

  it("redirects to route from returnTo when account is active", async () => {
    (getRouteReturnTo as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      `${window.location.origin}/schedules`,
    );
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "active",
    });

    mount(CallbackView);
    await flushTick();

    expect(replaceMock).toHaveBeenCalledWith("/schedules");
  });

  it("redirects to root when returnTo origin is not from current app", async () => {
    (getRouteReturnTo as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      "https://auth.sigfarmintelligence.com/",
    );
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "active" });

    mount(CallbackView);
    await flushTick();

    expect(replaceMock).toHaveBeenCalledWith("/");
  });

  it("falls back to /login when callback flow throws unexpectedly", async () => {
    (authClient.exchangeSession as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("exchange failed"),
    );

    mount(CallbackView);
    await flushTick();

    expect(authClient.clearSession).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith(
      "/login?returnTo=http%3A%2F%2Flocalhost%3A5173%2Fdashboard",
    );
  });
});
