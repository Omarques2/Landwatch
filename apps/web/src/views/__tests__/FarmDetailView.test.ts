import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import FarmDetailView from "@/views/FarmDetailView.vue";
import { http } from "@/api/http";
import { mvBusy } from "@/state/landwatch-status";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: { id: "farm-1" } }),
}));

vi.mock("@/state/landwatch-status", () => ({
  mvBusy: ref(false),
}));

describe("FarmDetailView", () => {
  beforeEach(() => {
    mvBusy.value = false;
  });

  it("skips geometry load when MV is refreshing", async () => {
    mvBusy.value = true;
    const farmResponse = {
      data: {
        data: {
          id: "farm-1",
          name: "Fazenda Teste",
          carKey: "SP-1234567-0000000000000000000000000000000000",
          cpfCnpj: "52998224725",
        },
      },
    };
    const analysesResponse = {
      data: {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      },
    };

    (http.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/v1/farms/")) return Promise.resolve(farmResponse);
      if (url === "/v1/analyses") return Promise.resolve(analysesResponse);
      return Promise.reject(new Error("Unexpected endpoint"));
    });

    const wrapper = mount(FarmDetailView, {
      global: {
        stubs: {
          AnalysisMap: {
            template: '<div data-testid="farm-map"></div>',
          },
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("Base geoespacial em atualização");
    expect(http.get).not.toHaveBeenCalledWith(
      "/v1/cars/by-key",
      expect.anything(),
    );
  });

  it("renders skeleton while loading farm detail", () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const wrapper = mount(FarmDetailView);

    expect(wrapper.find('[data-testid="farm-detail-skeleton"]').exists()).toBe(true);
  });

  it("allows editing farm details and saving changes", async () => {
    const farmResponse = {
      data: {
        data: {
          id: "farm-1",
          name: "Fazenda Teste",
          carKey: "SP-1234567-0000000000000000000000000000000000",
          cpfCnpj: "52998224725",
        },
      },
    };
    const analysesResponse = {
      data: {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      },
    };
    const geometryResponse = {
      data: {
        data: {
          featureKey: "SP-1234567-0000000000000000000000000000000000",
          geom: { type: "Polygon", coordinates: [] },
        },
      },
    };

    (http.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/v1/farms/")) return Promise.resolve(farmResponse);
      if (url === "/v1/analyses") return Promise.resolve(analysesResponse);
      if (url === "/v1/cars/by-key") return Promise.resolve(geometryResponse);
      return Promise.reject(new Error("Unexpected endpoint"));
    });

    (http.patch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        data: {
          id: "farm-1",
          name: "Fazenda Atualizada",
          carKey: "SP-1234567-0000000000000000000000000000000000",
          cpfCnpj: "52998224725",
        },
      },
    });

    const wrapper = mount(FarmDetailView, {
      global: {
        stubs: {
          AnalysisMap: {
            template: '<div data-testid="farm-map"></div>',
          },
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="farm-edit-toggle"]').exists()).toBe(true);

    await wrapper.find('[data-testid="farm-edit-toggle"]').trigger("click");
    const nameInput = wrapper.find('[data-testid="farm-edit-name"]');
    await nameInput.setValue("Fazenda Atualizada");

    await wrapper.find('[data-testid="farm-edit-save"]').trigger("click");
    await flushPromises();

    expect(http.patch).toHaveBeenCalledWith(
      "/v1/farms/farm-1",
      expect.objectContaining({ name: "Fazenda Atualizada" }),
    );
    expect(wrapper.text()).toContain("Fazenda Atualizada");
  });

  it("renders the farm geometry map after loading", async () => {
    const farmResponse = {
      data: {
        data: {
          id: "farm-1",
          name: "Fazenda Teste",
          carKey: "SP-1234567-0000000000000000000000000000000000",
          cpfCnpj: null,
        },
      },
    };
    const analysesResponse = {
      data: {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      },
    };
    const geometryResponse = {
      data: {
        data: {
          featureKey: "SP-1234567-0000000000000000000000000000000000",
          geom: { type: "Polygon", coordinates: [] },
        },
      },
    };

    (http.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/v1/farms/")) return Promise.resolve(farmResponse);
      if (url === "/v1/analyses") return Promise.resolve(analysesResponse);
      if (url === "/v1/cars/by-key") return Promise.resolve(geometryResponse);
      return Promise.reject(new Error("Unexpected endpoint"));
    });

    const wrapper = mount(FarmDetailView, {
      global: {
        stubs: {
          AnalysisMap: {
            template: '<div data-testid="farm-map"></div>',
          },
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="farm-map"]').exists()).toBe(true);
  });
});
