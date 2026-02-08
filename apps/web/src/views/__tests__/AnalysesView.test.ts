import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AnalysesView from "@/views/AnalysesView.vue";
import { http } from "@/api/http";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("AnalysesView", () => {
  it("renders skeleton while analyses are loading", () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const wrapper = mount(AnalysesView);

    expect(wrapper.find('[data-testid="analyses-skeleton"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Nenhuma análise encontrada.");
  });
});
