import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import DashboardView from "@/views/DashboardView.vue";
import { http } from "@/api/http";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("DashboardView", () => {
  it("renders skeleton while loading", () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const wrapper = mount(DashboardView);

    expect(wrapper.find('[data-testid="dashboard-skeleton"]').exists()).toBe(true);
  });
});
