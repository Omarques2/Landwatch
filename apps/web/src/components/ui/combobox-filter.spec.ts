import { describe, it, expect } from "vitest";
import { filterOptions } from "./combobox-filter";

const opts = [
  { value: "1", label: "Fazenda Laguna" },
  { value: "2", label: "Fazenda Merola" },
  { value: "3", label: "Sítio Santa Cruz" },
];

describe("filterOptions", () => {
  it("returns all when term is empty", () => {
    expect(filterOptions(opts, "")).toHaveLength(3);
    expect(filterOptions(opts, "   ")).toHaveLength(3);
  });

  it("filters by label case-insensitively", () => {
    expect(filterOptions(opts, "faz").map((o) => o.value)).toEqual(["1", "2"]);
    expect(filterOptions(opts, "SANTA")).toEqual([{ value: "3", label: "Sítio Santa Cruz" }]);
  });
});
