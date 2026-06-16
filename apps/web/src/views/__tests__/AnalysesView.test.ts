import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import AnalysesView from "@/views/AnalysesView.vue";
import { http } from "@/api/http";

const routerPushMock = vi.fn();

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

describe("AnalysesView", () => {
  beforeEach(() => {
    routerPushMock.mockReset();
  });

  it("renders skeleton while analyses are loading", () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const wrapper = mount(AnalysesView);

    expect(wrapper.find('[data-testid="analyses-skeleton"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Nenhuma análise encontrada.");
  });

  it("applies filters when requested", async () => {
    const mockGet = http.get as unknown as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/farms") {
        return Promise.resolve({
          data: {
            data: [
              {
                id: "farm-1",
                name: "Fazenda Teste",
                carKey: "SP-1234567-0000000000000000000000000000000000",
              },
            ],
            meta: { page: 1, pageSize: 50, total: 1 },
          },
        });
      }
      if (url === "/v1/analyses") {
        return Promise.resolve({
          data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
        });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    const wrapper = mount(AnalysesView);
    await flushPromises();

    await wrapper.find('[data-testid="analysis-filter-farm"]').setValue("farm-1");
    await wrapper.find('[data-testid="analysis-filter-car"]').setValue("SP-123");
    await wrapper.find('[data-testid="analysis-filter-start"]').setValue("2026-02-01");
    await wrapper.find('[data-testid="analysis-filter-end"]').setValue("2026-02-10");
    await wrapper.find('[data-testid="analysis-filter-apply"]').trigger("click");
    await flushPromises();

    const calls = mockGet.mock.calls.filter(([url]) => url === "/v1/analyses");
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]?.params).toMatchObject({
      farmId: "farm-1",
      carKey: "SP-123",
      startDate: "2026-02-01",
      endDate: "2026-02-10",
      page: 1,
      pageSize: 20,
    });
  });

  it("uses safe pageSize when loading farms", async () => {
    const mockGet = http.get as unknown as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/farms") {
        return Promise.resolve({
          data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
        });
      }
      if (url === "/v1/analyses") {
        return Promise.resolve({
          data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
        });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    mount(AnalysesView);
    await flushPromises();

    const farmsCall = mockGet.mock.calls.find(([url]) => url === "/v1/farms");
    expect(farmsCall?.[1]?.params).toMatchObject({
      page: 1,
      pageSize: 100,
    });
  });

  it("highlights DETER preventive analyses in the list", async () => {
    const mockGet = http.get as unknown as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/farms") {
        return Promise.resolve({
          data: { data: [], meta: { page: 1, pageSize: 100, total: 0 } },
        });
      }
      if (url === "/v1/analyses") {
        return Promise.resolve({
          data: {
            data: [
              {
                id: "analysis-deter-1",
                carKey: "MT-123",
                analysisDate: "2026-02-12",
                status: "completed",
                farmName: "Fazenda DETER",
                hasIntersections: true,
                analysisKind: "DETER",
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1 },
          },
        });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    const wrapper = mount(AnalysesView);
    await flushPromises();

    expect(wrapper.text()).toContain("DETER preventiva");
  });

  it("redirects to new analysis when list access is forbidden", async () => {
    const mockGet = http.get as unknown as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/analyses") {
        return Promise.reject({ response: { status: 403 } });
      }
      return Promise.resolve({
        data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
      });
    });

    mount(AnalysesView);
    await flushPromises();

    expect(routerPushMock).toHaveBeenCalledWith("/analyses/new");
  });

  it("uses fixed desktop columns for badge alignment", async () => {
    const mockGet = http.get as unknown as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/farms") {
        return Promise.resolve({
          data: { data: [], meta: { page: 1, pageSize: 100, total: 0 } },
        });
      }
      if (url === "/v1/analyses") {
        return Promise.resolve({
          data: {
            data: [
              {
                id: "analysis-standard-1",
                carKey: "MT-001",
                analysisDate: "2026-02-12",
                status: "completed",
                farmName: "Fazenda A",
                hasIntersections: false,
                analysisKind: "STANDARD",
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1 },
          },
        });
      }
      return Promise.reject(new Error("unexpected request"));
    });

    const wrapper = mount(AnalysesView);
    await flushPromises();

    const badges = wrapper.find('[data-testid="analysis-badges"]');
    expect(badges.exists()).toBe(true);
    expect(badges.classes()).toContain("md:grid");
    expect(badges.classes()).toContain("md:grid-cols-[12rem_8.5rem_11rem]");
  });

  it("downloads PDF from the backend from list rows", async () => {
    const mockGet = http.get as unknown as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string, config?: Record<string, unknown>) => {
      if (url === "/v1/farms") {
        return Promise.resolve({
          data: { data: [], meta: { page: 1, pageSize: 100, total: 0 } },
        });
      }
      if (url === "/v1/analyses") {
        return Promise.resolve({
          data: {
            data: [
              {
                id: "analysis-standard-1",
                carKey: "MT-001",
                analysisDate: "2026-02-12",
                status: "completed",
                farmName: "Fazenda A",
                hasIntersections: false,
                analysisKind: "STANDARD",
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1 },
          },
        });
      }
      if (url === "/v1/analyses/analysis-standard-1/pdf") {
        expect(config).toMatchObject({ responseType: "blob" });
        return Promise.resolve({
          data: new Blob(["pdf"], { type: "application/pdf" }),
          headers: {
            "content-disposition":
              'attachment; filename="Sigfarm-LandWatch-Fazenda-A.pdf"',
          },
        });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
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
      .mockImplementation(() => "blob:list-pdf");
    const revokeObjectUrlSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const wrapper = mount(AnalysesView);
    await flushPromises();

    const pdfButton = wrapper
      .findAll("button")
      .find((item) => item.text() === "Baixar PDF");
    await pdfButton!.trigger("click");
    await flushPromises();

    expect(mockGet).toHaveBeenCalledWith(
      "/v1/analyses/analysis-standard-1/pdf",
      { responseType: "blob" },
    );
    expect(openSpy).not.toHaveBeenCalled();
    expect(appendedDownloads).toContain("Sigfarm-LandWatch-Fazenda-A.pdf");
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:list-pdf");

    appendSpy.mockRestore();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    clickSpy.mockRestore();
    openSpy.mockRestore();
  });
});
