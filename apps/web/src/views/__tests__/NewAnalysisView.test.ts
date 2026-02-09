import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import NewAnalysisView from "@/views/NewAnalysisView.vue";
import { http } from "@/api/http";
import { mvBusy } from "@/state/landwatch-status";

let routePath = "/analyses/new";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: routePath, query: {} }),
}));

vi.mock("@/state/landwatch-status", () => ({
  mvBusy: ref(false),
}));

describe("NewAnalysisView", () => {
  beforeEach(() => {
    routePath = "/analyses/new";
  });

  it("preenche coordenadas com GPS na busca de CAR", async () => {
    routePath = "/analyses/search";
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: -10.1234567,
          longitude: -50.7654321,
          accuracy: 1,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    });

    Object.defineProperty(globalThis.navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    const wrapper = mount(NewAnalysisView);
    const button = wrapper.find('[data-testid="gps-button"]');
    await button.trigger("click");
    await flushPromises();

    const latInput = wrapper.find('[data-testid="gps-lat"]').element as HTMLInputElement;
    const lngInput = wrapper.find('[data-testid="gps-lng"]').element as HTMLInputElement;
    expect(latInput.value).toBe("-10.123457");
    expect(lngInput.value).toBe("-50.765432");
  });

  it("shows warning and disables submit when MV is refreshing", async () => {
    mvBusy.value = true;
    const wrapper = mount(NewAnalysisView);

    const submitButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Gerar análise"));

    expect(submitButton?.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Base geoespacial em atualização");
  });

  it("blocks submit on invalid CPF", async () => {
    const wrapper = mount(NewAnalysisView);

    await wrapper.find("#analysis-car").setValue("SP-1234567-0000000000000000000000000000000000");
    await wrapper.find("#analysis-doc").setValue("111.111.111-11");

    await wrapper.find("button").trigger("click");

    expect(wrapper.text()).toContain("CPF/CNPJ inválido");
    expect(http.post).not.toHaveBeenCalled();
  });

  it("auto-fills farm data on blur when carKey is complete", async () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        data: [
          {
            id: "farm-1",
            name: "Fazenda Teste",
            carKey: "SP-1234567-0000000000000000000000000000000000",
            cpfCnpj: "52998224725",
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1 },
      },
    });

    const wrapper = mount(NewAnalysisView);

    await wrapper
      .find("#analysis-car")
      .setValue("SP-1234567-0000000000000000000000000000000000");
    await wrapper.find("#analysis-car").trigger("blur");

    await flushPromises();

    const nameInput = wrapper.find("#analysis-name").element as HTMLInputElement;
    expect(nameInput.value).toBe("Fazenda Teste");
  });

  it("auto-fills farm data on Enter when CPF/CNPJ is valid", async () => {
    (http.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        data: [
          {
            id: "farm-2",
            name: "Fazenda CPF",
            carKey: "SP-7654321-1111111111111111111111111111111111",
            cpfCnpj: "52998224725",
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1 },
      },
    });

    const wrapper = mount(NewAnalysisView);

    await wrapper.find("#analysis-doc").setValue("529.982.247-25");
    await wrapper.find("#analysis-doc").trigger("keydown.enter");

    await flushPromises();

    const nameInput = wrapper.find("#analysis-name").element as HTMLInputElement;
    expect(nameInput.value).toBe("Fazenda CPF");
  });
});
