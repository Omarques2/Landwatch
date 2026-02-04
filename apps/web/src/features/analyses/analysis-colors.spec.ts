import { colorForDataset, formatDatasetLabel } from "./analysis-colors";

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
});
