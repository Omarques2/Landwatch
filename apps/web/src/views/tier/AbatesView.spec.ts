import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/views/tier/AbatesView.vue"), "utf8");

describe("AbatesView owner contract", () => {
  it("requires an owner and filters optional tier consumos by that owner", () => {
    expect(source).toContain("Combobox as UiCombobox");
    expect(source).toContain('v-model="form.proprietarioId"');
    expect(source).toContain("useProprietarios");
    expect(source).toContain("useTiers");
    expect(source).toContain("proprietarioId: form.proprietarioId");
    expect(source).toContain("Proprietário");
    expect(source).not.toContain("useAvailableTiers");
    expect(source).not.toContain("saldoOf");
  });
});
