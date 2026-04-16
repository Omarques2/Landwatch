import { describe, expect, it } from "vitest";
import {
  buildIndigenaLegendItems,
  buildLegendCodes,
  buildUcsLegendItems,
  getUcsLegendCode,
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

  it("builds UCS legend items from UCS feature displayName", () => {
    const mapFeatures = [
      {
        categoryCode: "UCS",
        datasetCode: "UNIDADES_CONSERVACAO",
        featureId: "10",
        displayName: "Parque Nacional Teste",
      },
      {
        categoryCode: "UCS",
        datasetCode: "UNIDADES_CONSERVACAO",
        featureId: "11",
        displayName: "Área de Proteção Ambiental Teste",
      },
    ];

    const items = buildUcsLegendItems(mapFeatures);

    expect(items).toHaveLength(2);
    expect(items[0]?.label).toBe("Área de Proteção Ambiental Teste");
    expect(items[1]?.label).toBe("Parque Nacional Teste");
    expect(items[0]?.color).not.toBe(items[1]?.color);
  });

  it("deduplicates UCS labels by normalized code and keeps deterministic colors", () => {
    const mapFeatures = [
      {
        categoryCode: "UCS",
        datasetCode: "UNIDADES_CONSERVACAO",
        featureId: "10",
        displayName: "Parque Nacional Teste",
      },
      {
        categoryCode: "UCS",
        datasetCode: "UNIDADES_CONSERVACAO",
        featureId: "11",
        displayName: "PARQUE NACIONAL TESTE",
      },
      {
        categoryCode: "UCS",
        datasetCode: "UNIDADES_CONSERVACAO",
        featureId: "12",
        displayName: "Área de Proteção Ambiental",
      },
    ];

    const first = buildUcsLegendItems(mapFeatures);
    const second = buildUcsLegendItems(mapFeatures);

    expect(first).toHaveLength(2);
    expect(first).toEqual(second);
  });

  it("builds UCS legend code fallback as datasetCode:featureId", () => {
    const code = getUcsLegendCode({
      categoryCode: "UCS",
      datasetCode: "UNIDADES_CONSERVACAO",
      featureId: "123",
      displayName: null,
      naturalId: null,
    });

    expect(code).toBe("UCS_unidades_conservacao:123");
  });

  it("excludes generic UCS dataset code from map legend when UCS labels are shown", () => {
    const mapFeatures = [
      { categoryCode: "UCS", datasetCode: "UNIDADES_CONSERVACAO" },
      { categoryCode: "PRODES", datasetCode: "PRODES_CERRADO_NB_2020" },
    ];

    const codes = buildLegendCodes(mapFeatures, {
      includeUcs: false,
    });

    expect(codes).toEqual(["PRODES_CERRADO_NB_2020"]);
  });
});
