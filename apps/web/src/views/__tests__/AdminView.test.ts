import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import AdminView from "@/views/AdminView.vue";
import {
  listAdminMemberships,
  listAdminOrgs,
  listAdminUsers,
  updateAdminUserStatus,
} from "@/features/attachments/api";

vi.mock("@/features/attachments/api", () => ({
  addAdminMembership: vi.fn(),
  createAdminOrg: vi.fn(),
  listAdminMemberships: vi.fn(),
  listAdminOrgs: vi.fn(),
  listAdminUsers: vi.fn(),
  removeAdminMembership: vi.fn(),
  updateAdminMembership: vi.fn(),
  updateAdminOrg: vi.fn(),
  updateAdminUserStatus: vi.fn(),
}));

vi.mock("@/components/ui", () => ({
  Button: {
    props: ["disabled"],
    emits: ["click"],
    template: `<button :disabled="disabled" @click="$emit('click')"><slot /></button>`,
  },
  Dialog: {
    props: ["open"],
    emits: ["close"],
    template: `<div v-if="open"><slot /></div>`,
  },
  Input: {
    props: ["modelValue", "placeholder"],
    emits: ["update:modelValue"],
    template: `<input :value="modelValue" :placeholder="placeholder" @input="$emit('update:modelValue', $event.target.value)" />`,
  },
  Select: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><slot /></select>`,
  },
  Skeleton: { template: `<div />` },
  useToast: () => ({ push: vi.fn() }),
}));

describe("AdminView", () => {
  beforeEach(() => {
    (listAdminOrgs as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "org-1",
        name: "Org 1",
        slug: "org-1",
        status: "active",
        createdAt: "2026-05-04T00:00:00.000Z",
      },
    ]);
    (listAdminMemberships as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listAdminUsers as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "user-1",
        identityUserId: "identity-1",
        email: "pending@example.com",
        displayName: "Pending User",
        status: "pending",
        createdAt: "2026-05-04T00:00:00.000Z",
        lastLoginAt: null,
        memberships: [],
      },
    ]);
    (updateAdminUserStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      status: "active",
      memberships: [{ orgId: "org-1", role: "member", org: { id: "org-1", name: "Org 1", slug: "org-1" } }],
    });
  });

  it("renders pending user and activates with selected org and role", async () => {
    const wrapper = mount(AdminView);
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("Pending User");
    expect(wrapper.text()).toContain("Pendente");

    const activateButton = wrapper.findAll("button").find((node) => node.text().includes("Ativar"));
    expect(activateButton).toBeTruthy();
    await activateButton!.trigger("click");
    await flushPromises();

    const confirmButton = wrapper.findAll("button").find((node) => node.text().includes("Confirmar ativação"));
    expect(confirmButton).toBeTruthy();
    await confirmButton!.trigger("click");
    await flushPromises();

    expect(updateAdminUserStatus).toHaveBeenCalledWith("user-1", {
      status: "active",
      orgId: "org-1",
      role: "member",
    });
  });
});
