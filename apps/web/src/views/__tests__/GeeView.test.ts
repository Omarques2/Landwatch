import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import GeeView from "@/views/GeeView.vue";
import { runGeeCarAnalysis } from "@/api/gee";
import { http } from "@/api/http";

vi.mock("@/api/gee", () => ({ runGeeCarAnalysis: vi.fn() }));
vi.mock("@/api/http", () => ({ http: { get: vi.fn() } }));

const button = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll("button").find((candidate) => candidate.text() === text)!;

async function uploadArea(wrapper: VueWrapper) {
  const upload = wrapper.find('input[type="file"]');
  Object.defineProperty(upload.element, "files", { value: [new File(["{}"], "area.geojson")] });
  await upload.trigger("change");
}

describe("GeeView", () => {
  afterEach(() => vi.clearAllMocks());

  it.each(["load", "error"])("keeps progress visible until the image settles (%s)", async (event) => {
    vi.mocked(runGeeCarAnalysis).mockResolvedValueOnce({
      script: "Backend",
      areaM2: 12345,
      beforeCount: 47,
      afterCount: 444,
      previewUrl: "https://example.com/preview",
      basePreviewUrl: "https://example.com/base",
      beforePreviewUrl: "data:image/png;base64,AAAA",
      previewDimensions: 500,
      periods: {
        beforeStartDate: "2010-01-01",
        beforeEndDate: "2012-05-06",
        startDate: "2024-01-01",
        endDate: "2025-01-01",
      },
      sourceRevision: "revision",
    });
    const wrapper = mount(GeeView);
    await button(wrapper, "Mudança de vegetação").trigger("click");
    await uploadArea(wrapper);
    await wrapper.find("#gee-start").setValue("01/01/2010");
    await button(wrapper, "Gerar comparação").trigger("click");
    await flushPromises();
    expect(runGeeCarAnalysis).toHaveBeenCalledWith(
      expect.any(File),
      null,
      "2010-01-01",
      "2025-01-01",
      "deforestation",
      expect.any(Function),
      expect.any(AbortSignal),
    );
    const progress = wrapper.find('[data-testid="gee-progress"]');
    expect(progress.text()).toContain("Gerando as imagens");
    expect(progress.text()).toContain("Landsat 5: 47 imagens");
    expect(progress.find("progress").attributes("value")).toBeUndefined();
    expect(wrapper.text()).toContain("12.345 m²");
    expect(wrapper.text()).toContain("1,23 ha");
    expect(wrapper.text()).toContain("resolução reduzida (500 px)");
    expect(wrapper.text()).toContain("Mediana de 01/01/2010 a 06/05/2012");
    const images = wrapper.findAll("img");
    expect(images[0]!.attributes("src")).toBe("data:image/png;base64,AAAA");
    expect(images[0]!.attributes("style")).toBeUndefined();
    expect(images[1]!.attributes("src")).toBe("https://example.com/base");
    expect(images[1]!.attributes("style")).toBeUndefined();
    expect(images[2]!.attributes("style")).toContain("opacity: 0.35");
    await wrapper.find("#gee-opacity").setValue("70");
    expect(images[2]!.attributes("style")).toContain("opacity: 0.7");
    await images[0]!.trigger(event);
    expect(wrapper.find('[data-testid="gee-progress"]').exists()).toBe(true);
    await images[1]!.trigger("load");
    expect(wrapper.find('[data-testid="gee-progress"]').exists()).toBe(true);
    await images[2]!.trigger("load");
    expect(wrapper.find('[data-testid="gee-progress"]').exists()).toBe(false);
    if (event === "error") expect(wrapper.text()).toContain("Uma das camadas não carregou");
    expect(wrapper.find('[data-testid="gee-interpretation"]').text()).toContain("não confirma desmatamento");
    wrapper.unmount();
  });

  it("finishes with an explicit error when the runner has no images", async () => {
    vi.mocked(runGeeCarAnalysis).mockRejectedValueOnce(new Error("Sem imagens Landsat 8."));
    const wrapper = mount(GeeView);
    await uploadArea(wrapper);
    await button(wrapper, "Gerar imagem").trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain("Sem imagens Landsat 8.");
    expect(wrapper.find('[data-testid="gee-progress"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([
    ["01/01/2010", "31/12/2011", "Landsat 8"],
    ["01/01/2020", "31/12/2024", "Landsat 5"],
  ])("blocks an interval without both sensors: %s to %s", async (start, end, missing) => {
    const wrapper = mount(GeeView);
    await button(wrapper, "Mudança de vegetação").trigger("click");
    const pickers = wrapper.findAll('input[type="date"]');
    expect(pickers).toHaveLength(2);
    expect(pickers[0]!.attributes("min")).toBe("1984-03-16");
    await uploadArea(wrapper);
    await wrapper.find("#gee-start").setValue(start);
    await wrapper.find("#gee-end").setValue(end);
    expect(wrapper.find('[data-testid="gee-date-error"]').text()).toContain(missing);
    const execute = button(wrapper, "Gerar comparação");
    expect(execute.attributes("disabled")).toBeDefined();
    await execute.trigger("click");
    expect(runGeeCarAnalysis).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("blocks an invalid typed date", async () => {
    const wrapper = mount(GeeView);
    await button(wrapper, "Mudança de vegetação").trigger("click");
    await uploadArea(wrapper);
    await wrapper.find("#gee-start").setValue("31/02/2024");
    expect(wrapper.text()).toContain("Data inválida.");
    expect(wrapper.find('[data-testid="gee-date-error"]').exists()).toBe(true);
    expect(button(wrapper, "Gerar comparação").attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("sends one calendar month for Sentinel-2 and blocks future months", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    vi.mocked(runGeeCarAnalysis).mockRejectedValueOnce(new Error("stop"));
    const wrapper = mount(GeeView);
    const month = wrapper.find<HTMLSelectElement>("#gee-month");
    const year = wrapper.find<HTMLSelectElement>("#gee-year");
    expect([month.element.value, year.element.value]).toEqual(["09", "2026"]);
    expect(month.find('option[value="11"]').attributes("disabled")).toBeDefined();
    expect(year.findAll("option").map((option) => option.text())).toContain("2017");
    await year.setValue("2024");
    await month.setValue("12");
    expect(month.find('option[value="11"]').attributes("disabled")).toBeUndefined();
    await uploadArea(wrapper);
    await button(wrapper, "Gerar imagem").trigger("click");
    await flushPromises();
    expect(vi.mocked(runGeeCarAnalysis).mock.calls[0]!.slice(2, 5)).toEqual(["2024-12-01", "2025-01-01", "image"]);
    await year.setValue("2026");
    expect([month.element.value, year.element.value]).toEqual(["10", "2026"]);
    vi.useRealTimers();
    wrapper.unmount();
  });

  it("generates two months in parallel and compares them side by side", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    const resolvers: (() => void)[] = [];
    vi.mocked(runGeeCarAnalysis).mockImplementation(
      (_file, _farm, start) =>
        new Promise((resolve, reject) =>
          resolvers.push(() =>
            start === "2026-09-01"
              ? resolve({
                  script: "BaicarImagem",
                  downloadUrl: `https://example.com/${start}`,
                  previewUrl: `data:image/png;base64,${start}`,
                  previewDimensions: 1000,
                  imageCount: 4,
                  format: "GEO_TIFF",
                  sourceRevision: "revision",
                })
              : start === "2025-09-01"
                ? resolve({
                    script: "BaicarImagem",
                    downloadUrl: `https://example.com/${start}`,
                    previewUrl: `data:image/png;base64,${start}`,
                    previewDimensions: 500,
                    imageCount: 9,
                    format: "GEO_TIFF",
                    sourceRevision: "revision",
                  })
                : reject(new Error("Nenhuma imagem encontrada.")),
          ),
        ),
    );
    const wrapper = mount(GeeView);
    await uploadArea(wrapper);
    await button(wrapper, "Adicionar data para comparar").trigger("click");
    expect(wrapper.find<HTMLSelectElement>("#gee-compare-year").element.value).toBe("2025");
    await button(wrapper, "Gerar imagens").trigger("click");
    // Both requests start before either finishes.
    expect(vi.mocked(runGeeCarAnalysis).mock.calls.map((call) => call[2])).toEqual(["2025-09-01", "2026-09-01"]);
    resolvers.forEach((release) => release());
    await flushPromises();
    expect(wrapper.find('[data-testid="gee-progress"]').exists()).toBe(true);
    const images = wrapper.findAll("img");
    expect(images.map((image) => image.attributes("src"))).toEqual([
      "data:image/png;base64,2025-09-01",
      "data:image/png;base64,2026-09-01",
    ]);
    expect(wrapper.text()).toContain("Sentinel-2 · setembro de 2025");
    expect(wrapper.text()).toContain("resolução reduzida (500 px)");
    expect(wrapper.findAll("button").filter((item) => item.text() === "Baixar GeoTIFF")).toHaveLength(2);
    await images[0]!.trigger("load");
    expect(wrapper.find('[data-testid="gee-progress"]').exists()).toBe(true);
    await images[1]!.trigger("load");
    expect(wrapper.find('[data-testid="gee-progress"]').exists()).toBe(false);

    // A failed month still shows the other one, with the failure named.
    await wrapper.find<HTMLSelectElement>("#gee-compare-year").setValue("2024");
    await button(wrapper, "Gerar imagens").trigger("click");
    resolvers.slice(2).forEach((release) => release());
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain("setembro de 2024: Nenhuma imagem encontrada.");
    expect(wrapper.findAll("img")).toHaveLength(1);

    await wrapper.find<HTMLSelectElement>("#gee-compare-year").setValue("2026");
    expect(wrapper.find('[data-testid="gee-date-error"]').text()).toContain("meses diferentes");
    await wrapper.find('[aria-label="Remover segunda data"]').trigger("click");
    expect(wrapper.find("#gee-compare-month").exists()).toBe(false);
    vi.useRealTimers();
    wrapper.unmount();
  });

  it("sends only the selected farm", async () => {
    vi.mocked(http.get).mockResolvedValue({
      data: {
        data: [{ id: "farm-1", name: "Santa Rita", carKey: "MT-123", orgName: "Org X" }],
        meta: { page: 1, pageSize: 100, total: 250 },
      },
    });
    vi.mocked(runGeeCarAnalysis).mockResolvedValueOnce({
      script: "BaicarImagem",
      downloadUrl: "https://example.com/tif",
      previewUrl: "data:image/png;base64,SENTINEL",
      previewDimensions: 1000,
      imageCount: 3,
      format: "GEO_TIFF",
      sourceRevision: "revision",
    });
    const wrapper = mount(GeeView);
    await uploadArea(wrapper);
    await button(wrapper, "Fazenda").trigger("click");
    await flushPromises();
    expect(http.get).toHaveBeenCalledWith("/v1/farms", {
      params: expect.objectContaining({ pageSize: 100, sort: "name" }),
    });
    await wrapper.find("#gee-farm").trigger("focus");
    expect(wrapper.text()).toContain("Mostrando 1 de 250");
    await wrapper.find('[role="option"]').trigger("mousedown");
    expect(wrapper.find('[data-testid="gee-area-selected"]').text()).toContain("Santa Rita");
    await button(wrapper, "Gerar imagem").trigger("click");
    await flushPromises();
    expect(vi.mocked(runGeeCarAnalysis).mock.calls[0]!.slice(0, 2)).toEqual([null, "farm-1"]);
    expect(wrapper.text()).toContain("Baixar GeoTIFF");
    wrapper.unmount();
  });

  it("shows the Sentinel-2 preview and keeps progress until it settles", async () => {
    vi.mocked(runGeeCarAnalysis).mockResolvedValueOnce({
      script: "BaicarImagem",
      downloadUrl: "https://example.com/tif",
      previewUrl: "data:image/png;base64,SENTINEL",
      previewDimensions: 500,
      imageCount: 7,
      format: "GEO_TIFF",
      sourceRevision: "revision",
    });
    const wrapper = mount(GeeView);
    await uploadArea(wrapper);
    await button(wrapper, "Gerar imagem").trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="gee-progress"]').text()).toContain("Gerando a visualização");
    expect(wrapper.text()).toContain("Mediana de 7 imagens do mês");
    expect(wrapper.text()).toContain("resolução reduzida (500 px)");
    expect(wrapper.find("#gee-opacity").exists()).toBe(false);
    const images = wrapper.findAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]!.attributes("src")).toBe("data:image/png;base64,SENTINEL");
    await images[0]!.trigger("error");
    expect(wrapper.find('[data-testid="gee-progress"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("A visualização não carregou");
    expect(wrapper.text()).toContain("Baixar GeoTIFF");
    wrapper.unmount();
  });

  it("keeps each tab's result", async () => {
    vi.mocked(runGeeCarAnalysis).mockResolvedValueOnce({
      script: "BaicarImagem",
      downloadUrl: "https://example.com/tif",
      previewUrl: "data:image/png;base64,SENTINEL",
      previewDimensions: 1000,
      imageCount: 3,
      format: "GEO_TIFF",
      sourceRevision: "revision",
    });
    const wrapper = mount(GeeView);
    await uploadArea(wrapper);
    await button(wrapper, "Gerar imagem").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Mediana de 3 imagens do mês");
    await button(wrapper, "Mudança de vegetação").trigger("click");
    expect(wrapper.text()).not.toContain("Baixar GeoTIFF");
    await button(wrapper, "Imagem Sentinel-2").trigger("click");
    expect(wrapper.text()).toContain("Baixar GeoTIFF");
    wrapper.unmount();
  });

  it("cancels the request from the button and on unmount", async () => {
    const signals: AbortSignal[] = [];
    vi.mocked(runGeeCarAnalysis).mockImplementation(
      (_file, _farm, _start, _end, _operation, _onProgress, signal) =>
        new Promise((_resolve, reject) => {
          signals.push(signal!);
          signal!.addEventListener("abort", () => reject(new Error("canceled")));
        }),
    );
    const wrapper = mount(GeeView);
    await uploadArea(wrapper);
    await button(wrapper, "Gerar imagem").trigger("click");
    expect(wrapper.find('[data-testid="gee-progress"]').exists()).toBe(true);
    expect(wrapper.find("header fieldset").attributes("disabled")).toBeDefined();
    await button(wrapper, "Cancelar").trigger("click");
    await flushPromises();
    expect(signals[0]!.aborted).toBe(true);
    expect(wrapper.text()).toContain("Consulta cancelada.");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    await button(wrapper, "Gerar imagem").trigger("click");
    wrapper.unmount();
    expect(signals[1]!.aborted).toBe(true);
  });
});
