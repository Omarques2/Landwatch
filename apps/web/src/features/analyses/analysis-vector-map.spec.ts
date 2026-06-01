import { describe, expect, it, vi } from "vitest";

import {
  ANALYSIS_SICAR_OUTLINE_LAYER_ID,
  ANALYSIS_SICAR_OUTLINE_PAINT,
  MAX_ANALYSIS_SELECTED_FEATURES,
  buildAnalysisSelectedFilterExpression,
  getAnalysisContextSelection,
  moveAnalysisSicarOutlineLayersToFront,
  normalizeAnalysisOverlapCandidates,
  updateAnalysisSelectedFeatures,
} from "./analysis-vector-map";

describe("analysis vector map CAR outline", () => {
  it("moves the dashed CAR outline above thematic layers", () => {
    const moveLayer = vi.fn();

    moveAnalysisSicarOutlineLayersToFront({
      getLayer: vi.fn().mockReturnValue({}),
      moveLayer,
    });

    expect(moveLayer.mock.calls).toEqual([[ANALYSIS_SICAR_OUTLINE_LAYER_ID]]);
  });

  it("uses an opaque dashed red outline without a continuous halo", () => {
    expect(ANALYSIS_SICAR_OUTLINE_PAINT).toMatchObject({
      "line-color": "#ff0202",
      "line-width": 2,
      "line-opacity": 1,
      "line-dasharray": [1.3, 1.3],
    });
  });
});

describe("analysis vector map overlap candidates", () => {
  it("keeps unique thematic features and excludes the CAR", () => {
    expect(
      normalizeAnalysisOverlapCandidates([
        {
          is_sicar: true,
          dataset_code: "SICAR",
          feature_id: "car-1",
          display_name: "CAR",
        },
        {
          is_sicar: false,
          dataset_code: "UNIDADES_CONSERVACAO",
          feature_id: "10",
          display_name: "Parque Nacional Teste",
        },
        {
          is_sicar: false,
          dataset_code: "UNIDADES_CONSERVACAO",
          feature_id: "10",
          display_name: "Parque Nacional Teste",
        },
        {
          is_sicar: false,
          dataset_code: "PRODES_AMZ_2024",
          feature_id: "20",
          display_name: "",
        },
      ]),
    ).toEqual([
      {
        datasetCode: "UNIDADES_CONSERVACAO",
        featureId: "10",
        label: "Parque Nacional Teste",
      },
      {
        datasetCode: "PRODES_AMZ_2024",
        featureId: "20",
        label: "PRODES_AMZ_2024",
      },
    ]);
  });
});

describe("analysis vector map feature selection", () => {
  const first = {
    datasetCode: "UNIDADES_CONSERVACAO",
    featureId: "10",
    label: "Parque Nacional Teste",
  };
  const second = {
    datasetCode: "PRODES_AMZ_2024",
    featureId: "20",
    label: "PRODES 2024",
  };

  it("keeps normal clicks as a single-selection toggle", () => {
    expect(updateAnalysisSelectedFeatures([first, second], first, false)).toEqual({
      selectedFeatures: [first],
      limitReached: false,
    });
    expect(updateAnalysisSelectedFeatures([first], first, false)).toEqual({
      selectedFeatures: [],
      limitReached: false,
    });
  });

  it("toggles one candidate without discarding previous items with Ctrl or Meta", () => {
    expect(updateAnalysisSelectedFeatures([first], second, true)).toEqual({
      selectedFeatures: [first, second],
      limitReached: false,
    });
    expect(updateAnalysisSelectedFeatures([first, second], first, true)).toEqual({
      selectedFeatures: [second],
      limitReached: false,
    });
  });

  it("preserves selection and reports limit when adding the twenty-first item", () => {
    const selectedFeatures = Array.from(
      { length: MAX_ANALYSIS_SELECTED_FEATURES },
      (_, index) => ({
        datasetCode: "DATASET",
        featureId: String(index),
        label: `Feição ${index}`,
      }),
    );

    expect(updateAnalysisSelectedFeatures(selectedFeatures, first, true)).toEqual({
      selectedFeatures,
      limitReached: true,
    });
  });

  it("builds an any filter matching all selected thematic features", () => {
    expect(buildAnalysisSelectedFilterExpression([first, second])).toEqual([
      "any",
      [
        "all",
        ["==", ["get", "dataset_code"], "UNIDADES_CONSERVACAO"],
        ["==", ["to-string", ["get", "feature_id"]], "10"],
      ],
      [
        "all",
        ["==", ["get", "dataset_code"], "PRODES_AMZ_2024"],
        ["==", ["to-string", ["get", "feature_id"]], "20"],
      ],
    ]);
  });

  it("keeps the current selection when the context target is outside it", () => {
    expect(getAnalysisContextSelection([first, second], first)).toEqual([first, second]);
    expect(
      getAnalysisContextSelection([first, second], {
        datasetCode: "OUTRO",
        featureId: "99",
        label: "Outra",
      }),
    ).toEqual([first, second]);
  });

  it("uses the context target when there is no previous selection", () => {
    expect(
      getAnalysisContextSelection([], {
        datasetCode: "OUTRO",
        featureId: "99",
        label: "Outra",
      }),
    ).toEqual([{ datasetCode: "OUTRO", featureId: "99", label: "Outra" }]);
  });
});
