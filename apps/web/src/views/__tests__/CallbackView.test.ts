import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import CallbackView from "@/views/CallbackView.vue";
import { getMeCached } from "@/auth/me";
import { authClient, buildProductLoginRoute, getRouteReturnTo } from "@/auth/sigfarm-auth";

const replaceMock = vi.fn();
const mountedWrappers: Array<ReturnType<typeof mount>> = [];

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

function mountView() {
  const wrapper = mount(CallbackView);
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("CallbackView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount();
    }
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("redirects to /pending when /users/me is unavailable", async () => {
    mountView();
    await flushTick();

    expect(authClient.exchangeSession).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/pending");
  });

  it("redirects to safe returnTo path when profile is active", async () => {
    (getRouteReturnTo as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      "http://localhost:5173/analyses",
    );
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    mountView();
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

    mountView();
    await flushTick();

    expect(replaceMock).toHaveBeenCalledWith("/schedules");
  });

  it("redirects to route from returnTo when account is pending", async () => {
    (getRouteReturnTo as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      `${window.location.origin}/dashboard`,
    );
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "pending",
    });

    mountView();
    await flushTick();

    expect(replaceMock).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to root when returnTo origin is not from current app", async () => {
    (getRouteReturnTo as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      "https://auth.sigfarmintelligence.com/",
    );
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "active" });

    mountView();
    await flushTick();

    expect(replaceMock).toHaveBeenCalledWith("/");
  });

  it("continues callback flow when returnTo parsing throws", async () => {
    (getRouteReturnTo as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("bad returnTo");
    });
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "active" });

    mountView();
    await flushTick();

    expect(authClient.exchangeSession).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/");
  });

  it("retries exchange session after a transient failure", async () => {
    (authClient.exchangeSession as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ session: { accessToken: "token" } });

    mountView();
    await flushTick();
    await vi.advanceTimersByTimeAsync(320);
    await flushTick();

    expect((authClient.exchangeSession as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(replaceMock).toHaveBeenCalledWith("/pending");
  });

  it("falls back to /login when callback flow throws unexpectedly", async () => {
    (authClient.exchangeSession as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("exchange failed"),
    );

    mountView();
    await flushTick();
    await vi.advanceTimersByTimeAsync(1_000);
    await flushTick();

    expect(authClient.clearSession).toHaveBeenCalled();
    expect((authClient.exchangeSession as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(replaceMock).toHaveBeenCalledWith(
      "/login?returnTo=http%3A%2F%2Flocalhost%3A5173%2Fdashboard",
    );
  });

  it("continues to dashboard when /users/me succeeds after exchange retry exhaustion", async () => {
    (authClient.exchangeSession as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("exchange failed"),
    );
    (getRouteReturnTo as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      `${window.location.origin}/dashboard`,
    );
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "active" });

    mountView();
    await flushTick();
    await vi.advanceTimersByTimeAsync(1_000);
    await flushTick();

    expect(getMeCached).toHaveBeenCalledWith(true);
    expect(authClient.clearSession).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/dashboard");
  });
});
