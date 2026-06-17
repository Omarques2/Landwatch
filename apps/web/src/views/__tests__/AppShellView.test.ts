import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import AppShellView from "@/views/AppShellView.vue";
import { getAccessCached, getMeCached } from "@/auth/me";
import { mvBusy } from "@/state/landwatch-status";
import { getActiveOrgId, setActiveOrgId, clearRejectedOrgs } from "@/state/org-context";

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
  mvStatusResolved: ref(true),
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
    setActiveOrgId(null);
    clearRejectedOrgs();
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

  it("loads profile reusing the guard cache (force=false)", async () => {
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
    // Shell reuses the cache the navigation guard just populated instead of
    // forcing a second round-trip.
    expect(getMeCached).toHaveBeenCalledWith(false);
    expect(getAccessCached).toHaveBeenCalledWith(false);
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

  it("shows the active org as a label when the user has one membership", async () => {
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      email: "user@example.com",
      displayName: "User",
      status: "active",
      memberships: [
        {
          orgId: "11111111-1111-4111-8111-111111111111",
          role: "member",
          org: { name: "Org Unica", slug: "org-unica" },
        },
      ],
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

    expect(wrapper.find('[data-testid="active-org-label"]').text()).toContain("Org Unica");
    expect(wrapper.find('[data-testid="org-switcher"]').exists()).toBe(false);
  });

  it("lets a multi-org user switch active org from the topbar", async () => {
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      email: "user@example.com",
      displayName: "User",
      status: "active",
      memberships: [
        {
          orgId: "11111111-1111-4111-8111-111111111111",
          role: "member",
          org: { name: "Org A", slug: "org-a" },
        },
        {
          orgId: "22222222-2222-4222-8222-222222222222",
          role: "member",
          org: { name: "Org B", slug: "org-b" },
        },
      ],
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
    const select = wrapper.find('[data-testid="org-switcher"]');
    expect(select.exists()).toBe(true);

    await select.setValue("22222222-2222-4222-8222-222222222222");
    await flushPromises();

    expect(getActiveOrgId()).toBe("22222222-2222-4222-8222-222222222222");
    expect(getAccessCached).toHaveBeenCalledWith(true);
  });
});
