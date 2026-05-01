import { colorForDataset } from "./analysis-colors";
import { colorForUcsLegendItem } from "./analysis-legend";

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
