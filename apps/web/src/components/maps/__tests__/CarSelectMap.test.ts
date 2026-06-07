import { describe, expect, it, beforeEach, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import CarSelectMap from "@/components/maps/CarSelectMap.vue";

type MockLayer = { id: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> };
type MockMapHandler = (event?: any) => void | Promise<void>;

type MockMapInstance = {
  addControl: ReturnType<typeof vi.fn>;
  addLayer: ReturnType<typeof vi.fn>;
  addSource: ReturnType<typeof vi.fn>;
  areTilesLoaded: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  getCanvas: ReturnType<typeof vi.fn>;
  getCenter: ReturnType<typeof vi.fn>;
  getBearing: ReturnType<typeof vi.fn>;
  getLayer: ReturnType<typeof vi.fn>;
  getPitch: ReturnType<typeof vi.fn>;
  getSource: ReturnType<typeof vi.fn>;
  getZoom: ReturnType<typeof vi.fn>;
  isStyleLoaded: ReturnType<typeof vi.fn>;
  jumpTo: ReturnType<typeof vi.fn>;
  loaded: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  querySourceFeatures: ReturnType<typeof vi.fn>;
  queryRenderedFeatures: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  removeLayer: ReturnType<typeof vi.fn>;
  removeSource: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  setFilter: ReturnType<typeof vi.fn>;
  handlers: Record<string, MockMapHandler[]>;
  layers: Map<string, MockLayer>;
  sources: Map<string, any>;
};

const { createdMaps, mapConstructor } = vi.hoisted(() => {
  const createdMaps: MockMapInstance[] = [];

  const createMapInstance = (): MockMapInstance => {
    const handlers: Record<string, MockMapHandler[]> = {};
    const layers = new Map<string, MockLayer>();
    const sources = new Map<string, any>();
    const mapInstance: MockMapInstance = {
      addControl: vi.fn(),
      addLayer: vi.fn((layer: MockLayer) => {
        layers.set(layer.id, layer);
      }),
      addSource: vi.fn((sourceId: string, source: any) => {
        sources.set(sourceId, {
          ...source,
          setData: vi.fn(),
          setTiles: vi.fn(),
        });
      }),
      areTilesLoaded: vi.fn(() => true),
      fitBounds: vi.fn(),
      getCanvas: vi.fn(() => ({ style: { setProperty: vi.fn() }, clientWidth: 900, clientHeight: 600 })),
      getCenter: vi.fn(() => ({ lng: -50, lat: -10 })),
      getBearing: vi.fn(() => 0),
      getLayer: vi.fn((layerId: string) => layers.get(layerId) ?? null),
      getPitch: vi.fn(() => 0),
      getSource: vi.fn((sourceId: string) => sources.get(sourceId) ?? null),
      getZoom: vi.fn(() => 8),
      isStyleLoaded: vi.fn(() => true),
      jumpTo: vi.fn(),
      loaded: vi.fn(() => true),
      off: vi.fn((event: string, handler?: MockMapHandler) => {
        if (!handler || !handlers[event]) return;
        handlers[event] = handlers[event].filter((entry) => entry !== handler);
      }),
      on: vi.fn((event: string, handler: MockMapHandler) => {
        handlers[event] ??= [];
        handlers[event].push(handler);
        if (event === "load") {
          void handler();
        }
      }),
      querySourceFeatures: vi.fn(() => []),
      queryRenderedFeatures: vi.fn(() => []),
      remove: vi.fn(),
      removeLayer: vi.fn((layerId: string) => {
        layers.delete(layerId);
      }),
      removeSource: vi.fn((sourceId: string) => {
        sources.delete(sourceId);
      }),
      resize: vi.fn(),
      setFilter: vi.fn(),
      handlers,
      layers,
      sources,
    };
    return mapInstance;
  };

  return {
    createdMaps,
    mapConstructor: vi.fn(() => {
      const instance = createMapInstance();
      createdMaps.push(instance);
      return instance;
    }),
  };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: mapConstructor,
    NavigationControl: vi.fn(),
    Marker: vi.fn(() => ({
      setLngLat: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    })),
    Popup: vi.fn(() => ({
      setDOMContent: vi.fn().mockReturnThis(),
      setLngLat: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      isOpen: vi.fn(() => false),
      remove: vi.fn(),
    })),
  },
}));

vi.mock("@/auth/auth", () => ({
  acquireApiToken: vi.fn().mockResolvedValue("token"),
}));

vi.mock("@/auth/local-bypass", () => ({
  isLocalAuthBypassEnabled: vi.fn(() => false),
  getDevBypassUserSub: vi.fn(() => "dev-sub"),
  getDevBypassUserEmail: vi.fn(() => "dev@localhost"),
}));

function buildActiveSearch() {
  return {
    searchId: "search-1",
    expiresAt: "2026-04-22T17:41:06.405Z",
    renderMode: "mvt" as const,
    stats: { totalFeatures: 108 },
    vectorSource: {
      tiles: ["http://localhost:3001/v1/cars/tiles/search-1/{z}/{x}/{y}.mvt"],
      bounds: [-48.56, -20.62, -48.47, -20.53] as [number, number, number, number],
      minzoom: 0,
      maxzoom: 22,
      sourceLayer: "cars_search",
      promoteId: "feature_key",
    },
    featureBounds: [-48.54, -20.61, -48.48, -20.54] as [number, number, number, number],
    searchCenter: { lat: -20.58, lng: -48.51 },
    searchRadiusMeters: 5000,
    analysisDate: "2026-04-22",
  };
}

function triggerMapEvent(mapInstance: MockMapInstance, event: string, payload?: any) {
  for (const handler of mapInstance.handlers[event] ?? []) {
    void handler(payload);
  }
}

describe("CarSelectMap", () => {
  beforeEach(() => {
    createdMaps.length = 0;
    mapConstructor.mockClear();
  });

  it("renders the empty state without creating a map before a search exists", () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: 0, lng: 0 },
        selectedCarKey: "",
      },
    });

    expect(wrapper.text()).toContain("Defina uma busca.");
  });

  it("initializes the map when a search appears after the initial mount", async () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: -10, lng: -50 },
        selectedCarKey: "",
      },
    });

    expect(mapConstructor).not.toHaveBeenCalled();

    await wrapper.setProps({
      activeSearch: buildActiveSearch(),
    });
    await flushPromises();

    expect(mapConstructor).toHaveBeenCalledTimes(1);
  });

  it("uses a color palette expression and sort keys for vector layers", async () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: -10, lng: -50 },
        selectedCarKey: "",
        activeSearch: buildActiveSearch(),
      },
    });

    await flushPromises();

    const mapInstance = createdMaps[0]!;
    const fillLayer = mapInstance.layers.get("cars-search-fill");
    const lineLayer = mapInstance.layers.get("cars-search-line");

    expect(fillLayer?.paint?.["fill-color"]).toEqual(expect.any(Array));
    expect(fillLayer?.layout?.["fill-sort-key"]).toEqual(["*", -1, ["coalesce", ["get", "area_ha"], 0]]);
    expect(lineLayer?.layout?.["line-sort-key"]).toEqual(["*", -1, ["coalesce", ["get", "area_ha"], 0]]);

    await wrapper.unmount();
  });

  it("clears the selection when a click does not hit any feature", async () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: -10, lng: -50 },
        selectedCarKey: "CAR-EXISTENTE",
        activeSearch: buildActiveSearch(),
      },
    });

    await flushPromises();

    const mapInstance = createdMaps[0]!;
    mapInstance.queryRenderedFeatures.mockReturnValueOnce([]);

    triggerMapEvent(mapInstance, "click", {
      point: { x: 120, y: 80 },
      lngLat: { lng: -48.51, lat: -20.58 },
    });

    expect(wrapper.emitted("update:selectedCarKey")?.at(-1)).toEqual([""]);
    expect(wrapper.find('[data-testid="overlap-car-selector"]').exists()).toBe(false);
  });

  it("selects a single rendered CAR directly", async () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: -10, lng: -50 },
        selectedCarKey: "",
        activeSearch: buildActiveSearch(),
      },
    });

    await flushPromises();

    const mapInstance = createdMaps[0]!;
    mapInstance.queryRenderedFeatures.mockReturnValueOnce([
      {
        properties: {
          feature_key: "CAR-UNICO",
          area_ha: 120.5,
        },
      },
    ]);

    triggerMapEvent(mapInstance, "click", {
      point: { x: 40, y: 55 },
      lngLat: { lng: -48.51, lat: -20.58 },
    });

    expect(wrapper.emitted("update:selectedCarKey")?.at(-1)).toEqual(["CAR-UNICO"]);
  });

  it("opens an overlap selector sorted from smaller to larger area", async () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: -10, lng: -50 },
        selectedCarKey: "",
        activeSearch: buildActiveSearch(),
      },
    });

    await flushPromises();

    const mapInstance = createdMaps[0]!;
    mapInstance.queryRenderedFeatures.mockReturnValueOnce([
      { properties: { feature_key: "CAR-GRANDE", area_ha: 300 } },
      { properties: { feature_key: "CAR-PEQUENO", area_ha: 25 } },
      { properties: { feature_key: "CAR-MEDIO", area_ha: 100 } },
      { properties: { feature_key: "CAR-PEQUENO", area_ha: 25 } },
    ]);

    triggerMapEvent(mapInstance, "click", {
      point: { x: 90, y: 120 },
      lngLat: { lng: -48.51, lat: -20.58 },
    });
    await flushPromises();

    const selector = wrapper.get('[data-testid="overlap-car-selector"]');
    expect(selector.text()).toContain("CARs sobrepostos");

    const optionLabels = wrapper
      .findAll('[data-testid="overlap-car-option-key"]')
      .map((node) => node.text());
    expect(optionLabels).toEqual(["CAR-PEQUENO", "CAR-MEDIO", "CAR-GRANDE"]);
  });

  it("selects an overlap candidate and closes the selector", async () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: -10, lng: -50 },
        selectedCarKey: "",
        activeSearch: buildActiveSearch(),
      },
    });

    await flushPromises();

    const mapInstance = createdMaps[0]!;
    mapInstance.queryRenderedFeatures.mockReturnValueOnce([
      { properties: { feature_key: "CAR-GRANDE", area_ha: 300 } },
      { properties: { feature_key: "CAR-PEQUENO", area_ha: 25 } },
    ]);

    triggerMapEvent(mapInstance, "click", {
      point: { x: 90, y: 120 },
      lngLat: { lng: -48.51, lat: -20.58 },
    });
    await flushPromises();

    await wrapper.get('[data-testid="overlap-car-option-CAR-PEQUENO"]').trigger("click");

    expect(wrapper.emitted("update:selectedCarKey")?.at(-1)).toEqual(["CAR-PEQUENO"]);
    expect(wrapper.find('[data-testid="overlap-car-selector"]').exists()).toBe(false);
  });

  it("closes the overlap selector when the search source changes", async () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: -10, lng: -50 },
        selectedCarKey: "",
        activeSearch: buildActiveSearch(),
      },
    });

    await flushPromises();

    const mapInstance = createdMaps[0]!;
    mapInstance.queryRenderedFeatures.mockReturnValueOnce([
      { properties: { feature_key: "CAR-GRANDE", area_ha: 300 } },
      { properties: { feature_key: "CAR-PEQUENO", area_ha: 25 } },
    ]);

    triggerMapEvent(mapInstance, "click", {
      point: { x: 90, y: 120 },
      lngLat: { lng: -48.51, lat: -20.58 },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="overlap-car-selector"]').exists()).toBe(true);

    await wrapper.setProps({
      activeSearch: {
        ...buildActiveSearch(),
        searchId: "search-2",
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="overlap-car-selector"]').exists()).toBe(false);
  });

  it("orders fallback overlap candidates using client-side computed area", async () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: -10, lng: -50 },
        selectedCarKey: "",
        fallbackFeatures: [
          {
            feature_key: "CAR-GRANDE",
            geom: {
              type: "Polygon",
              coordinates: [[
                [-50, -10],
                [-50, -10.03],
                [-49.96, -10.03],
                [-49.96, -10],
                [-50, -10],
              ]],
            },
          },
          {
            feature_key: "CAR-PEQUENO",
            geom: {
              type: "Polygon",
              coordinates: [[
                [-50, -10],
                [-50, -10.01],
                [-49.99, -10.01],
                [-49.99, -10],
                [-50, -10],
              ]],
            },
          },
        ],
      },
    });

    await flushPromises();

    const mapInstance = createdMaps[0]!;
    mapInstance.queryRenderedFeatures.mockReturnValueOnce([
      { properties: { feature_key: "CAR-GRANDE" } },
      { properties: { feature_key: "CAR-PEQUENO" } },
    ]);

    triggerMapEvent(mapInstance, "click", {
      point: { x: 90, y: 120 },
      lngLat: { lng: -50, lat: -10 },
    });
    await flushPromises();

    const optionLabels = wrapper
      .findAll('[data-testid="overlap-car-option-key"]')
      .map((node) => node.text());
    expect(optionLabels).toEqual(["CAR-PEQUENO", "CAR-GRANDE"]);
  });

  it("filters base layers to the selected CAR and refits bounds when hideUnselectedCars is enabled", async () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: -10, lng: -50 },
        selectedCarKey: "",
        hideUnselectedCars: false,
        activeSearch: buildActiveSearch(),
      },
    });

    await flushPromises();

    const mapInstance = createdMaps[0]!;
    mapInstance.querySourceFeatures.mockReturnValue([
      {
        properties: { feature_key: "CAR-ALVO", area_ha: 10 },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-48.55, -20.60],
            [-48.55, -20.58],
            [-48.50, -20.58],
            [-48.50, -20.60],
            [-48.55, -20.60],
          ]],
        },
      },
    ]);

    await wrapper.setProps({
      selectedCarKey: "CAR-ALVO",
      hideUnselectedCars: true,
    });
    await flushPromises();

    expect(mapInstance.setFilter).toHaveBeenCalledWith(
      "cars-search-fill",
      ["==", ["get", "feature_key"], "CAR-ALVO"],
    );
    expect(mapInstance.setFilter).toHaveBeenCalledWith(
      "cars-search-line",
      ["==", ["get", "feature_key"], "CAR-ALVO"],
    );
    expect(mapInstance.fitBounds).toHaveBeenLastCalledWith(
      [
        [-48.55, -20.6],
        [-48.5, -20.58],
      ],
      expect.objectContaining({ duration: 0 }),
    );
  });

  it("restores all CARs when hideUnselectedCars is disabled", async () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: -10, lng: -50 },
        selectedCarKey: "CAR-ALVO",
        hideUnselectedCars: true,
        activeSearch: buildActiveSearch(),
      },
    });

    await flushPromises();

    const mapInstance = createdMaps[0]!;
    await wrapper.setProps({ hideUnselectedCars: false });
    await flushPromises();

    expect(mapInstance.setFilter).toHaveBeenCalledWith(
      "cars-search-fill",
      ["has", "feature_key"],
    );
    expect(mapInstance.setFilter).toHaveBeenCalledWith(
      "cars-search-line",
      ["has", "feature_key"],
    );
  });

  it("shows the disabled banner when MV is refreshing", () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: 0, lng: 0 },
        selectedCarKey: "",
        disabled: true,
      },
    });

    expect(wrapper.text()).toContain("Base geoespacial em atualização");
  });
});
