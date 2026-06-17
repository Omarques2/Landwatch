// apps/web/src/ui/__tests__/BaseDrawer.spec.ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BaseDrawer from "../BaseDrawer.vue";

describe("BaseDrawer", () => {
  it("renders an accessible dialog when open", () => {
    const wrapper = mount(BaseDrawer, {
      props: { open: true, side: "bottom" },
      slots: { default: "<p>content</p>" },
      attachTo: document.body,
    });
    const panel = document.querySelector('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("aria-modal")).toBe("true");
    // Accessible name present (defaults to "Painel" when no label prop).
    expect((panel?.getAttribute("aria-label") ?? "").length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it("uses the label prop as the accessible name", () => {
    const wrapper = mount(BaseDrawer, {
      props: { open: true, side: "bottom", label: "Ajustar busca" },
      attachTo: document.body,
    });
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(
      "Ajustar busca",
    );
    wrapper.unmount();
  });

  it("traps Tab and Shift+Tab inside the panel", async () => {
    const wrapper = mount(BaseDrawer, {
      props: { open: true, side: "bottom" },
      slots: { default: '<button id="a">a</button><button id="b">b</button>' },
      attachTo: document.body,
    });
    await wrapper.vm.$nextTick();
    const a = document.getElementById("a") as HTMLButtonElement;
    const b = document.getElementById("b") as HTMLButtonElement;
    // Tab from the last focusable wraps to the first.
    b.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(document.activeElement).toBe(a);
    // Shift+Tab from the first wraps to the last.
    a.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(b);
    wrapper.unmount();
  });

  it("emits close on Escape keydown", async () => {
    const wrapper = mount(BaseDrawer, {
      props: { open: true, side: "bottom" },
      attachTo: document.body,
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("close")).toBeTruthy();
    wrapper.unmount();
  });

  it("emits close when the overlay is clicked", async () => {
    const wrapper = mount(BaseDrawer, {
      props: { open: true, side: "bottom" },
      attachTo: document.body,
    });
    const overlay = document.querySelector("[data-drawer-overlay]") as HTMLElement;
    overlay.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("close")).toBeTruthy();
    wrapper.unmount();
  });

  it("returns focus to the trigger on close", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const wrapper = mount(BaseDrawer, {
      props: { open: true, side: "bottom" },
      slots: { default: "<button>inside</button>" },
      attachTo: document.body,
    });
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ open: false });
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
    trigger.remove();
  });
});
