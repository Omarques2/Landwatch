import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import AnalysisPrintLayout from "@/components/analyses/AnalysisPrintLayout.vue";

vi.mock("@/components/maps/AnalysisVectorMap.vue", () => ({
  default: defineComponent({
    name: "AnalysisVectorMap",
    template: "<div data-test='analysis-vector-map'></div>",
  }),
}));

vi.mock("@/components/analyses/AnalysisWatermark.vue", () => ({
  default: defineComponent({
    name: "AnalysisWatermark",
    template: "<div data-test='analysis-watermark'></div>",
  }),
}));

vi.mock("@/components/analyses/AnalysisDatasetStatusLegend.vue", () => ({
  default: defineComponent({
    name: "AnalysisDatasetStatusLegend",
    template: "<div data-test='analysis-dataset-status-legend'></div>",
  }),
}));

describe("AnalysisPrintLayout", () => {
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
});
