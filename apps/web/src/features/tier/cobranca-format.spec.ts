import { describe, expect, it } from "vitest";
import { formatDateOnly, formatMoney, totalsForSelection } from "./cobranca-format";

describe("cobranca formatters", () => {
  it("formats money and date-only values without timezone shifts", () => {
    expect(formatMoney("180.00")).toContain("180,00");
    expect(formatDateOnly("2026-07-15T00:00:00.000Z")).toBe("15/07/2026");
  });

  it("calculates totals for the final selected set", () => {
    const items = [
      {
        tierId: "t1",
        qtdAnimais: 100,
        status: "SUBMETIDO",
        valorBase: "150.00",
        valorAdicional: "0.00",
        valorItem: "150.00",
      },
      {
        tierId: "t2",
        qtdAnimais: 100,
        status: "APROVADO",
        valorBase: "150.00",
        valorAdicional: "30.00",
        valorItem: "180.00",
      },
    ] as any;
    expect(totalsForSelection(items, ["t2"])).toEqual({
      valorBase: "150.00",
      valorAdicional: "30.00",
      valorTotal: "180.00",
      qtdAnimais: 100,
      qtdAprovados: 100,
    });
  });
});
