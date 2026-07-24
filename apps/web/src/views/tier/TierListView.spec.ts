import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/views/tier/TierListView.vue"), "utf8");

describe("TierListView per-sexo form", () => {
  it("captures per-sexo quantities on create", () => {
    expect(source).toContain("form.qtdMacho");
    expect(source).toContain("form.qtdFemea");
    expect(source).toContain("form.qtdIndefinido");
    expect(source).not.toContain('v-model.number="form.qtdAnimais"');
  });
});
