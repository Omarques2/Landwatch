import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import PendingView from "@/views/PendingView.vue";
import { getAccessStatus } from "@/auth/me";
const replaceMock = vi.fn();

vi.mock("@/auth/auth", () => ({
  logout: vi.fn(),
  hardResetAuthState: vi.fn(),
}));

vi.mock("@/auth/me", () => ({
  getAccessStatus: vi.fn(),
}));

vi.mock("@/auth/sigfarm-auth", () => ({
  authClient: {
    clearSession: vi.fn(),
  },
  buildProductLoginRoute: vi.fn((returnTo: string) => `/login?returnTo=${encodeURIComponent(returnTo)}`),
  resolveReturnTo: vi.fn((value?: string) => value ?? "http://localhost/"),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe("PendingView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replaceMock.mockReset();
    (getAccessStatus as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it("redirects to app when access-status returns active", async () => {
    (getAccessStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "active",
    });

    const wrapper = mount(PendingView, {
      global: {
        stubs: {
          UiButton: { template: "<button @click=\"$emit('click')\"><slot /></button>" },
        },
      },
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(getAccessStatus).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/");
    wrapper.unmount();
  });

  it("does not poll automatically after initial check", async () => {
    (getAccessStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "pending",
    });

    const wrapper = mount(PendingView, {
      global: {
        stubs: {
          UiButton: { template: "<button @click=\"$emit('click')\"><slot /></button>" },
        },
      },
    });

    await vi.advanceTimersByTimeAsync(20_000);

    expect(getAccessStatus).toHaveBeenCalledTimes(1);
    expect(replaceMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
