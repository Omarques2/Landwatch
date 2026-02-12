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
});
