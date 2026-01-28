import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { Button, Badge, Card, Skeleton } from "@/components/ui";

describe("ui base components", () => {
  it("renders Button slot content", () => {
    const wrapper = mount(Button, { slots: { default: "Salvar" } });
    expect(wrapper.text()).toContain("Salvar");
  });

  it("renders Badge text", () => {
    const wrapper = mount(Badge, { slots: { default: "ativo" } });
    expect(wrapper.text()).toBe("ativo");
  });

  it("renders Card with content", () => {
    const wrapper = mount(Card, { slots: { default: "Conteudo" } });
    expect(wrapper.text()).toContain("Conteudo");
  });

  it("renders Skeleton element", () => {
    const wrapper = mount(Skeleton);
    expect(wrapper.exists()).toBe(true);
  });
});
