import { describe, expect, it } from "vitest";

import {
  buildPrintChipRows,
  formatPrintDatasetLabel,
  preferredPrintColumns,
} from "./analysis-print";

describe("analysis-print", () => {
  it("removes the Prodes prefix from print labels", () => {
    expect(formatPrintDatasetLabel("Prodes Amazon Nb 2008")).toBe(
      "Amazon Nb 2008",
    );
    expect(formatPrintDatasetLabel("  Prodes Mata Atlantica Nb 2024  ")).toBe(
      "Mata Atlantica Nb 2024",
    );
  });

  it("assigns fewer columns per row to longer labels", () => {
    expect(preferredPrintColumns("Reserva de Desenvolvimento Sustentável")).toBe(3);
    expect(
      preferredPrintColumns("Área de Relevante Interesse Ecológico"),
    ).toBe(3);
  });

  it("keeps short and medium labels in five columns when they still fit", () => {
    expect(preferredPrintColumns("Parque")).toBe(5);
    expect(preferredPrintColumns("Monumento Natural")).toBe(5);
    expect(preferredPrintColumns("Reserva Extrativista")).toBe(5);
    expect(preferredPrintColumns("Área de Proteção Ambiental")).toBe(5);
    expect(preferredPrintColumns("Amazon Nb 2008")).toBe(5);
  });

  it("packs rows with five columns whenever labels fit that density", () => {
    const rows = buildPrintChipRows(
      [
        { id: "a", label: "Reserva de Fauna" },
        { id: "b", label: "Floresta" },
        { id: "c", label: "Parque" },
        { id: "d", label: "Área de Proteção Ambiental" },
        { id: "e", label: "Reserva Extrativista" },
        { id: "f", label: "Estação Ecológica" },
        { id: "g", label: "Monumento Natural" },
        { id: "h", label: "Reserva Biológica" },
      ],
      (item) => item.label,
    );

    expect(rows).toEqual([
      {
        columns: 5,
        items: [
          { id: "d", label: "Área de Proteção Ambiental" },
          { id: "e", label: "Reserva Extrativista" },
          { id: "f", label: "Estação Ecológica" },
          { id: "g", label: "Monumento Natural" },
          { id: "h", label: "Reserva Biológica" },
        ],
      },
      {
        columns: 5,
        items: [
          { id: "a", label: "Reserva de Fauna" },
          { id: "b", label: "Floresta" },
          { id: "c", label: "Parque" },
        ],
      },
    ]);
  });
});
