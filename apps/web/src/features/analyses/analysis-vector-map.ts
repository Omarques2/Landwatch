import { colorForDataset } from "./analysis-colors";
import { colorForUcsLegendItem } from "./analysis-legend";

export const ANALYSIS_SICAR_OUTLINE_LAYER_ID = "analysis-sicar-line";

export const ANALYSIS_SICAR_OUTLINE_PAINT = {
  "line-color": "#ff0202",
  "line-width": 2,
  "line-opacity": 1,
  "line-dasharray": [1.3, 1.3],
};

export function moveAnalysisSicarOutlineLayersToFront(map: {
  getLayer: (layerId: string) => unknown;
  moveLayer: (layerId: string) => unknown;
}) {
  for (const layerId of [ANALYSIS_SICAR_OUTLINE_LAYER_ID]) {
    if (map.getLayer(layerId)) map.moveLayer(layerId);
  }
}

export type AnalysisOverlapCandidate = {
  datasetCode: string;
  featureId: string;
  label: string;
};

export const MAX_ANALYSIS_SELECTED_FEATURES = 20;

function analysisFeatureKey(feature: Pick<AnalysisOverlapCandidate, "datasetCode" | "featureId">) {
  return `${feature.datasetCode}:${feature.featureId}`;
}

export function updateAnalysisSelectedFeatures(
  current: ReadonlyArray<AnalysisOverlapCandidate>,
  candidate: AnalysisOverlapCandidate,
  additive: boolean,
): { selectedFeatures: AnalysisOverlapCandidate[]; limitReached: boolean } {
  const candidateKey = analysisFeatureKey(candidate);
  const candidateIndex = current.findIndex((item) => analysisFeatureKey(item) === candidateKey);

  if (!additive) {
    const shouldClear = current.length === 1 && candidateIndex === 0;
    return {
      selectedFeatures: shouldClear ? [] : [candidate],
      limitReached: false,
    };
  }

  if (candidateIndex >= 0) {
    return {
      selectedFeatures: current.filter((_, index) => index !== candidateIndex),
      limitReached: false,
    };
  }

  if (current.length >= MAX_ANALYSIS_SELECTED_FEATURES) {
    return {
      selectedFeatures: [...current],
      limitReached: true,
    };
  }

  return {
    selectedFeatures: [...current, candidate],
    limitReached: false,
  };
}

export function buildAnalysisSelectedFilterExpression(
  selectedFeatures: ReadonlyArray<Pick<AnalysisOverlapCandidate, "datasetCode" | "featureId">>,
) {
  if (!selectedFeatures.length) {
    return ["==", ["get", "feature_id"], "__none__"];
  }

  const filters = selectedFeatures.map((feature) => [
    "all",
    ["==", ["get", "dataset_code"], feature.datasetCode],
    ["==", ["to-string", ["get", "feature_id"]], feature.featureId],
  ]);
  return filters.length === 1 ? filters[0] : ["any", ...filters];
}

export function getAnalysisContextSelection(
  selectedFeatures: ReadonlyArray<AnalysisOverlapCandidate>,
  contextFeature: AnalysisOverlapCandidate,
) {
  return selectedFeatures.length ? [...selectedFeatures] : [contextFeature];
}

export function normalizeAnalysisOverlapCandidates(
  features: Array<Record<string, unknown>>,
): AnalysisOverlapCandidate[] {
  const unique = new Map<string, AnalysisOverlapCandidate>();
  for (const properties of features) {
    if (properties.is_sicar) continue;
    const datasetCode = String(properties.dataset_code ?? "").trim();
    const featureId = String(properties.feature_id ?? "").trim();
    if (!datasetCode || !featureId) continue;
    const key = `${datasetCode}:${featureId}`;
    if (unique.has(key)) continue;
    unique.set(key, {
      datasetCode,
      featureId,
      label:
        String(
          properties.display_name ??
            properties.natural_id ??
            properties.feature_key ??
            datasetCode,
        ).trim() || datasetCode,
    });
  }
  return Array.from(unique.values());
}

export type AnalysisVectorLegendItem = {
  code: string;
  kind: "dataset" | "indigena" | "ucs";
  label: string | null;
  datasetCode: string;
  featureIds: string[];
};

export type AnalysisVectorSource = {
  tiles: string[];
  bounds: [number, number, number, number];
  carBounds?: [number, number, number, number] | null;
  minzoom: number;
  maxzoom: number;
  sourceLayer: string;
  promoteId: string;
};

export type AnalysisVectorMap = {
  renderMode: "mvt";
  vectorSource: AnalysisVectorSource | null;
  legendItems: AnalysisVectorLegendItem[];
};

export type AnalysisLegendEntry = {
  code: string;
  label: string;
  color: string;
};

export function buildAnalysisLegendEntries(vectorMap: AnalysisVectorMap | null | undefined) {
  const legendItems = vectorMap?.legendItems ?? [];
  const ucsItems = legendItems.filter((item) => item.kind === "ucs");
  const totalUcs = ucsItems.length || 1;
  let ucsIndex = 0;

  const entries: AnalysisLegendEntry[] = [{ code: "SICAR", label: "CAR", color: "#ef4444" }];
  for (const item of legendItems) {
    if (item.kind === "ucs") {
      entries.push({
        code: item.code,
        label: item.label ?? item.datasetCode,
        color: colorForUcsLegendItem(ucsIndex, totalUcs),
      });
      ucsIndex += 1;
      continue;
    }
    entries.push({
      code: item.code,
      label: item.label ?? item.datasetCode,
      color: colorForDataset(item.datasetCode),
    });
  }
  return entries;
}
