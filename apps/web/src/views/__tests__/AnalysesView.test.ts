import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
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

  it("applies filters when requested", async () => {
    const mockGet = http.get as unknown as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/farms") {
        return Promise.resolve({
          data: {
            data: [
              {
                id: "farm-1",
                name: "Fazenda Teste",
                carKey: "SP-1234567-0000000000000000000000000000000000",
              },
            ],
            meta: { page: 1, pageSize: 50, total: 1 },
          },
        });
      }
      if (url === "/v1/analyses") {
        return Promise.resolve({
          data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
        });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    const wrapper = mount(AnalysesView);
    await flushPromises();

    await wrapper.find('[data-testid="analysis-filter-farm"]').setValue("farm-1");
    await wrapper.find('[data-testid="analysis-filter-start"]').setValue("2026-02-01");
    await wrapper.find('[data-testid="analysis-filter-end"]').setValue("2026-02-10");
    await wrapper.find('[data-testid="analysis-filter-apply"]').trigger("click");
    await flushPromises();

    const calls = mockGet.mock.calls.filter(([url]) => url === "/v1/analyses");
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]?.params).toMatchObject({
      farmId: "farm-1",
      startDate: "2026-02-01",
      endDate: "2026-02-10",
      page: 1,
      pageSize: 20,
    });
  });

  it("uses safe pageSize when loading farms", async () => {
    const mockGet = http.get as unknown as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/farms") {
        return Promise.resolve({
          data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
        });
      }
      if (url === "/v1/analyses") {
        return Promise.resolve({
          data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
        });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    mount(AnalysesView);
    await flushPromises();

    const farmsCall = mockGet.mock.calls.find(([url]) => url === "/v1/farms");
    expect(farmsCall?.[1]?.params).toMatchObject({
      page: 1,
      pageSize: 100,
    });
  });
});
