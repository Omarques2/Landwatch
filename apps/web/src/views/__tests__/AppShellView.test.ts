import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AppShellView from "@/views/AppShellView.vue";
import { http } from "@/api/http";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
  },
}));

vi.mock("@/auth/auth", () => ({
  logout: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: "/dashboard", meta: { title: "Dashboard" } }),
}));

describe("AppShellView", () => {
  it("shows sidebar user skeleton while profile is loading", () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const wrapper = mount(AppShellView, {
      global: {
        stubs: {
          RouterView: true,
          UiSheet: { template: "<div><slot /></div>" },
        },
      },
    });

    expect(wrapper.find('[data-testid="sidebar-user-skeleton"]').exists()).toBe(true);
  });
});
