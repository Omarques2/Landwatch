export type AnalysisJustificationStatus = "none" | "partial" | "full";

export type AnalysisDatasetStatusKind =
  | "ok"
  | "hit"
  | "partial"
  | "justified";

export const ANALYSIS_DATASET_STATUS_KIND_ORDER: AnalysisDatasetStatusKind[] = [
  "ok",
  "justified",
  "partial",
  "hit",
];

export type AnalysisDatasetStatusSource = {
  hit: boolean;
  hasJustification?: boolean;
  justificationStatus?: AnalysisJustificationStatus;
  totalHits?: number;
  justifiedHits?: number;
};

export function getAnalysisDatasetStatusKind(
  item: AnalysisDatasetStatusSource,
): AnalysisDatasetStatusKind {
  if (item.justificationStatus === "full") return "justified";
  if (item.justificationStatus === "partial") return "partial";
  if (item.hasJustification) return "justified";
  return item.hit ? "hit" : "ok";
}

export function getAnalysisDatasetStatusLabel(
  kind: AnalysisDatasetStatusKind,
) {
  if (kind === "ok") return "Sem interseção";
  if (kind === "partial") return "Parcialmente justificada";
  if (kind === "hit") return "Com interseção";
  return "Com justificativa";
}

export function getAnalysisDatasetCoverageSummary(
  item: AnalysisDatasetStatusSource,
) {
  const totalHits = Number.isFinite(item.totalHits) ? Number(item.totalHits) : 0;
  const justifiedHits = Number.isFinite(item.justifiedHits)
    ? Number(item.justifiedHits)
    : 0;
  if (totalHits <= 0) return null;
  return `${justifiedHits} de ${totalHits} feições justificadas`;
}

export function getAnalysisJustificationCoverageSummary(
  groups: Array<{ items?: AnalysisDatasetStatusSource[] }> | null | undefined,
) {
  if (!groups?.length) return null;
  let totalHits = 0;
  let justifiedHits = 0;
  let hasCoverageData = false;

  for (const group of groups) {
    for (const item of group.items ?? []) {
      if (!Number.isFinite(item.totalHits)) continue;
      const itemTotalHits = Number(item.totalHits);
      if (itemTotalHits <= 0) continue;
      hasCoverageData = true;
      totalHits += itemTotalHits;
      justifiedHits += Number.isFinite(item.justifiedHits)
        ? Number(item.justifiedHits)
        : 0;
    }
  }

  if (!hasCoverageData || totalHits <= 0) return null;
  return `${justifiedHits} de ${totalHits}`;
}

export function getAnalysisDatasetLegendKinds(
  groups: Array<{ items?: AnalysisDatasetStatusSource[] }> | null | undefined,
): AnalysisDatasetStatusKind[] {
  if (!groups?.length) return ["ok"];

  const kinds = new Set<AnalysisDatasetStatusKind>();

  for (const group of groups) {
    for (const item of group.items ?? []) {
      kinds.add(getAnalysisDatasetStatusKind(item));
    }
  }

  if (!kinds.size) return ["ok"];
  return ANALYSIS_DATASET_STATUS_KIND_ORDER.filter((kind) => kinds.has(kind));
}
