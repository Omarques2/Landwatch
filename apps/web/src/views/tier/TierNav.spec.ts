import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tierViewsDir = join(process.cwd(), "src/views/tier");

function readView(name: string) {
  return readFileSync(join(tierViewsDir, name), "utf8");
}

describe("tier sub-navigation placement", () => {
  const listViews = [
    "TierListView.vue",
    "ProprietariosView.vue",
    "FazendasView.vue",
    "FrigorificosView.vue",
    "AbatesView.vue",
  ];

  it.each(listViews)("renders TierNav as the first child of %s", (viewName) => {
    const source = readView(viewName);

    expect(source).toContain('import TierNav from "./TierNav.vue";');
    expect(source).toMatch(/<section[^>]*>\s*<TierNav\s*\/>/);
  });

  it("keeps the tier detail view without tabs", () => {
    expect(readView("TierDetailView.vue")).not.toContain("<TierNav");
  });
});
