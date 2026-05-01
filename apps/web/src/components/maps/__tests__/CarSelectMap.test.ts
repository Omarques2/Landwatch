import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import CarSelectMap from "@/components/maps/CarSelectMap.vue";

const { mapConstructor, mapInstance } = vi.hoisted(() => {
  const mapInstance = {
    addControl: vi.fn(),
    addLayer: vi.fn(),
    addSource: vi.fn(),
    areTilesLoaded: vi.fn(() => true),
    fitBounds: vi.fn(),
    getCanvas: vi.fn(() => ({ style: { setProperty: vi.fn() } })),
    getCenter: vi.fn(() => ({ lng: -50, lat: -10 })),
    getBearing: vi.fn(() => 0),
    getLayer: vi.fn(() => null),
    getPitch: vi.fn(() => 0),
    getSource: vi.fn(() => null),
    getZoom: vi.fn(() => 8),
    isStyleLoaded: vi.fn(() => true),
    loaded: vi.fn(() => true),
    off: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      if (event === "load") handler();
    }),
    queryRenderedFeatures: vi.fn(() => []),
    remove: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    resize: vi.fn(),
    setFilter: vi.fn(),
  };

  return {
    mapInstance,
    mapConstructor: vi.fn(() => mapInstance),
  };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: mapConstructor,
    NavigationControl: vi.fn(),
    Marker: vi.fn(() => ({ setLngLat: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
    Popup: vi.fn(() => ({ setDOMContent: vi.fn().mockReturnThis(), setLngLat: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(), isOpen: vi.fn(() => false), remove: vi.fn() })),
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

describe("CarSelectMap", () => {
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
      activeSearch: {
        searchId: "search-1",
        expiresAt: "2026-04-22T17:41:06.405Z",
        renderMode: "mvt",
        stats: { totalFeatures: 108 },
        vectorSource: {
          tiles: ["http://localhost:3001/v1/cars/tiles/search-1/{z}/{x}/{y}.mvt"],
          bounds: [-48.56, -20.62, -48.47, -20.53],
          minzoom: 0,
          maxzoom: 22,
          sourceLayer: "cars_search",
          promoteId: "feature_key",
        },
        searchCenter: { lat: -20.58, lng: -48.51 },
        searchRadiusMeters: 5000,
        analysisDate: "2026-04-22",
      },
    });
    await flushPromises();

    expect(mapConstructor).toHaveBeenCalledTimes(1);
  });

  it("uses a color palette expression for vector fills", async () => {
    const wrapper = mount(CarSelectMap, {
      props: {
        center: { lat: -10, lng: -50 },
        selectedCarKey: "",
        activeSearch: {
          searchId: "search-1",
          expiresAt: "2026-04-22T17:41:06.405Z",
          renderMode: "mvt",
          stats: { totalFeatures: 108 },
          vectorSource: {
            tiles: ["http://localhost:3001/v1/cars/tiles/search-1/{z}/{x}/{y}.mvt"],
            bounds: [-48.56, -20.62, -48.47, -20.53],
            minzoom: 0,
            maxzoom: 22,
            sourceLayer: "cars_search",
            promoteId: "feature_key",
          },
          featureBounds: [-48.54, -20.61, -48.48, -20.54],
          searchCenter: { lat: -20.58, lng: -48.51 },
          searchRadiusMeters: 5000,
          analysisDate: "2026-04-22",
        },
      },
    });

    await flushPromises();

    const fillLayerCall = mapInstance.addLayer.mock.calls.find(
      ([layer]) => layer?.id === "cars-search-fill",
    );
    expect(fillLayerCall).toBeTruthy();
    expect(fillLayerCall?.[0]?.paint?.["fill-color"]).toEqual(expect.any(Array));

    await wrapper.unmount();
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
