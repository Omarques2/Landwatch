import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import FornecedoresView from "@/views/FornecedoresView.vue";
import { http } from "@/api/http";

vi.mock("@/api/http", () => ({
  http: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

function mockGetByUrl(
  handler: (url: string, config?: { params?: Record<string, unknown> }) => unknown,
) {
  (
    http.get as unknown as ReturnType<typeof vi.fn>
  ).mockImplementation((url: string, config?: { params?: Record<string, unknown> }) =>
    Promise.resolve(handler(url, config)),
  );
}

async function flushMountedView() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("FornecedoresView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/fornecedores");
  });

  it("keeps in-memory cache without new API requests after filtering", async () => {
    const fornecedores = Array.from({ length: 25 }).map((_, index) => ({
      idFornecedor: `f-${index + 1}`,
      nome: `Fornecedor ${index + 1}`,
      cpfCnpj: "12345678000100",
      codigoEstabelecimento: String(index + 1).padStart(3, "0"),
      municipio: "Cuiabá",
      uf: "MT",
      car: null,
      gtaPendentes: 25 - index,
      gtaResolvidos: 0,
    }));

    mockGetByUrl((url) => {
      if (url === "/v1/fornecedores/summary") {
        return {
          data: {
            data: {
              totalFornecedores: 25,
              totalComCar: 3,
              totalSemCar: 22,
              gtasPendentes: 99,
              gtasPendentesSemCar: 66,
              fornecedoresComPendencias: 25,
            },
          },
        };
      }

      if (url === "/v1/fornecedores") {
        return {
          data: {
            data: fornecedores,
            meta: { page: 1, pageSize: 100, total: 25 },
          },
        };
      }

      return {
        data: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        },
      };
    });

    const wrapper = mount(FornecedoresView, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });
    await flushMountedView();

    expect(http.get).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("Fornecedor 1");

    await wrapper.find('[data-testid="column-menu-nome"]').trigger("click");
    await wrapper.find('[data-testid="column-filter-input-nome"]').setValue("Fornecedor 2");
    await wrapper.find('[data-testid="column-filter-option-checkbox-nome-0"]').setValue(true);
    await wrapper.find('[data-testid="column-filter-apply-nome"]').trigger("click");
    await flushMountedView();

    expect(http.get).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("Fornecedor 2");
    expect(wrapper.text()).not.toContain("Fornecedor 1");

    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it("keeps zero-pendencias rows in cache and toggles visibility with checkbox", async () => {
    mockGetByUrl((url) => {
      if (url === "/v1/fornecedores/summary") {
        return {
          data: {
            data: {
              totalFornecedores: 2,
              totalComCar: 0,
              totalSemCar: 2,
              gtasPendentes: 1,
              gtasPendentesSemCar: 1,
              fornecedoresComPendencias: 1,
            },
          },
        };
      }

      if (url === "/v1/fornecedores") {
        return {
          data: {
            data: [
              {
                idFornecedor: "f-1",
                nome: "Fornecedor Com Pendência",
                cpfCnpj: "12345678000100",
                codigoEstabelecimento: "001",
                municipio: "Cuiabá",
                uf: "MT",
                car: null,
                gtaPendentes: 1,
                gtaResolvidos: 0,
              },
              {
                idFornecedor: "f-2",
                nome: "Fornecedor Zero Pendência",
                cpfCnpj: "98765432000100",
                codigoEstabelecimento: "002",
                municipio: "Cuiabá",
                uf: "MT",
                car: null,
                gtaPendentes: 0,
                gtaResolvidos: 0,
              },
            ],
            meta: { page: 1, pageSize: 100, total: 2 },
          },
        };
      }

      return {
        data: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        },
      };
    });

    const wrapper = mount(FornecedoresView, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });
    await flushMountedView();

    expect(wrapper.find('[data-testid="fornecedor-row-f-1"]').exists()).toBe(true);
    expect(wrapper.find('[title="Fornecedor Com Pendência"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Fornecedor Zero Pendência");
    expect(http.get).toHaveBeenCalledTimes(2);

    const checkbox = wrapper.find('[data-testid="show-zero-pendencias-checkbox"]');
    await checkbox.setValue(true);
    await flushMountedView();

    expect(wrapper.find('[data-testid="fornecedor-row-f-2"]').exists()).toBe(true);
    expect(wrapper.find('[title="Fornecedor Zero Pendência"]').exists()).toBe(true);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it("renders indicadores and fornecedores list", async () => {
    mockGetByUrl((url) => {
      if (url === "/v1/fornecedores/summary") {
        return {
          data: {
            data: {
              totalFornecedores: 4,
              totalComCar: 3,
              totalSemCar: 1,
              gtasPendentes: 7,
              gtasPendentesSemCar: 2,
              fornecedoresComPendencias: 2,
            },
          },
        };
      }

      if (url === "/v1/fornecedores") {
        return {
          data: {
            data: [
              {
                idFornecedor: "f-1",
                nome: "Fornecedor Alfa",
                cpfCnpj: "12345678000100",
                codigoEstabelecimento: "001",
                municipio: "Cuiabá",
                uf: "MT",
                car: null,
                gtaPendentes: 2,
                gtaResolvidos: 0,
              },
              {
                idFornecedor: "f-2",
                nome: "Fornecedor Com CAR",
                cpfCnpj: "98765432000100",
                codigoEstabelecimento: "002",
                municipio: "Goiânia",
                uf: "GO",
                car: "GO-123",
                gtaPendentes: 1,
                gtaResolvidos: 4,
              },
            ],
            meta: { page: 1, pageSize: 100, total: 2 },
          },
        };
      }

      return {
        data: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        },
      };
    });

    const wrapper = mount(FornecedoresView, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });
    await flushMountedView();

    expect(wrapper.text()).toContain("Fornecedores");
    expect(wrapper.text()).toContain("Fornecedor Alfa");
    expect(wrapper.text()).not.toContain("Fornecedor Com CAR");
  });

  it("restores table state from URL query params", async () => {
    const params = new URLSearchParams({
      showZeroPendencias: "1",
      sortBy: "nome",
      sortDir: "asc",
      filters: JSON.stringify({ car: [] }),
    });
    window.history.replaceState(null, "", `/fornecedores?${params.toString()}`);

    mockGetByUrl((url) => {
      if (url === "/v1/fornecedores/summary") {
        return {
          data: {
            data: {
              totalFornecedores: 2,
              totalComCar: 1,
              totalSemCar: 1,
              gtasPendentes: 2,
              gtasPendentesSemCar: 1,
              fornecedoresComPendencias: 2,
            },
          },
        };
      }

      if (url === "/v1/fornecedores") {
        return {
          data: {
            data: [
              {
                idFornecedor: "f-1",
                nome: "Fornecedor Com CAR",
                cpfCnpj: "12345678000100",
                codigoEstabelecimento: "001",
                municipio: "Cuiabá",
                uf: "MT",
                car: "MT-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                gtaPendentes: 1,
                gtaResolvidos: 0,
              },
              {
                idFornecedor: "f-2",
                nome: "Fornecedor Sem CAR",
                cpfCnpj: "98765432000100",
                codigoEstabelecimento: "002",
                municipio: "Cuiabá",
                uf: "MT",
                car: null,
                gtaPendentes: 1,
                gtaResolvidos: 0,
              },
            ],
            meta: { page: 1, pageSize: 100, total: 2 },
          },
        };
      }

      return {
        data: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        },
      };
    });

    const wrapper = mount(FornecedoresView, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });
    await flushMountedView();

    expect(wrapper.text()).toContain("Fornecedor Com CAR");
    expect(wrapper.text()).toContain("Fornecedor Sem CAR");
    expect(wrapper.text()).toContain("2 fornecedores");
  });

  it("highlights selected cell and copies selected value with Ctrl+C", async () => {
    mockGetByUrl((url) => {
      if (url === "/v1/fornecedores/summary") {
        return {
          data: {
            data: {
              totalFornecedores: 1,
              totalComCar: 0,
              totalSemCar: 1,
              gtasPendentes: 1,
              gtasPendentesSemCar: 1,
              fornecedoresComPendencias: 1,
            },
          },
        };
      }

      if (url === "/v1/fornecedores") {
        return {
          data: {
            data: [
              {
                idFornecedor: "f-1",
                nome: "Fornecedor Teste",
                cpfCnpj: "12345678000100",
                estabelecimento: "FAZENDA SANTA BARBARA",
                codigoEstabelecimento: "001",
                municipio: "Cuiabá",
                uf: "MT",
                car: null,
                gtaPendentes: 1,
                gtaResolvidos: 0,
              },
            ],
            meta: { page: 1, pageSize: 100, total: 1 },
          },
        };
      }

      return {
        data: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        },
      };
    });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const wrapper = mount(FornecedoresView, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });
    await flushMountedView();

    const cell = wrapper.find('[data-testid="fornecedor-cell-f-1-estabelecimento"]');
    await cell.trigger("click");

    expect(cell.classes()).toContain("bg-primary/10");

    await cell.trigger("keydown", {
      key: "c",
      ctrlKey: true,
    });
    await flushMountedView();

    expect(writeText).toHaveBeenCalledWith("FAZENDA SANTA BARBARA");

    await cell.trigger("click");
    expect(cell.classes()).not.toContain("bg-primary/10");
  });

  it("opens modal on double click and submits CAR update", async () => {
    mockGetByUrl((url) => {
      if (url === "/v1/fornecedores/summary") {
        return {
          data: {
            data: {
              totalFornecedores: 1,
              totalComCar: 0,
              totalSemCar: 1,
              gtasPendentes: 1,
              gtasPendentesSemCar: 1,
              fornecedoresComPendencias: 1,
            },
          },
        };
      }

      if (url === "/v1/fornecedores") {
        return {
          data: {
            data: [
              {
                idFornecedor: "f-1",
                nome: "Fornecedor Sem CAR",
                cpfCnpj: "12345678000100",
                codigoEstabelecimento: "001",
                municipio: "Cuiabá",
                uf: "MT",
                car: null,
                gtaPendentes: 1,
                gtaResolvidos: 0,
              },
            ],
            meta: { page: 1, pageSize: 100, total: 1 },
          },
        };
      }

      if (url.includes("/gta-pendencias")) {
        return {
          data: {
            data: [
              {
                numeroGta: "123",
                serieGta: "B",
                ufGta: "MT",
                status: "PENDENTE",
                motivo: "FORNECEDOR_SEM_CAR",
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1 },
          },
        };
      }

      return {
        data: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        },
      };
    });

    (http.patch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        data: {
          idFornecedor: "f-1",
          car: "MT-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          status: "COMPLETED",
          verified: true,
          carPersisted: "MT-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        },
      },
    });

    const wrapper = mount(FornecedoresView, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });
    await flushMountedView();

    const firstRow = wrapper.find('[data-testid="fornecedor-row-f-1"]');
    await firstRow.trigger("click");
    await flushMountedView();
    await firstRow.trigger("dblclick");
    await flushMountedView();

    expect(wrapper.text()).toContain("Fornecedor e GTAs vinculadas");
    expect(wrapper.text()).not.toContain(
      "Atualize o CAR para reduzir pendências associadas às GTAs.",
    );
    expect(wrapper.text()).toContain("Cod. estabelecimento");
    expect(wrapper.text()).toContain("001");
    expect(wrapper.text()).toContain("GTA 123 - Série B - UF MT");

    const input = wrapper.find('input[data-testid="fornecedor-car-input"]');
    await input.setValue("MT-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await wrapper.find('button[data-testid="fornecedor-car-save"]').trigger("click");

    expect(http.patch).toHaveBeenCalledWith("/v1/fornecedores/f-1/car", {
      car: "MT-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
  });

  it("shows pending GTAs loading state inside modal after double click", async () => {
    const gtaDeferred = deferred<{
      data: {
        data: Array<Record<string, unknown>>;
        meta: { page: number; pageSize: number; total: number };
      };
    }>();

    mockGetByUrl((url) => {
      if (url === "/v1/fornecedores/summary") {
        return {
          data: {
            data: {
              totalFornecedores: 1,
              totalComCar: 0,
              totalSemCar: 1,
              gtasPendentes: 1,
              gtasPendentesSemCar: 1,
              fornecedoresComPendencias: 1,
            },
          },
        };
      }

      if (url === "/v1/fornecedores") {
        return {
          data: {
            data: [
              {
                idFornecedor: "f-1",
                nome: "Fornecedor Sem CAR",
                cpfCnpj: "12345678000100",
                codigoEstabelecimento: "001",
                municipio: "Cuiabá",
                uf: "MT",
                car: null,
                gtaPendentes: 1,
                gtaResolvidos: 0,
              },
            ],
            meta: { page: 1, pageSize: 100, total: 1 },
          },
        };
      }

      if (url.includes("/gta-pendencias")) {
        return gtaDeferred.promise;
      }

      return {
        data: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        },
      };
    });

    const wrapper = mount(FornecedoresView, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });
    await flushMountedView();

    await wrapper.find('[data-testid="fornecedor-row-f-1"]').trigger("dblclick");
    await flushMountedView();

    expect(wrapper.find('[data-testid="modal-pendencias-loading"]').exists()).toBe(true);

    gtaDeferred.resolve({
      data: {
        data: [
          {
            numeroGta: "123",
            serieGta: "B",
            ufGta: "MT",
            status: "PENDENTE",
            motivo: "FORNECEDOR_SEM_CAR",
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1 },
      },
    });
    await flushMountedView();

    expect(wrapper.find('[data-testid="modal-pendencias-loading"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("GTA 123 - Série B - UF MT");
  });

  it("closes modal when clicking outside", async () => {
    mockGetByUrl((url) => {
      if (url === "/v1/fornecedores/summary") {
        return {
          data: {
            data: {
              totalFornecedores: 1,
              totalComCar: 0,
              totalSemCar: 1,
              gtasPendentes: 1,
              gtasPendentesSemCar: 1,
              fornecedoresComPendencias: 1,
            },
          },
        };
      }

      if (url === "/v1/fornecedores") {
        return {
          data: {
            data: [
              {
                idFornecedor: "f-1",
                nome: "Fornecedor Sem CAR",
                cpfCnpj: "12345678000100",
                codigoEstabelecimento: "001",
                municipio: "Cuiabá",
                uf: "MT",
                car: null,
                gtaPendentes: 1,
                gtaResolvidos: 0,
              },
            ],
            meta: { page: 1, pageSize: 100, total: 1 },
          },
        };
      }

      if (url.includes("/gta-pendencias")) {
        return {
          data: {
            data: [],
            meta: { page: 1, pageSize: 20, total: 0 },
          },
        };
      }

      return {
        data: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        },
      };
    });

    const wrapper = mount(FornecedoresView, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });
    await flushMountedView();

    await wrapper.find('[data-testid="fornecedor-row-f-1"]').trigger("dblclick");
    await flushMountedView();
    expect(wrapper.text()).toContain("Fornecedor e GTAs vinculadas");

    await wrapper.find('[data-testid="ui-dialog-overlay"]').trigger("click");
    await flushMountedView();

    expect(wrapper.text()).not.toContain("Fornecedor e GTAs vinculadas");
  });

  it("matches cpf/cnpj option search with and without mask", async () => {
    mockGetByUrl((url) => {
      if (url === "/v1/fornecedores/summary") {
        return {
          data: {
            data: {
              totalFornecedores: 2,
              totalComCar: 0,
              totalSemCar: 2,
              gtasPendentes: 2,
              gtasPendentesSemCar: 2,
              fornecedoresComPendencias: 2,
            },
          },
        };
      }

      if (url === "/v1/fornecedores") {
        return {
          data: {
            data: [
              {
                idFornecedor: "f-1",
                nome: "Fornecedor A",
                cpfCnpj: "51470154000188",
                codigoEstabelecimento: "001",
                municipio: "Cuiabá",
                uf: "MT",
                car: null,
                gtaPendentes: 1,
                gtaResolvidos: 0,
              },
              {
                idFornecedor: "f-2",
                nome: "Fornecedor B",
                cpfCnpj: "11111111000111",
                codigoEstabelecimento: "002",
                municipio: "Cuiabá",
                uf: "MT",
                car: null,
                gtaPendentes: 1,
                gtaResolvidos: 0,
              },
            ],
            meta: { page: 1, pageSize: 100, total: 2 },
          },
        };
      }

      return {
        data: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        },
      };
    });

    const wrapper = mount(FornecedoresView, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });
    await flushMountedView();

    await wrapper.find('[data-testid="column-menu-cpfCnpj"]').trigger("click");
    await wrapper.find('[data-testid="column-filter-input-cpfCnpj"]').setValue("51.470.154/0001-88");
    await flushMountedView();
    expect(wrapper.find('[data-testid="column-filter-option-cpfCnpj-0"]').exists()).toBe(true);
    await wrapper.find('[data-testid="column-filter-option-checkbox-cpfCnpj-0"]').setValue(true);
    await wrapper.find('[data-testid="column-filter-apply-cpfCnpj"]').trigger("click");
    await flushMountedView();

    expect(wrapper.text()).toContain("Fornecedor A");
    expect(wrapper.text()).not.toContain("Fornecedor B");
  });

  it("builds filter options from currently visible rows (showZero + other column filters)", async () => {
    mockGetByUrl((url) => {
      if (url === "/v1/fornecedores/summary") {
        return {
          data: {
            data: {
              totalFornecedores: 3,
              totalComCar: 0,
              totalSemCar: 3,
              gtasPendentes: 3,
              gtasPendentesSemCar: 3,
              fornecedoresComPendencias: 2,
            },
          },
        };
      }

      if (url === "/v1/fornecedores") {
        return {
          data: {
            data: [
              {
                idFornecedor: "f-1",
                nome: "Fornecedor A",
                cpfCnpj: "1201818605",
                codigoEstabelecimento: "001",
                municipio: "Cuiabá",
                uf: "MT",
                car: null,
                gtaPendentes: 1,
                gtaResolvidos: 0,
              },
              {
                idFornecedor: "f-2",
                nome: "Fornecedor B",
                cpfCnpj: "4056638110",
                codigoEstabelecimento: "002",
                municipio: "Sinop",
                uf: "MT",
                car: null,
                gtaPendentes: 0,
                gtaResolvidos: 0,
              },
              {
                idFornecedor: "f-3",
                nome: "Fornecedor C",
                cpfCnpj: "51470154000188",
                codigoEstabelecimento: "003",
                municipio: "Goiânia",
                uf: "GO",
                car: null,
                gtaPendentes: 2,
                gtaResolvidos: 0,
              },
            ],
            meta: { page: 1, pageSize: 100, total: 3 },
          },
        };
      }

      return {
        data: {
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        },
      };
    });

    const wrapper = mount(FornecedoresView, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });
    await flushMountedView();

    await wrapper.find('[data-testid="column-menu-cpfCnpj"]').trigger("click");
    await flushMountedView();
    expect(wrapper.find('[data-testid="column-menu-overlay"]').text()).toContain("1201818605");
    expect(wrapper.find('[data-testid="column-menu-overlay"]').text()).not.toContain("4056638110");

    await wrapper.find('[data-testid="column-menu-overlay"]').trigger("click");
    await flushMountedView();

    await wrapper.find('[data-testid="column-menu-municipio"]').trigger("click");
    await wrapper.find('[data-testid="column-filter-input-municipio"]').setValue("Cuiabá");
    await flushMountedView();
    await wrapper.find('[data-testid="column-filter-option-checkbox-municipio-0"]').setValue(true);
    await wrapper.find('[data-testid="column-filter-apply-municipio"]').trigger("click");
    await flushMountedView();

    await wrapper.find('[data-testid="column-menu-cpfCnpj"]').trigger("click");
    await flushMountedView();
    expect(wrapper.find('[data-testid="column-menu-overlay"]').text()).toContain("1201818605");
    expect(wrapper.find('[data-testid="column-menu-overlay"]').text()).not.toContain(
      "51.470.154/0001-88",
    );
  });

});
