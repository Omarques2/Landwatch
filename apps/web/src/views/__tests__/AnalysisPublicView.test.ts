import { describe, expect, it, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { http } from "@/api/http";

vi.mock("@/components/maps/AnalysisVectorMap.vue", () => ({
  default: defineComponent({
    name: "AnalysisVectorMap",
    props: {
      activeLegendCode: {
        type: String,
        default: null,
      },
    },
    template:
      "<div data-test='analysis-vector-map'>active={{ activeLegendCode || 'none' }}</div>",
  }),
}));

vi.mock("@/components/analyses/AnalysisPrintLayout.vue", () => ({
  default: defineComponent({
    name: "AnalysisPrintLayout",
    template: "<div data-test='analysis-print-layout'></div>",
  }),
}));

vi.mock("@/components/analyses/AnalysisWatermark.vue", () => ({
  default: defineComponent({
    name: "AnalysisWatermark",
    template: "<div data-test='analysis-watermark'></div>",
  }),
}));

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({
    params: { id: "analysis-public-1" },
    query: {},
  }),
}));

import AnalysisPublicView from "@/views/AnalysisPublicView.vue";
import { clearAnalysisMapCache } from "@/features/analyses/analysis-map-cache";

function publicVectorMapPayload(
  legendItems: Array<Record<string, unknown>> = [],
  withSource = true,
) {
  return {
    renderMode: "mvt",
    vectorSource: withSource
      ? {
          tiles: ["/v1/public/analyses/analysis-public-1/tiles/{z}/{x}/{y}.mvt"],
          bounds: [-50, -15, -49, -14],
          minzoom: 0,
          maxzoom: 14,
          sourceLayer: "analysis_features",
          promoteId: "analysis_result_id",
        }
      : null,
    legendItems,
  };
}

describe("AnalysisPublicView", () => {
  beforeEach(() => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockReset();
    window.sessionStorage.clear();
    clearAnalysisMapCache();
  });

  it("renders public geojson and attachment actions", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/public/analyses/analysis-public-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-public-1",
              carKey: "MT-123",
              farmName: "Fazenda pública",
              analysisDate: "2026-02-12",
              status: "completed",
              analysisKind: "STANDARD",
              biomas: ["Cerrado"],
              intersectionCount: 1,
              datasetGroups: [],
              results: [],
            },
          },
        });
      }
      if (url === "/v1/public/analyses/analysis-public-1/vector-map") {
        return Promise.resolve({
          data: { data: publicVectorMapPayload([], false) },
        });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const wrapper = mount(AnalysisPublicView, {
      global: {
        stubs: {
          AnalysisVectorMap: { template: "<div data-test='analysis-map'></div>" },
          AnalysisPrintLayout: { template: "<div />" },
          AnalysisWatermark: { template: "<div />" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Baixar GeoJSON");
    expect(wrapper.text()).toContain("Ver anexos");
    expect(wrapper.text()).toContain("Baixar ZIP anexos");

    const actionButtons = wrapper
      .findAll("button")
      .filter((item) =>
        ["Baixar GeoJSON", "Ver anexos", "Baixar ZIP anexos"].includes(item.text().trim()),
      );
    expect(actionButtons).toHaveLength(3);
    for (const button of actionButtons) {
      expect(button.classes()).toContain("transition-colors");
      expect(button.classes()).toContain("hover:bg-muted");
      expect(button.classes()).toContain("active:scale-[0.98]");
    }
  });

  it("downloads public geojson and attachments using only the analysis id", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    const geojsonPayload = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "PRODES:1",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: { datasetCode: "PRODES_A" },
        },
      ],
    };
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/public/analyses/analysis-public-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-public-1",
              carKey: "MT-123",
              farmName: "Fazenda pública",
              analysisDate: "2026-02-12",
              status: "completed",
              analysisKind: "STANDARD",
              biomas: ["Cerrado"],
              intersectionCount: 1,
              datasetGroups: [],
              results: [],
            },
          },
        });
      }
      if (url === "/v1/public/analyses/analysis-public-1/vector-map") {
        return Promise.resolve({
          data: { data: publicVectorMapPayload([], false) },
        });
      }
      if (url === "/v1/public/analyses/analysis-public-1/geojson") {
        return Promise.resolve({ data: { data: geojsonPayload } });
      }
      if (url === "/v1/public/analyses/analysis-public-1/attachments") {
        return Promise.resolve({
          data: {
            data: [
              {
                id: "att-1",
                categoryCode: "JUSTIFICATIVA_TECNICA",
                categoryName: "Justificativa técnica",
                isJustification: true,
                originalFilename: "arquivo-publico.pdf",
                contentType: "application/pdf",
                sizeBytes: "120",
              },
            ],
          },
        });
      }
      if (url === "/v1/public/analyses/analysis-public-1/attachments/att-1/download") {
        return Promise.resolve({ data: new Blob(["pdf"], { type: "application/pdf" }) });
      }
      if (url === "/v1/public/analyses/analysis-public-1/attachments/zip") {
        return Promise.resolve({ data: new Blob(["zip"], { type: "application/zip" }) });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    let exportedBlob: Blob | null = null;
    if (!("createObjectURL" in URL)) {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        writable: true,
        value: vi.fn(),
      });
    }
    if (!("revokeObjectURL" in URL)) {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        writable: true,
        value: vi.fn(),
      });
    }
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob: Blob | MediaSource) => {
        exportedBlob = blob as Blob;
        return "blob:mock";
      });
    const revokeObjectUrlSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const wrapper = mount(AnalysisPublicView, {
      global: {
        stubs: {
          AnalysisVectorMap: { template: "<div data-test='analysis-map'></div>" },
          AnalysisPrintLayout: { template: "<div />" },
          AnalysisWatermark: { template: "<div />" },
        },
      },
    });
    await flushPromises();

    const geojsonButton = wrapper
      .findAll("button")
      .find((item) => item.text().includes("Baixar GeoJSON"));
    expect(geojsonButton).toBeTruthy();
    await geojsonButton!.trigger("click");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith(
      "/v1/public/analyses/analysis-public-1/geojson",
      {
        headers: { "X-Skip-Auth": "1" },
      },
    );

    const attachmentsButton = wrapper
      .findAll("button")
      .find((item) => item.text().includes("Ver anexos"));
    expect(attachmentsButton).toBeTruthy();
    expect(attachmentsButton!.attributes("disabled")).toBeUndefined();
    await attachmentsButton!.trigger("click");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith(
      "/v1/public/analyses/analysis-public-1/attachments",
      expect.objectContaining({
        headers: { "X-Skip-Auth": "1", "X-Skip-Org": "1" },
      }),
    );
    expect(wrapper.text()).toContain("arquivo-publico.pdf");

    const attachmentDownloadButton = wrapper
      .findAll("button")
      .find((item) => item.text().includes("Baixar") && wrapper.text().includes("arquivo-publico.pdf"));
    expect(attachmentDownloadButton).toBeTruthy();
    await attachmentDownloadButton!.trigger("click");
    await flushPromises();

    const zipButton = wrapper
      .findAll("button")
      .find((item) => item.text().includes("Baixar ZIP anexos"));
    expect(zipButton).toBeTruthy();
    await zipButton!.trigger("click");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith(
      "/v1/public/analyses/analysis-public-1/attachments/zip",
      expect.objectContaining({
        headers: { "X-Skip-Auth": "1", "X-Skip-Org": "1" },
        responseType: "blob",
      }),
    );
    expect(clickSpy).toHaveBeenCalled();
    expect(exportedBlob).not.toBeNull();
    expect(revokeObjectUrlSpy).toHaveBeenCalled();

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it("toggles the public legend filter state", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/public/analyses/analysis-public-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-public-1",
              carKey: "MT-123",
              farmName: "Fazenda pública",
              analysisDate: "2026-02-12",
              status: "completed",
              analysisKind: "STANDARD",
              biomas: ["Cerrado"],
              intersectionCount: 2,
              datasetGroups: [],
              results: [],
            },
          },
        });
      }
      if (url === "/v1/public/analyses/analysis-public-1/vector-map") {
        return Promise.resolve({
          data: {
            data: publicVectorMapPayload([
              {
                code: "PRODES_A",
                kind: "dataset",
                label: "PRODES A",
                datasetCode: "PRODES_A",
                featureIds: ["2"],
              },
              {
                code: "PRODES_B",
                kind: "dataset",
                label: "PRODES B",
                datasetCode: "PRODES_B",
                featureIds: ["3"],
              },
            ]),
          },
        });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const analysisMapStub = defineComponent({
      props: {
        activeLegendCode: {
          type: String,
          default: null,
        },
      },
      template: "<div data-test='analysis-map'></div>",
    });

    const wrapper = mount(AnalysisPublicView, {
      global: {
        stubs: {
          AnalysisVectorMap: analysisMapStub,
          AnalysisPrintLayout: { template: "<div />" },
          AnalysisWatermark: { template: "<div />" },
        },
      },
    });
    await flushPromises();

    const legendButtons = wrapper
      .findAll(".analysis-screen-legend button")
      .filter((item) => item.text().trim().length > 0);
    expect(legendButtons.length).toBeGreaterThanOrEqual(2);

    await legendButtons[0]!.trigger("click");
    expect(legendButtons[0]!.classes()).toContain("bg-accent");
    expect(legendButtons[1]!.classes()).toContain("text-muted-foreground");
    expect(wrapper.findComponent(analysisMapStub).props("activeLegendCode")).toBeTruthy();

    await legendButtons[0]!.trigger("click");
    expect(legendButtons[0]!.classes()).not.toContain("bg-accent");
    expect(wrapper.findComponent(analysisMapStub).props("activeLegendCode")).toBeNull();
  });

  it("opens the public attachments modal when a partially justified dataset icon is clicked", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;

    getMock.mockImplementation((url: string) => {
      if (url === "/v1/public/analyses/analysis-public-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-public-1",
              carKey: "MT-123",
              farmName: "Fazenda pública",
              analysisDate: "2026-02-12",
              status: "completed",
              analysisKind: "STANDARD",
              biomas: ["Cerrado"],
              intersectionCount: 1,
              datasetGroups: [
                {
                  title: "Desmatamento",
                  items: [
                    {
                      datasetCode: "PRODES_CERRADO_NB_2021",
                      hit: true,
                      label: "Prodes Cerrado Nb 2021",
                      hasJustification: false,
                      justificationStatus: "partial",
                      justifiedHits: 1,
                      totalHits: 3,
                    },
                  ],
                },
              ],
              results: [],
            },
          },
        });
      }
      if (url === "/v1/public/analyses/analysis-public-1/vector-map") {
        return Promise.resolve({
          data: { data: publicVectorMapPayload([], false) },
        });
      }
      if (url === "/v1/public/analyses/analysis-public-1/attachments") {
        return Promise.resolve({
          data: {
            data: [
              {
                id: "att-1",
                categoryCode: "JUSTIFICATIVA_TECNICA",
                categoryName: "Justificativa técnica",
                isJustification: true,
                originalFilename: "arquivo-publico.pdf",
                contentType: "application/pdf",
                sizeBytes: "120",
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const wrapper = mount(AnalysisPublicView, {
      global: {
        stubs: {
          AnalysisVectorMap: { template: "<div data-test='analysis-map'></div>" },
          AnalysisPrintLayout: { template: "<div />" },
          AnalysisWatermark: { template: "<div />" },
        },
      },
    });
    await flushPromises();

    const justificationButton = wrapper.get("[aria-label='Abrir justificativas públicas do dataset']");
    await justificationButton.trigger("click");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith(
      "/v1/public/analyses/analysis-public-1/attachments",
      expect.objectContaining({
        headers: { "X-Skip-Auth": "1", "X-Skip-Org": "1" },
      }),
    );
    expect(wrapper.text()).toContain("Anexos públicos da análise");
    expect(wrapper.text()).toContain("arquivo-publico.pdf");
  });
});

