import { defineComponent } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { http } from "@/api/http";

const pushMock = vi.fn().mockResolvedValue(undefined);

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

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({
    params: { id: "analysis-deter-1" },
    query: {},
  }),
  useRouter: () => ({
    push: pushMock,
  }),
}));

import AnalysisDetailView from "@/views/AnalysisDetailView.vue";
import { clearAnalysisMapCache } from "@/features/analyses/analysis-map-cache";

function completedStatus(overrides: Record<string, unknown> = {}) {
  return {
    id: "analysis-deter-1",
    carKey: "MT-123",
    analysisDate: "2026-02-12",
    analysisKind: "STANDARD",
    farmName: "Fazenda DETER",
    status: "completed",
    intersectionCount: 1,
    hasIntersections: true,
    createdAt: "2026-02-12T10:00:00.000Z",
    completedAt: "2026-02-12T10:00:02.000Z",
    ...overrides,
  };
}

function vectorMapPayload(
  legendItems: Array<Record<string, unknown>> = [],
  withSource = true,
) {
  return {
    renderMode: "mvt",
    vectorSource: withSource
      ? {
          tiles: ["/v1/analyses/analysis-deter-1/tiles/{z}/{x}/{y}.mvt"],
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

describe("AnalysisDetailView", () => {
  beforeEach(() => {
    pushMock.mockClear();
    window.sessionStorage.clear();
    clearAnalysisMapCache();
    document.title = "LandWatch";
    const postMock = http.post as unknown as ReturnType<typeof vi.fn>;
    postMock.mockReset();
    postMock.mockRejectedValue(new Error("public token endpoint should not be used"));
    vi.restoreAllMocks();
  });

  it("shows preventive DETER title and disclaimer for preventive analyses", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({
          data: {
            data: completedStatus({ analysisKind: "DETER" }),
          },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
              analysisDate: "2026-02-12",
              status: "completed",
              analysisKind: "DETER",
              biomas: ["Cerrado"],
              intersectionCount: 1,
              datasetGroups: [],
              results: [],
            },
          },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({ data: { data: vectorMapPayload([], false) } });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    const wrapper = mount(AnalysisDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain("Análise preventiva DETER");
    expect(wrapper.text()).toContain(
      "Esta análise preventiva usa alertas DETER para prevenção",
    );
  });

  it("renders farm name in title case and preserves SICAR badge uppercase", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({
          data: {
            data: completedStatus({
              farmName: "fazenda de teste desmatamento",
            }),
          },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "fazenda de teste desmatamento",
              analysisDate: "2026-02-12",
              status: "completed",
              analysisKind: "STANDARD",
              sicarStatus: "AT",
              biomas: ["Cerrado"],
              intersectionCount: 1,
              datasetGroups: [],
              results: [],
            },
          },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({ data: { data: vectorMapPayload([], false) } });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    const wrapper = mount(AnalysisDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain("Estabelecimento Fazenda De Teste Desmatamento");
    expect(wrapper.text()).toContain("SICAR MT-123 ATIVO");
    expect(wrapper.text()).not.toContain("Sicar Mt-123 Ativo");
  });

  it("does not request a public token for the analysis public URL", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    const postMock = http.post as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({ data: { data: completedStatus() } });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
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
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({ data: { data: vectorMapPayload([], false) } });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    mount(AnalysisDetailView);
    await flushPromises();

    expect(postMock).not.toHaveBeenCalled();
  });

  it("hides attachment actions when analysis has no attachments", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({ data: { data: completedStatus() } });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
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
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({ data: { data: vectorMapPayload([], false) } });
      }
      if (url === "/v1/attachments/analysis/analysis-deter-1") {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const wrapper = mount(AnalysisDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain("Baixar GeoJSON");
    expect(wrapper.text()).not.toContain("Anexos");
    expect(wrapper.text()).not.toContain("Baixar ZIP anexos");
  });

  it("shows attachment actions when analysis has attachments", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({ data: { data: completedStatus() } });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
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
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({ data: { data: vectorMapPayload([], false) } });
      }
      if (url === "/v1/attachments/analysis/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: [
              {
                id: "att-1",
                categoryCode: "JUSTIFICATIVA_TECNICA",
                categoryName: "Justificativa técnica",
                isJustification: true,
                visibility: "PUBLIC",
                originalFilename: "justificativa.pdf",
                contentType: "application/pdf",
                sizeBytes: "120",
                target: {
                  id: "target-1",
                  datasetCode: "PRODES_CERRADO_NB_2021",
                  featureId: "7426006",
                  featureKey: "3796679",
                  naturalId: null,
                  carKey: "MT-123",
                  scope: "PLATFORM_CAR",
                  validFrom: "2026-02-01",
                  validTo: null,
                },
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const wrapper = mount(AnalysisDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain("Anexos");
    expect(wrapper.text()).toContain("Baixar ZIP anexos");
  });

  it("downloads enriched geojson from API endpoint", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    const geojsonPayload = {
      type: "FeatureCollection",
      properties: {
        analysisId: "analysis-deter-1",
        carKey: "MT-123",
        analysisDate: "2026-02-12",
      },
      features: [
        {
          type: "Feature",
          id: "UNIDADES_CONSERVACAO:1",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: {
            naturalId: "1234.56.7890",
            displayName: "Parque Nacional",
            ucsCategoria: "Parque Nacional",
          },
        },
      ],
    };
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({
          data: {
            data: completedStatus({ analysisKind: "DETER" }),
          },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
              analysisDate: "2026-02-12",
              status: "completed",
              analysisKind: "DETER",
              biomas: ["Cerrado"],
              intersectionCount: 1,
              datasetGroups: [],
              results: [],
            },
          },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({ data: { data: vectorMapPayload([], false) } });
      }
      if (url === "/v1/analyses/analysis-deter-1/geojson") {
        return Promise.resolve({ data: { data: geojsonPayload } });
      }
      return Promise.reject(new Error("unexpected request"));
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

    const wrapper = mount(AnalysisDetailView);
    await flushPromises();

    const downloadButton = wrapper
      .findAll("button")
      .find((item) => item.text().includes("Baixar GeoJSON"));
    expect(downloadButton).toBeTruthy();

    await downloadButton!.trigger("click");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/v1/analyses/analysis-deter-1/geojson");
    expect(clickSpy).toHaveBeenCalled();
    expect(exportedBlob).not.toBeNull();
    const exportedText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("read error"));
      reader.readAsText(exportedBlob as Blob);
    });
    const exported = JSON.parse(exportedText);
    expect(exported.features[0].properties.naturalId).toBe("1234.56.7890");
    expect(revokeObjectUrlSpy).toHaveBeenCalled();

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it("downloads PDF from the backend when clicking Baixar PDF on a completed analysis", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string, config?: Record<string, unknown>) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({
          data: {
            data: completedStatus(),
          },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
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
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({
          data: {
            data: vectorMapPayload([], true),
          },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1/pdf") {
        expect(config).toMatchObject({ responseType: "blob" });
        return Promise.resolve({
          data: new Blob(["pdf"], { type: "application/pdf" }),
          headers: {
            "content-disposition":
              'attachment; filename="Sigfarm-LandWatch-Fazenda.pdf"',
          },
        });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    const appendedDownloads: string[] = [];
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
    const appendSpy = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation((node: Node) => {
        if (node instanceof HTMLAnchorElement) {
          appendedDownloads.push(node.download);
        }
        return node;
      });
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => "blob:pdf");
    const revokeObjectUrlSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const wrapper = mount(AnalysisDetailView);
    await flushPromises();

    const buttons = wrapper.findAll("button").map((item) => item.text());
    expect(buttons).toContain("Baixar PDF");
    expect(buttons.some((text) => text.includes("API"))).toBe(false);
    const pdfButton = wrapper.findAll("button").find((item) => item.text() === "Baixar PDF");
    expect(pdfButton).toBeTruthy();

    await pdfButton!.trigger("click");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/v1/analyses/analysis-deter-1/pdf", {
      responseType: "blob",
    });
    expect(appendedDownloads).toContain("Sigfarm-LandWatch-Fazenda.pdf");
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:pdf");

    appendSpy.mockRestore();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it("uses PDF filename fallback without api suffix when content-disposition is missing", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string, config?: Record<string, unknown>) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({ data: { data: completedStatus() } });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
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
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({ data: { data: vectorMapPayload([], true) } });
      }
      if (url === "/v1/analyses/analysis-deter-1/pdf") {
        expect(config).toMatchObject({ responseType: "blob" });
        return Promise.resolve({
          data: new Blob(["pdf"], { type: "application/pdf" }),
          headers: {},
        });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    let exportedBlob: Blob | null = null;
    const appendedDownloads: string[] = [];
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
    const appendSpy = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation((node: Node) => {
        if (node instanceof HTMLAnchorElement) {
          appendedDownloads.push(node.download);
        }
        return node;
      });
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob: Blob | MediaSource) => {
        exportedBlob = blob as Blob;
        return "blob:pdf";
      });
    const revokeObjectUrlSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const wrapper = mount(AnalysisDetailView);
    await flushPromises();

    const pdfButton = wrapper
      .findAll("button")
      .find((item) => item.text() === "Baixar PDF");
    await pdfButton!.trigger("click");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/v1/analyses/analysis-deter-1/pdf", {
      responseType: "blob",
    });
    expect(exportedBlob).not.toBeNull();
    expect(appendedDownloads).toContain(
      "Sigfarm-LandWatch-Fazenda-DETER-2026-02-12-analysis-deter-1.pdf",
    );
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:pdf");

    appendSpy.mockRestore();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it("renders UCS legend by displayName while keeping table labels by category", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({ data: { data: completedStatus() } });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
              analysisDate: "2026-02-12",
              status: "completed",
              analysisKind: "STANDARD",
              biomas: ["Cerrado"],
              intersectionCount: 1,
              datasetGroups: [
                {
                  title: "Unidades de conservação",
                  items: [
                    {
                      datasetCode: "UCS_APA",
                      hit: true,
                      label: "Área de Proteção Ambiental",
                    },
                  ],
                },
              ],
              results: [],
            },
          },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({
          data: {
            data: vectorMapPayload([
              {
                code: "UCS_APA",
                kind: "ucs",
                label: "Reserva Serra Azul",
                datasetCode: "UNIDADES_CONSERVACAO",
                featureIds: ["10"],
              },
            ]),
          },
        });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    const wrapper = mount(AnalysisDetailView, {
      global: {
        stubs: {
          AnalysisVectorMap: defineComponent({
            props: {
              activeLegendCode: {
                type: String,
                default: null,
              },
            },
            template:
              "<div data-test='analysis-map'>active={{ activeLegendCode || 'none' }}</div>",
          }),
        },
      },
    });
    await flushPromises();

    const pageText = wrapper.text();
    expect(pageText).toContain("Reserva Serra Azul");
    expect(pageText).toContain("Área de Proteção Ambiental");
  });

  it("toggles the screen legend filter state", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({
          data: { data: completedStatus({ intersectionCount: 2 }) },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
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
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({
          data: {
            data: vectorMapPayload([
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
      return Promise.reject(new Error("unexpected request"));
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

    const wrapper = mount(AnalysisDetailView, {
      global: {
        stubs: {
          AnalysisVectorMap: analysisMapStub,
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

  it("routes the selected feature instead of an unrelated context target", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({ data: { data: completedStatus() } });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
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
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({
          data: {
            data: vectorMapPayload([
              {
                code: "PRODES_A",
                kind: "dataset",
                label: "PRODES A",
                datasetCode: "PRODES_A",
                featureIds: ["2"],
              },
            ]),
          },
        });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    const wrapper = mount(AnalysisDetailView, {
      global: {
        stubs: {
          AnalysisVectorMap: {
            template:
              "<button data-test='emit-context' @click=\"$emit('feature-contextmenu', { datasetCode: 'PRODES_A', categoryCode: 'PRODES', featureId: '2', featureKey: 'A-1', displayName: 'Feat A', naturalId: 'A-1', isSicar: false, screen: { x: 120, y: 140 }, latlng: { lat: -1, lng: -1 }, selectedFeatures: [{ datasetCode: 'UNIDADES_CONSERVACAO', featureId: '22857615', label: 'UC' }] })\">ctx</button>",
          },
        },
      },
    });
    await flushPromises();

    await wrapper.get("[data-test='emit-context']").trigger("click");
    expect(wrapper.text()).toContain("Ir para Anexos");

    const menuButton = wrapper
      .findAll("button")
      .find((item) => item.text().includes("Ir para Anexos"));
    expect(menuButton).toBeTruthy();
    await menuButton!.trigger("click");

    expect(pushMock).toHaveBeenCalledWith({
      path: "/attachments",
      query: {
        tab: "explore",
        fromAnalysisId: "analysis-deter-1",
        datasetCode: "UNIDADES_CONSERVACAO",
        featureId: "22857615",
        carKey: "MT-123",
      },
    });
  });

  it("routes the current map multi-selection to attachments from the context menu", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({ data: { data: completedStatus() } });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
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
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({
          data: {
            data: vectorMapPayload([
              {
                code: "PRODES_A",
                kind: "dataset",
                label: "PRODES A",
                datasetCode: "PRODES_A",
                featureIds: ["2"],
              },
            ]),
          },
        });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    const wrapper = mount(AnalysisDetailView, {
      global: {
        stubs: {
          AnalysisVectorMap: {
            template:
              "<button data-test='emit-context' @click=\"$emit('feature-contextmenu', { datasetCode: 'PRODES_A', categoryCode: 'PRODES', featureId: '2', featureKey: 'A-1', displayName: 'Feat A', naturalId: 'A-1', isSicar: false, screen: { x: 120, y: 140 }, latlng: { lat: -1, lng: -1 }, selectedFeatures: [{ datasetCode: 'PRODES_A', featureId: '2', label: 'Feat A' }, { datasetCode: 'UNIDADES_CONSERVACAO', featureId: '22857615', label: 'UC' }] })\">ctx</button>",
          },
        },
      },
    });
    await flushPromises();

    await wrapper.get("[data-test='emit-context']").trigger("click");
    const menuButton = wrapper
      .findAll("button")
      .find((item) => item.text().includes("Ir para Anexos"));
    await menuButton!.trigger("click");

    expect(pushMock).toHaveBeenCalledWith({
      path: "/attachments",
      query: {
        tab: "explore",
        fromAnalysisId: "analysis-deter-1",
        datasetCode: ["PRODES_A", "UNIDADES_CONSERVACAO"],
        target: ["PRODES_A:2", "UNIDADES_CONSERVACAO:22857615"],
        carKey: "MT-123",
      },
    });
  });

  it("opens the local attachments modal when a partially justified dataset badge is clicked", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({ data: { data: completedStatus() } });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
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
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({ data: { data: vectorMapPayload([], false) } });
      }
      if (url === "/v1/attachments/analysis/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: [
              {
                id: "att-1",
                categoryCode: "JUSTIFICATIVA_TECNICA",
                categoryName: "Justificativa técnica",
                isJustification: true,
                visibility: "PUBLIC",
                originalFilename: "justificativa.pdf",
                contentType: "application/pdf",
                sizeBytes: "120",
                target: {
                  id: "target-1",
                  datasetCode: "PRODES_CERRADO_NB_2021",
                  featureId: "7426006",
                  featureKey: "3796679",
                  naturalId: null,
                  carKey: "MT-123",
                  scope: "PLATFORM_CAR",
                  validFrom: "2026-02-01",
                  validTo: null,
                },
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const wrapper = mount(AnalysisDetailView, {
      global: {
        stubs: {
          AnalysisVectorMap: { template: "<div data-test='analysis-map'></div>" },
        },
      },
    });
    await flushPromises();

    const badgeButton = wrapper.get("[aria-label='Abrir justificativas do dataset']");
    await badgeButton.trigger("click");
    await flushPromises();

    expect(pushMock).not.toHaveBeenCalled();
    expect(getMock).toHaveBeenCalledWith("/v1/attachments/analysis/analysis-deter-1");
  });

  it("renders the dataset status legend on the intersections section", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({
          data: { data: completedStatus({ intersectionCount: 2 }) },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
              analysisDate: "2026-02-12",
              status: "completed",
              analysisKind: "STANDARD",
              biomas: ["Cerrado"],
              intersectionCount: 2,
              datasetGroups: [
                {
                  title: "Grupo",
                  items: [
                    { datasetCode: "A", hit: false },
                    { datasetCode: "B", hit: true },
                    { datasetCode: "C", hit: true, hasJustification: true },
                    {
                      datasetCode: "D",
                      hit: true,
                      hasJustification: false,
                      justificationStatus: "partial",
                    },
                  ],
                },
              ],
              results: [],
            },
          },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({ data: { data: vectorMapPayload([], false) } });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const wrapper = mount(AnalysisDetailView, {
      global: {
        stubs: {
          AnalysisVectorMap: { template: "<div data-test='analysis-map'></div>" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Sem interseção");
    expect(wrapper.text()).toContain("Com interseção");
    expect(wrapper.text()).toContain("Com justificativa");
    expect(wrapper.text()).toContain("Parcialmente justificada");
  });

  it("hides unused legend states for current analysis", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({
          data: { data: completedStatus({ intersectionCount: 1 }) },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
              analysisDate: "2026-02-12",
              status: "completed",
              analysisKind: "STANDARD",
              biomas: ["Cerrado"],
              intersectionCount: 1,
              datasetGroups: [
                {
                  title: "Grupo",
                  items: [
                    { datasetCode: "A", hit: false },
                    { datasetCode: "B", hit: true, justificationStatus: "full" },
                  ],
                },
              ],
              results: [],
            },
          },
        });
      }
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({ data: { data: vectorMapPayload([], false) } });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const wrapper = mount(AnalysisDetailView, {
      global: {
        stubs: {
          AnalysisVectorMap: { template: "<div data-test='analysis-map'></div>" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Sem interseção");
    expect(wrapper.text()).toContain("Com justificativa");
    expect(wrapper.text()).not.toContain("Com interseção");
    expect(wrapper.text()).not.toContain("Parcialmente justificada");
  });

  it("ignores context menu requests for CAR/SICAR features", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
      if (url === "/v1/analyses/analysis-deter-1/status") {
        return Promise.resolve({ data: { data: completedStatus() } });
      }
      if (url === "/v1/analyses/analysis-deter-1") {
        return Promise.resolve({
          data: {
            data: {
              id: "analysis-deter-1",
              carKey: "MT-123",
              farmName: "Fazenda DETER",
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
      if (url === "/v1/analyses/analysis-deter-1/vector-map") {
        return Promise.resolve({
          data: {
            data: vectorMapPayload([], true),
          },
        });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    const wrapper = mount(AnalysisDetailView, {
      global: {
        stubs: {
          AnalysisVectorMap: {
            template:
              "<button data-test='emit-context' @click=\"$emit('feature-contextmenu', { datasetCode: 'CAR_MT', categoryCode: 'SICAR', featureId: '1', featureKey: 'MT-123', displayName: 'CAR', naturalId: null, isSicar: true, screen: { x: 120, y: 140 }, latlng: { lat: -1, lng: -1 } })\">ctx</button>",
          },
        },
      },
    });
    await flushPromises();

    await wrapper.get("[data-test='emit-context']").trigger("click");
    expect(wrapper.text()).not.toContain("Ir para Anexos");
    expect(pushMock).not.toHaveBeenCalled();
  });
});

