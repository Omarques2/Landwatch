import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import NewAnalysisView from "@/views/NewAnalysisView.vue";
import { http } from "@/api/http";
import { mvBusy } from "@/state/landwatch-status";

let routePath = "/analyses/new";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: routePath, query: {} }),
}));

vi.mock("@/state/landwatch-status", () => ({
  mvBusy: ref(false),
}));

vi.mock("@/components/maps/CarSelectMap.vue", () => ({
  default: {
    name: "CarSelectMapStub",
    props: ["selectedCarKey"],
    template: '<div data-testid="car-select-map"></div>',
  },
}));

describe("NewAnalysisView", () => {
  beforeEach(() => {
    routePath = "/analyses/new";
    mvBusy.value = false;
    vi.clearAllMocks();
  });

  it("preenche coordenadas com GPS na busca de CAR", async () => {
    routePath = "/analyses/search";
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: -10.1234567,
          longitude: -50.7654321,
          accuracy: 1,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    });

    Object.defineProperty(globalThis.navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    const wrapper = mount(NewAnalysisView);
    const button = wrapper.find('[data-testid="gps-button"]');
    await button.trigger("click");
    await flushPromises();

    const latInput = wrapper.find('[data-testid="gps-lat"]').element as HTMLInputElement;
    const lngInput = wrapper.find('[data-testid="gps-lng"]').element as HTMLInputElement;
    expect(latInput.value).toBe("-10.123457");
    expect(lngInput.value).toBe("-50.765432");
  });

  it("cria uma busca vetorial com raio de 5 km por padrão", async () => {
    routePath = "/analyses/search";
    (http.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        data: {
          searchId: "search-1",
          expiresAt: "2026-04-22T12:30:00.000Z",
          renderMode: "mvt",
          stats: { totalFeatures: 2 },
          vectorSource: {
            tiles: ["/v1/cars/tiles/search-1/{z}/{x}/{y}.mvt"],
            bounds: [-50.1, -10.1, -49.9, -9.9],
            minzoom: 0,
            maxzoom: 22,
            sourceLayer: "cars_search",
            promoteId: "feature_key",
          },
          searchCenter: { lat: -10, lng: -50 },
          searchRadiusMeters: 5000,
        },
      },
    });

    const wrapper = mount(NewAnalysisView);

    await wrapper.find('[data-testid="gps-lat"]').setValue("-10");
    await wrapper.find('[data-testid="gps-lng"]').setValue("-50");
    await wrapper.findAll("button").find((button) => button.text().includes("Buscar CARs"))?.trigger("click");
    await flushPromises();

    expect(http.post).toHaveBeenCalledWith(
      "/v1/cars/map-searches",
      expect.objectContaining({
        lat: -10,
        lng: -50,
        radiusMeters: 5000,
      }),
    );
  });

  it("shows warning and disables submit when MV is refreshing", async () => {
    mvBusy.value = true;
    const wrapper = mount(NewAnalysisView);

    const submitButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Gerar análise"));

    expect(submitButton?.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Base geoespacial em atualização");
  });

  it("blocks submit on invalid CPF", async () => {
    const wrapper = mount(NewAnalysisView);

    await wrapper.find("#analysis-car").setValue("SP-1234567-0000000000000000000000000000000000");
    await wrapper.find("#analysis-doc").setValue("111.111.111-11");
    await wrapper.find("#analysis-doc").trigger("keydown.enter");

    await wrapper.find("button").trigger("click");

    expect(wrapper.text()).toContain("CPF/CNPJ inválido");
    expect(http.post).not.toHaveBeenCalledWith("/v1/analyses", expect.anything());
  });

  it("preserves full CAR key when pasting dotted value", async () => {
    (http.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { data: { analysisId: "analysis-1" } },
    });

    const rawCar = "SP-3534005-9F26.1A42.DEE3.433D.BFEA.5D81.891B.6121";
    const normalizedCar = "SP-3534005-9F261A42DEE3433DBFEA5D81891B6121";

    const wrapper = mount(NewAnalysisView);
    const carInput = wrapper.find("#analysis-car");
    expect(Number(carInput.attributes("maxlength"))).toBeGreaterThanOrEqual(rawCar.length);

    await wrapper.find("#analysis-name").setValue("Fazenda SP");
    await carInput.setValue(rawCar);
    await wrapper.find('[data-testid="analysis-submit"]').trigger("click");
    await flushPromises();

    expect(http.post).toHaveBeenCalledWith(
      "/v1/analyses",
      expect.objectContaining({ carKey: normalizedCar }),
    );
  });

  it("auto-fills farm data on blur when carKey is complete", async () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        data: {
          id: "farm-1",
          name: "Fazenda Teste",
          carKey: "SP-1234567-0000000000000000000000000000000000",
          documents: [
            { id: "doc-1", docType: "CPF", docNormalized: "52998224725" },
          ],
        },
      },
    });

    const wrapper = mount(NewAnalysisView);

    await wrapper
      .find("#analysis-car")
      .setValue("SP-1234567-0000000000000000000000000000000000");
    await wrapper.find("#analysis-car").trigger("blur");

    await flushPromises();

    const nameInput = wrapper.find("#analysis-name").element as HTMLInputElement;
    expect(nameInput.value).toBe("Fazenda Teste");
  });

  it("auto-fills farm data on Enter when CPF/CNPJ is valid", async () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        data: [
          {
            id: "farm-2",
            name: "Fazenda CPF",
            carKey: "SP-7654321-1111111111111111111111111111111111",
            documents: [
              { id: "doc-1", docType: "CPF", docNormalized: "52998224725" },
            ],
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1 },
      },
    });

    const wrapper = mount(NewAnalysisView);

    await wrapper.find("#analysis-doc").setValue("529.982.247-25");
    await wrapper.find("#analysis-doc").trigger("keydown.enter");

    await flushPromises();

    const nameInput = wrapper.find("#analysis-name").element as HTMLInputElement;
    expect(nameInput.value).toBe("Fazenda CPF");
  });

  it("submits selected documents in the payload", async () => {
    (http.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { data: { analysisId: "analysis-1" } },
    });

    const wrapper = mount(NewAnalysisView);

    await wrapper
      .find("#analysis-car")
      .setValue("SP-1234567-0000000000000000000000000000000000");
    await wrapper.find("#analysis-doc").setValue("529.982.247-25");
    await wrapper.find("#analysis-doc").trigger("keydown.enter");
    await wrapper.find("#analysis-doc").setValue("04.252.011/0001-10");
    await wrapper.find("#analysis-doc").trigger("keydown.enter");

    await wrapper.find('[data-testid="analysis-submit"]').trigger("click");
    await flushPromises();

    expect(http.post).toHaveBeenCalledWith(
      "/v1/analyses",
      expect.objectContaining({
        documents: ["52998224725", "04252011000110"],
      }),
    );
  });
});
