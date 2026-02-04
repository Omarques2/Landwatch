import { describe, expect, it } from "vitest";
import {
  buildIndigenaLegendItems,
  buildLegendCodes,
} from "@/features/analyses/analysis-legend";

describe("analysis-legend", () => {
  it("includes only indigenous phases with hits", () => {
    const datasetGroups = [
      {
        title: "Análise Ambiental",
        items: [
          {
            datasetCode: "INDIGENAS_DECLARADA",
            hit: true,
            label: "Terra Indigena Declarada",
          },
          {
            datasetCode: "INDIGENAS_EM_ESTUDO",
            hit: false,
            label: "Terra Indigena Em Estudo",
          },
        ],
      },
    ];
    const mapFeatures = [
      { categoryCode: "INDIGENAS", datasetCode: "INDIGENAS_DECLARADA" },
    ];

    const items = buildIndigenaLegendItems(datasetGroups, mapFeatures);

    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Terra Indigena Declarada");
  });

  it("excludes generic indigenous datasets when phases are shown", () => {
    const mapFeatures = [
      { categoryCode: "INDIGENAS", datasetCode: "INDIGENAS" },
      { categoryCode: "PRODES", datasetCode: "PRODES_CERRADO_NB_2020" },
    ];

    const codes = buildLegendCodes(mapFeatures, { includeIndigena: false });

    expect(codes).toEqual(["PRODES_CERRADO_NB_2020"]);
  });

  it("detects accented indigenous labels when building legend items", () => {
    const datasetGroups = [
      {
        title: "Análise Ambiental",
        items: [
          {
            datasetCode: "INDIGENAS_DECLARADA",
            hit: true,
            label: "Terra Indígena Declarada",
          },
        ],
      },
    ];

    const items = buildIndigenaLegendItems(datasetGroups, []);

    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Terra Indígena Declarada");
  });
});
