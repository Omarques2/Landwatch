import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import AppShellView from "@/views/AppShellView.vue";
import { getAccessCached, getMeCached } from "@/auth/me";
import { mvBusy } from "@/state/landwatch-status";

vi.mock("@/auth/auth", () => ({
  logout: vi.fn(),
}));

vi.mock("@/auth/me", () => ({
  getMeCached: vi.fn().mockResolvedValue(null),
  getAccessCached: vi.fn().mockResolvedValue({
    isPlatformAdmin: true,
    features: ["FARMS", "ANALYSES", "ANALYSIS_CREATE", "CAR_SEARCH", "SCHEDULES", "ATTACHMENTS"],
  }),
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
  beforeEach(() => {
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "user@example.com",
      displayName: "User",
      status: "active",
      memberships: [{ orgId: "org-1", role: "member" }],
    });
    (getAccessCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      isPlatformAdmin: true,
      features: ["FARMS", "ANALYSES", "ANALYSIS_CREATE", "CAR_SEARCH", "SCHEDULES", "ATTACHMENTS"],
    });
    mvBusy.value = false;
  });

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
    expect(getAccessCached).toHaveBeenCalledWith(true);
  });

  it("renders the Agendamento item in navigation", async () => {
    const wrapper = mount(AppShellView, {
      global: {
        stubs: {
          RouterView: true,
          UiSheet: { template: "<div><slot /></div>" },
        },
      },
    });

    await flushPromises();
    expect(wrapper.text()).toContain("Agendamento");
  });

  it("renders the Fornecedores item for platform admins", async () => {
    const wrapper = mount(AppShellView, {
      global: {
        stubs: {
          RouterView: true,
          UiSheet: { template: "<div><slot /></div>" },
        },
      },
    });

    await flushPromises();
    expect(wrapper.text()).toContain("Fornecedores");
  });

  it("hides platform-only navigation for tenants", async () => {
    (getAccessCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isPlatformAdmin: false,
      features: ["FARMS"],
    });

    const wrapper = mount(AppShellView, {
      global: {
        stubs: {
          RouterView: true,
          UiSheet: { template: "<div><slot /></div>" },
        },
      },
    });

    await flushPromises();
    expect(wrapper.text()).toContain("Fazendas");
    expect(wrapper.text()).not.toContain("Fornecedores");
    expect(wrapper.text()).not.toContain("Painel Admin");
  });
});
