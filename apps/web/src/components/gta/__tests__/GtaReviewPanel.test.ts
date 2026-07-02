import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import GtaReviewPanel from "../GtaReviewPanel.vue";

const gta: any = {
  numeroGta: "012345",
  serieGta: "A",
  ufGta: "GO",
  dataEmissao: "01/01/2024",
  sistema: "SIDAGO",
  origem: {
    nome: "X",
    cpfCnpj: "01279969156",
    estabelecimento: "FAZ",
    codigoEstabelecimento: "52016601239",
    municipio: "Novo Brasil",
    uf: "GO",
  },
  destino: {},
  status: "ok",
  warnings: [],
};

const CAR = "GO-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("GtaReviewPanel", () => {
  it("locks CAR when matched fornecedor has a CAR", () => {
    const match: any = {
      kind: "matched_with_car",
      fornecedor: {
        idFornecedor: "f1",
        nome: "X",
        cpfCnpj: "01279969156",
        codigoEstabelecimento: "52016601239",
        municipio: "Novo Brasil",
        uf: "GO",
        car: CAR,
      },
      candidates: [],
    };
    const w = mount(GtaReviewPanel, {
      props: { gta, match, submitting: false },
    });
    expect(
      w.get('[data-testid="gta-car"]').attributes("readonly"),
    ).toBeDefined();
    expect(
      (w.get('[data-testid="gta-car"]').element as HTMLInputElement).value,
    ).toContain("GO-1234567-");
  });

  it("disables generate until a valid CAR is entered (no match)", async () => {
    const match: any = { kind: "none", fornecedor: null, candidates: [] };
    const w = mount(GtaReviewPanel, {
      props: { gta, match, submitting: false },
    });
    const btn = w.get('[data-testid="gta-generate"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
    await w.get('[data-testid="gta-car"]').setValue(CAR);
    expect((btn.element as HTMLButtonElement).disabled).toBe(false);
  });

  it("emits generate with the selected candidate", async () => {
    const match: any = {
      kind: "ambiguous",
      fornecedor: null,
      candidates: [
        {
          idFornecedor: "f1",
          nome: "A",
          cpfCnpj: "01279969156",
          codigoEstabelecimento: "111",
          municipio: "A",
          uf: "GO",
          car: CAR,
        },
        {
          idFornecedor: "f2",
          nome: "B",
          cpfCnpj: "01279969156",
          codigoEstabelecimento: "222",
          municipio: "B",
          uf: "GO",
          car: null,
        },
      ],
    };
    const w = mount(GtaReviewPanel, {
      props: { gta, match, submitting: false },
    });
    await w.findAll('input[type="radio"]')[0]!.setValue();
    await w.get('[data-testid="gta-generate"]').trigger("click");
    expect(w.emitted("generate")?.[0]?.[0]).toMatchObject({
      matchKind: "matched_with_car",
      fornecedorId: "f1",
    });
  });
});
