import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import SidebarContent from "@/components/SidebarContent.vue";

describe("SidebarContent", () => {
  it("renders workspaces and reports when selected", async () => {
    const selectWorkspace = vi.fn();
    const openReport = vi.fn();

    const wrapper = mount(SidebarContent, {
      props: {
        mode: "desktop",
        collapsed: false,
        workspaces: [{ id: "ws1", name: "Workspace A" }],
        reportsByWorkspace: {
          ws1: [{ id: "r1", name: "Report A", workspaceId: "ws1" }],
        },
        selectedWorkspaceId: "ws1",
        selectedReport: null,
        loadingWorkspaces: false,
        error: "",
        userName: "User",
        userEmail: "user@example.com",
        isAdmin: false,
        goAdmin: undefined,
        loadWorkspaces: vi.fn(),
        selectWorkspace,
        openReport,
        onLogout: vi.fn(),
      },
    });

    expect(wrapper.text()).toContain("Workspace A");
    expect(wrapper.text()).toContain("Report A");

    const buttons = wrapper.findAll("button");
    const workspaceBtn = buttons.find((btn) =>
      btn.text().includes("Workspace A"),
    );
    expect(workspaceBtn).toBeTruthy();
    await workspaceBtn!.trigger("click");
    expect(selectWorkspace).toHaveBeenCalledTimes(1);
  });
});
