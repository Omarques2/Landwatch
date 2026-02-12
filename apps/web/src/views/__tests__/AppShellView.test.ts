import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import AppShellView from "@/views/AppShellView.vue";
import { getMeCached } from "@/auth/me";
import { mvBusy } from "@/state/landwatch-status";

vi.mock("@/auth/auth", () => ({
  logout: vi.fn(),
}));

vi.mock("@/auth/me", () => ({
  getMeCached: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/state/landwatch-status", () => ({
  mvBusy: ref(false),
  fetchLandwatchStatus: vi.fn().mockResolvedValue(null),
  startLandwatchStatusPolling: vi.fn(),
  stopLandwatchStatusPolling: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: "/dashboard", meta: { title: "Dashboard" } }),
}));

describe("AppShellView", () => {
  it("shows sidebar user skeleton while profile is loading", () => {
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
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

  it("renders MV refresh warning when busy", () => {
    mvBusy.value = true;
    const wrapper = mount(AppShellView, {
      global: {
        stubs: {
          RouterView: true,
          UiSheet: { template: "<div><slot /></div>" },
        },
      },
    });

    expect(wrapper.text()).toContain("Base geoespacial em atualização");
  });

  it("loads profile through getMeCached with retry-capable path", async () => {
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "user@example.com",
      displayName: "User",
      status: "active",
    });

    mount(AppShellView, {
      global: {
        stubs: {
          RouterView: true,
          UiSheet: { template: "<div><slot /></div>" },
        },
      },
    });

    await Promise.resolve();
    expect(getMeCached).toHaveBeenCalledWith(true);
  });

  it("renders the Agendamento item in navigation", () => {
    const wrapper = mount(AppShellView, {
      global: {
        stubs: {
          RouterView: true,
          UiSheet: { template: "<div><slot /></div>" },
        },
      },
    });

    expect(wrapper.text()).toContain("Agendamento");
  });
});
