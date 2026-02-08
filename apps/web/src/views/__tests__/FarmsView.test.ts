import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import FarmsView from "@/views/FarmsView.vue";
import { http } from "@/api/http";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("FarmsView", () => {
  it("renders skeleton while farms are loading", () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const wrapper = mount(FarmsView);

    expect(wrapper.find('[data-testid="farms-skeleton"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Nenhuma fazenda cadastrada.");
  });
});
