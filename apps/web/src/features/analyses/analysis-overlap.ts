export type AnalysisOverlapStatus = "ready" | "pending";

export type DatasetOverlapSource = {
  hit: boolean;
  overlapPct?: number;
};

// Keep in sync with formatOverlapPct in the API PDF formatters.
export function formatOverlapPct(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "0%";
  if (pct < 0.01) return "<0,01%";
  if (pct >= 99.995) return "100%";
  return `${pct.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function getDatasetOverlapLabel(item: DatasetOverlapSource): string | null {
  if (!item.hit || typeof item.overlapPct !== "number") return null;
  return formatOverlapPct(item.overlapPct);
}

export function getLegendOverlapLabel(
  legendOverlap: Record<string, number> | null | undefined,
  code: string,
): string | null {
  const pct = legendOverlap?.[code];
  return typeof pct === "number" ? formatOverlapPct(pct) : null;
}
