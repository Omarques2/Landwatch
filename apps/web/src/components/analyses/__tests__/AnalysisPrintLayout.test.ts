import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import AnalysisPrintLayout from "@/components/analyses/AnalysisPrintLayout.vue";

const analysisVectorMapMethods = vi.hoisted(() => ({
  prepareForPrint: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  capturePrintImage: vi.fn<() => Promise<string>>(() => Promise.resolve("data:image/jpeg;base64,map")),
  resetAfterPrint: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/api/http", () => ({
  resolveApiUrl: (path: string) => `https://api.example.com${path}`,
}));

vi.mock("@/components/maps/AnalysisVectorMap.vue", () => ({
  default: defineComponent({
    name: "AnalysisVectorMap",
    setup(_, { expose }) {
      expose(analysisVectorMapMethods);
      return () => h("div", { "data-test": "analysis-vector-map" });
    },
  }),
}));

vi.mock("@/components/analyses/AnalysisWatermark.vue", () => ({
  default: defineComponent({
    name: "AnalysisWatermark",
    props: {
      zIndex: Number,
    },
    template: "<div data-test='analysis-watermark' :data-z-index='zIndex'></div>",
  }),
}));

vi.mock("@/components/analyses/AnalysisDatasetStatusLegend.vue", () => ({
  default: defineComponent({
    name: "AnalysisDatasetStatusLegend",
    template: "<div data-test='analysis-dataset-status-legend'></div>",
  }),
}));

describe("AnalysisPrintLayout", () => {
  beforeEach(() => {
    analysisVectorMapMethods.prepareForPrint.mockClear();
    analysisVectorMapMethods.capturePrintImage.mockClear();
    analysisVectorMapMethods.resetAfterPrint.mockClear();
    analysisVectorMapMethods.refresh.mockClear();
  });

  it("renders farm name in title case and keeps SICAR badge uppercase", () => {
    const wrapper = mount(AnalysisPrintLayout, {
      props: {
        analysis: {
          id: "analysis-1",
          carKey: "MT-123",
          farmName: "fazenda de teste desmatamento",
          analysisDate: "2026-02-12",
          status: "completed",
          analysisKind: "STANDARD",
          sicarStatus: "AT",
          datasetGroups: [],
          results: [],
        },
        vectorMap: null,
        mapLoading: false,
        isLoading: false,
        analysisPublicUrl: "",
        logoSrc: "/logo.png",
      },
    });

    expect(wrapper.text()).toContain("Estabelecimento Fazenda De Teste Desmatamento");
    expect(wrapper.text()).toContain("SICAR MT-123 ATIVO");
    expect(wrapper.text()).not.toContain("Sicar Mt-123 Ativo");
  });

  it("renders only geojson link when analysis has no attachments", () => {
    const wrapper = mount(AnalysisPrintLayout, {
      props: {
        analysis: {
          id: "analysis-1",
          carKey: "MT-123",
          farmName: "fazenda de teste",
          analysisDate: "2026-02-12",
          status: "completed",
          analysisKind: "STANDARD",
          datasetGroups: [],
          results: [],
        },
        vectorMap: null,
        mapLoading: false,
        isLoading: false,
        analysisPublicUrl: "https://frontend.example.com/analyses/analysis-1/public",
        logoSrc: "/logo.png",
        hasAttachments: false,
      },
    });

    const links = wrapper.findAll("a.print-action-link");
    expect(links).toHaveLength(1);
    expect(links[0]!.text()).toContain("GeoJSON");
    expect(links[0]!.attributes("href")).toBe("https://api.example.com/v1/public/analyses/analysis-1/geojson/download");
    expect(wrapper.text()).not.toContain("Anexos");
  });

  it("renders geojson and attachments links with API base URL when attachments exist", () => {
    const wrapper = mount(AnalysisPrintLayout, {
      props: {
        analysis: {
          id: "analysis-1",
          carKey: "MT-123",
          farmName: "fazenda de teste",
          analysisDate: "2026-02-12",
          status: "completed",
          analysisKind: "STANDARD",
          datasetGroups: [],
          results: [],
        },
        vectorMap: null,
        mapLoading: false,
        isLoading: false,
        analysisPublicUrl: "https://frontend.example.com/analyses/analysis-1/public",
        logoSrc: "/logo.png",
        hasAttachments: true,
      },
    });

    const links = wrapper.findAll("a.print-action-link");
    expect(links).toHaveLength(2);
    expect(links[0]!.attributes("href")).toBe("https://api.example.com/v1/public/analyses/analysis-1/geojson/download");
    expect(links[1]!.attributes("href")).toBe("https://api.example.com/v1/public/analyses/analysis-1/attachments/zip");
  });

  it("keeps the watermark visible while shielding the map frame from it", () => {
    const wrapper = mount(AnalysisPrintLayout, {
      props: {
        analysis: {
          id: "analysis-1",
          carKey: "MT-123",
          farmName: "fazenda de teste",
          analysisDate: "2026-02-12",
          status: "completed",
          analysisKind: "STANDARD",
          datasetGroups: [],
          results: [],
        },
        vectorMap: null,
        mapLoading: false,
        isLoading: false,
        analysisPublicUrl: "",
        logoSrc: "/logo.png",
      },
    });

    const firstPage = wrapper.find(".print-page-1");
    expect(firstPage.find("[data-test='analysis-watermark']").attributes("data-z-index")).toBe("30");
    expect(firstPage.find(".print-page-content").exists()).toBe(true);
    expect(firstPage.find(".print-map-frame").classes()).toContain("print-map-frame-above-watermark");
  });

  it("does not prepare the map twice before freezing it for print", async () => {
    const wrapper = mount(AnalysisPrintLayout, {
      props: {
        analysis: {
          id: "analysis-1",
          carKey: "MT-123",
          farmName: "fazenda de teste",
          analysisDate: "2026-02-12",
          status: "completed",
          analysisKind: "STANDARD",
          datasetGroups: [],
          results: [],
        },
        vectorMap: {
          renderMode: "mvt",
          vectorSource: {
            tiles: ["pmtiles://test.pmtiles/{z}/{x}/{y}"],
            sourceLayer: "analysis",
            bounds: [-50, -16, -49, -15],
            carBounds: [-50, -16, -49, -15],
            minzoom: 0,
            maxzoom: 22,
            promoteId: "id",
          },
          legendItems: [],
        },
        mapLoading: false,
        isLoading: false,
        analysisPublicUrl: "https://frontend.example.com/analyses/analysis-1/public",
        logoSrc: "/logo.png",
      },
    });

    await wrapper.vm.prepareForPrint();

    expect(analysisVectorMapMethods.prepareForPrint).toHaveBeenCalledTimes(1);
    expect(analysisVectorMapMethods.capturePrintImage).toHaveBeenCalledWith({
      type: "image/jpeg",
      quality: 0.72,
      skipPrepare: true,
    });
  });
});
