import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MapHandler = () => void;

const { createdMaps, mapConstructor } = vi.hoisted(() => {
  const createdMaps: Array<{
    sources: Map<string, unknown>;
    layers: Map<string, unknown>;
    settleStyle: () => void;
  }> = [];

  const mapConstructor = vi.fn(() => {
    const sources = new Map<string, unknown>();
    const layers = new Map<string, unknown>();
    const handlers = new Map<string, MapHandler[]>();
    const onceHandlers = new Map<string, MapHandler[]>();
    let styleLoaded = true;

    const map = {
      sources,
      layers,
      settleStyle() {
        styleLoaded = true;
        const pending = onceHandlers.get("idle") ?? [];
        onceHandlers.delete("idle");
        for (const handler of pending) handler();
      },
      addControl: vi.fn(),
      addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
      addSource: vi.fn((id: string, source: unknown) => {
        sources.set(id, {
          ...(source as Record<string, unknown>),
          setData: vi.fn(),
          setTiles: vi.fn(),
        });
        if (id === "analysis-vector") styleLoaded = false;
      }),
      fitBounds: vi.fn(),
      getCanvas: vi.fn(() => ({ style: {} })),
      getLayer: vi.fn((id: string) => layers.get(id) ?? null),
      getSource: vi.fn((id: string) => sources.get(id) ?? null),
      isStyleLoaded: vi.fn(() => styleLoaded),
      moveLayer: vi.fn(),
      on: vi.fn((event: string, handler: MapHandler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        if (event === "load") handler();
      }),
      once: vi.fn((event: string, handler: MapHandler) => {
        onceHandlers.set(event, [...(onceHandlers.get(event) ?? []), handler]);
      }),
      queryRenderedFeatures: vi.fn(() => []),
      remove: vi.fn(),
      removeLayer: vi.fn((id: string) => layers.delete(id)),
      removeSource: vi.fn((id: string) => sources.delete(id)),
      resize: vi.fn(),
      setFilter: vi.fn(),
      setLayoutProperty: vi.fn(),
    };
    createdMaps.push(map);
    return map;
  });

  return { createdMaps, mapConstructor };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: mapConstructor,
    NavigationControl: vi.fn(),
    Popup: vi.fn(),
  },
}));

vi.mock("@/composables/useMapAutoResize", () => ({
  useMapAutoResize: vi.fn(),
}));

vi.mock("@/composables/useCoarsePointer", () => ({
  useCoarsePointer: () => ({ isCoarsePointer: { value: false } }),
}));

vi.mock("@/auth/local-bypass", () => ({
  isLocalAuthBypassEnabled: () => false,
  getDevBypassUserSub: () => "dev-user",
  getDevBypassUserEmail: () => "dev@example.com",
  getDevBypassOrgId: () => "dev-org",
}));

import AnalysisVectorMap from "@/components/maps/AnalysisVectorMap.vue";

describe("AnalysisVectorMap subject geometry", () => {
  beforeEach(() => {
    createdMaps.length = 0;
    mapConstructor.mockClear();
  });

  it("adds the uploaded geometry after the vector source finishes changing the style", async () => {
    const wrapper = mount(AnalysisVectorMap, {
      props: {
        authMode: "public",
        legendItems: [],
        vectorSource: {
          tiles: ["/v1/analyses/analysis-1/tiles/{z}/{x}/{y}.mvt"],
          bounds: [-49.2, -22, -49.1, -21.9],
          minzoom: 0,
          maxzoom: 22,
          sourceLayer: "analysis_features",
          promoteId: "analysis_result_id",
        },
        subjectGeometry: {
          type: "MultiPolygon",
          coordinates: [[[
            [-49.2, -22],
            [-49.1, -22],
            [-49.1, -21.9],
            [-49.2, -21.9],
            [-49.2, -22],
          ]]],
        },
      },
    });
    await flushPromises();

    const map = createdMaps[0]!;
    expect(map.sources.has("analysis-subject-geometry-source")).toBe(false);

    map.settleStyle();

    expect(map.sources.has("analysis-subject-geometry-source")).toBe(true);
    expect(map.layers.get("analysis-subject-geometry-line")).toMatchObject({
      paint: {
        "line-color": "#ff0202",
        "line-width": 2,
        "line-opacity": 1,
        "line-dasharray": [1.3, 1.3],
      },
    });
    await wrapper.unmount();
  });
});
