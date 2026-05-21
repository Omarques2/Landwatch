import { describe, expect, it } from "vitest";

import {
  buildPrintChipRows,
  formatPrintDatasetLabel,
  freezePrintMapFrame,
  hasFrozenPrintMapFrame,
  preferredPrintColumns,
  restorePrintMapFrame,
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

  it("temporarily replaces a print map frame with a compressed image", () => {
    const frame = document.createElement("div");
    frame.className = "print-map-frame";
    frame.style.position = "";
    const mapCanvas = document.createElement("canvas");
    mapCanvas.style.display = "block";
    frame.appendChild(mapCanvas);

    freezePrintMapFrame(frame, "data:image/jpeg;base64,abc123");

    const frozenImage = frame.querySelector<HTMLImageElement>("img[data-print-map-freeze='true']");
    expect(frozenImage?.src).toBe("data:image/jpeg;base64,abc123");
    expect(frozenImage?.style.objectFit).toBe("contain");
    expect(frozenImage?.style.objectPosition).toBe("center");
    expect(frozenImage?.style.position).toBe("static");
    expect(mapCanvas.style.display).toBe("none");
    expect(frame.dataset.printMapFrozen).toBe("true");
    expect(hasFrozenPrintMapFrame(frame)).toBe(true);

    restorePrintMapFrame(frame);

    expect(frame.querySelector("img[data-print-map-freeze='true']")).toBeNull();
    expect(mapCanvas.style.display).toBe("block");
    expect(frame.dataset.printMapFrozen).toBeUndefined();
    expect(hasFrozenPrintMapFrame(frame)).toBe(false);
  });

  it("updates the frozen image when a print map frame is frozen again", () => {
    const frame = document.createElement("div");
    frame.appendChild(document.createElement("canvas"));

    freezePrintMapFrame(frame, "data:image/jpeg;base64,old");
    freezePrintMapFrame(frame, "data:image/jpeg;base64,new");

    const frozenImages = frame.querySelectorAll("img[data-print-map-freeze='true']");
    expect(frozenImages).toHaveLength(1);
    expect((frozenImages[0] as HTMLImageElement).src).toBe("data:image/jpeg;base64,new");
  });
});
