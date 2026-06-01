import {
  ANALYSIS_DATASET_COLORS,
  colorForDataset,
  formatDatasetLabel,
} from "./analysis-colors";

describe("analysis-colors", () => {
  it("formats dataset codes into readable labels", () => {
    expect(formatDatasetLabel("PRODES_AMZ_2024")).toBe("Prodes Amz 2024");
    expect(formatDatasetLabel("prodes_cerrado_nb_2023")).toBe(
      "Prodes Cerrado Nb 2023",
    );
  });

  it("returns deterministic colors per dataset code", () => {
    const first = colorForDataset("PRODES_AMZ_2024");
    const second = colorForDataset("PRODES_AMZ_2024");
    const other = colorForDataset("UCS_SNIRH");
    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^#/);
  });

  it("keeps dataset colors away from the red CAR outline", () => {
    expect(ANALYSIS_DATASET_COLORS).toEqual([
      "#0b5cad",
      "#007c91",
      "#00875a",
      "#3f7d20",
      "#5b8c00",
      "#706c00",
      "#1769aa",
      "#005f73",
      "#00796b",
      "#2e7d32",
      "#558b2f",
      "#827717",
      "#3949ab",
      "#5e35b1",
      "#7b1fa2",
      "#00838f",
      "#00695c",
      "#33691e",
      "#1565c0",
      "#4527a0",
    ]);
  });
});
