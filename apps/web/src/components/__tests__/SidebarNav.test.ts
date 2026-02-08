import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { markRaw } from "vue";
import SidebarNav from "@/components/SidebarNav.vue";

const DummyIcon = markRaw({
  template: "<span />",
});

describe("SidebarNav", () => {
  it("shows a skeleton while user data is loading", () => {
    const wrapper = mount(SidebarNav, {
      props: {
        mode: "desktop",
        collapsed: false,
        items: [{ key: "dashboard", label: "Dashboard", icon: DummyIcon }],
        activeKey: "dashboard",
        userName: null,
        userEmail: null,
        userLoading: true,
        onLogout: () => undefined,
        onSelect: () => undefined,
        onNewAnalysis: () => undefined,
      },
    });

    expect(wrapper.find('[data-testid="sidebar-user-skeleton"]').exists()).toBe(true);
  });
});
