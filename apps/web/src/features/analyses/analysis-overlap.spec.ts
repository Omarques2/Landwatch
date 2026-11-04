import { describe, expect, it } from "vitest";
import { formatOverlapPct, getDatasetOverlapLabel, getLegendOverlapLabel } from "./analysis-overlap";

describe("analysis-overlap", () => {
  it("formats overlap percentages in pt-BR", () => {
    expect(formatOverlapPct(12.345)).toBe("12,35%");
    expect(formatOverlapPct(0.004)).toBe("<0,01%");
    expect(formatOverlapPct(0)).toBe("0%");
    expect(formatOverlapPct(100.0000001)).toBe("100%");
  });

  it("returns a label only for hit items with a computed percentage", () => {
    expect(getDatasetOverlapLabel({ hit: true, overlapPct: 3.2 })).toBe("3,20%");
    expect(getDatasetOverlapLabel({ hit: false, overlapPct: 3.2 })).toBeNull();
    expect(getDatasetOverlapLabel({ hit: true })).toBeNull();
  });

  it("returns the legend badge label by legend code", () => {
    expect(getLegendOverlapLabel({ PRODES_2020: 12 }, "PRODES_2020")).toBe("12,00%");
    expect(getLegendOverlapLabel({ PRODES_2020: 12 }, "SICAR")).toBeNull();
    expect(getLegendOverlapLabel(undefined, "PRODES_2020")).toBeNull();
  });
});
