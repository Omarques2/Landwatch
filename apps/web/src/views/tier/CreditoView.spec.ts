import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/views/tier/CreditoView.vue"), "utf8");

describe("CreditoView contract", () => {
  it("renders the aggregate summary and owner drill-down", () => {
    expect(source).toMatch(/<section[^>]*>\s*<TierNav\s*\/>/);
    expect(source).toContain("useCreditos");
    expect(source).toContain("useTiers");
    expect(source).toContain('status: "APROVADO"');
    expect(source).toContain("useAbates");
    expect(source).toContain("abate.proprietarioId === expandedId.value");
    expect(source).toContain("Proprietário");
    expect(source).toContain("Aprovados");
    expect(source).toContain("Abatidos");
    expect(source).toContain("Crédito restante");
    expect(source).toContain("text-red-600");
  });
});
