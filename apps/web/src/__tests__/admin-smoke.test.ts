import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import AdminView from "@/views/AdminView.vue";
import ConfirmHost from "@/ui/confirm/ConfirmHost.vue";
import ToastHost from "@/ui/toast/ToastHost.vue";

vi.mock("@/features/admin/api", () => ({
  listPendingUsers: vi.fn().mockResolvedValue([]),
  listCustomers: vi.fn().mockResolvedValue([]),
  activateUser: vi.fn().mockResolvedValue({ ok: true }),
  disableUser: vi.fn().mockResolvedValue({ ok: true }),
  listAuditLogs: vi.fn().mockResolvedValue({ page: 1, pageSize: 25, total: 0, rows: [] }),
}));

describe("admin smoke", () => {
  it("mounts AdminView with toast/confirm hosts", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/admin", component: AdminView }],
    });

    await router.push("/admin");
    await router.isReady();

    const wrapper = mount(
      {
        components: { AdminView, ConfirmHost, ToastHost },
        template: "<div><ConfirmHost /><ToastHost /><AdminView /></div>",
      },
      {
        global: {
          plugins: [router],
          stubs: { Teleport: true },
        },
      },
    );

    await flushPromises();

    expect(wrapper.findComponent(AdminView).exists()).toBe(true);
    expect(wrapper.findComponent(ConfirmHost).exists()).toBe(true);
    expect(wrapper.findComponent(ToastHost).exists()).toBe(true);
  });
});
