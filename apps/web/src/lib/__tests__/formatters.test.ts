import { describe, expect, it } from "vitest";
import { toTitleCase } from "@/lib/formatters";

describe("toTitleCase", () => {
  it("returns empty string for nullish and empty values", () => {
    expect(toTitleCase(null)).toBe("");
    expect(toTitleCase(undefined)).toBe("");
    expect(toTitleCase("")).toBe("");
    expect(toTitleCase("   ")).toBe("");
  });

  it("normalizes spaces and title-cases latin words", () => {
    expect(toTitleCase("fazenda de teste desmatamento")).toBe("Fazenda De Teste Desmatamento");
    expect(toTitleCase("FAZENDA DE TESTE DESMATAMENTO")).toBe("Fazenda De Teste Desmatamento");
    expect(toTitleCase("  fazenda   são josé  ")).toBe("Fazenda São José");
  });

  it("handles hyphenated segments and mixed casing", () => {
    expect(toTitleCase("santa-helena")).toBe("Santa-Helena");
    expect(toTitleCase("FAZENDA   SÃO-JOSÉ do   vale")).toBe("Fazenda São-José Do Vale");
  });
});
