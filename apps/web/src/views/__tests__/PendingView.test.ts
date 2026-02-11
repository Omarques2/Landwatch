import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import PendingView from "@/views/PendingView.vue";
import { http } from "@/api/http";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
  },
}));

vi.mock("@/auth/auth", () => ({
  logout: vi.fn(),
  hardResetAuthState: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("PendingView", () => {
  it("retries /v1/users/me on transient errors before failing over", async () => {
    (http.get as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { data: { status: "active" } } });

    const wrapper = mount(PendingView, {
      global: {
        stubs: {
          UiButton: { template: "<button><slot /></button>" },
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(http.get).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });
});
