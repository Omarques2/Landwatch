import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import FarmsView from "@/views/FarmsView.vue";
import { http } from "@/api/http";
import {
  clearListCache,
  listCacheKey,
  writeListCache,
} from "@/features/shared/list-cache";

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
    clearListCache();
    (http.get as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const wrapper = mount(FarmsView);

    expect(wrapper.find('[data-testid="farms-skeleton"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Nenhuma fazenda cadastrada.");
  });

  it("shows cached farms immediately on a warm mount (no stuck skeleton)", async () => {
    clearListCache();
    // Seed the cache the component will read on mount.
    writeListCache(listCacheKey("farms", { pageSize: 100, includeDocs: true }), [
      { id: "f1", name: "Fazenda Cache", carKey: "CAR-1", documentsCount: 0 },
    ]);
    // Background revalidation never resolves — the cached list must still show.
    (http.get as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const wrapper = mount(FarmsView);
    await flushPromises();

    expect(wrapper.find('[data-testid="farms-skeleton"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Fazenda Cache");
    clearListCache();
  });
});
