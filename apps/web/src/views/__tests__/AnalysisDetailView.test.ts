import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import AnalysisDetailView from "@/views/AnalysisDetailView.vue";
import { http } from "@/api/http";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({
    params: { id: "analysis-deter-1" },
    query: {},
  }),
}));

describe("AnalysisDetailView", () => {
  it("shows preventive DETER title and disclaimer for preventive analyses", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
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
      if (url === "/v1/analyses/analysis-deter-1/map") {
        return Promise.resolve({ data: { data: [] } });
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
      if (url === "/v1/analyses/analysis-deter-1/map") {
        return Promise.resolve({ data: { data: [] } });
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

  it("renders UCS legend by displayName while keeping table labels by category", async () => {
    const getMock = http.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((url: string) => {
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
      if (url === "/v1/analyses/analysis-deter-1/map") {
        return Promise.resolve({
          data: {
            data: [
              {
                categoryCode: "UCS",
                datasetCode: "UNIDADES_CONSERVACAO",
                featureId: "10",
                displayName: "Reserva Serra Azul",
                naturalId: "1234.56.7890",
                geom: { type: "Point", coordinates: [0, 0] },
              },
            ],
          },
        });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    const wrapper = mount(AnalysisDetailView, {
      global: {
        stubs: {
          AnalysisMap: { template: "<div data-test='analysis-map'></div>" },
        },
      },
    });
    await flushPromises();

    const pageText = wrapper.text();
    expect(pageText).toContain("Reserva Serra Azul");
    expect(pageText).toContain("Área de Proteção Ambiental");
  });
});
