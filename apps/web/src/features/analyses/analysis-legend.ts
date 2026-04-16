import { colorForDataset, formatDatasetLabel } from "./analysis-colors";

export type DatasetGroup = {
  title: string;
  items: Array<{ datasetCode: string; hit: boolean; label?: string }>;
};

export type MapFeature = {
  categoryCode?: string;
  datasetCode?: string;
  featureId?: string | null;
  displayName?: string | null;
  naturalId?: string | null;
};

type LegendItem = {
  code: string;
  label: string;
  color: string;
};

export function isIndigenaFeature(feature?: MapFeature | null) {
  if (!feature) return false;
  const code = (feature.datasetCode ?? "").toUpperCase();
  const category = (feature.categoryCode ?? "").toUpperCase();
  return (
    category.includes("INDIG") ||
    code.includes("INDIG") ||
    (code.includes("TERRA") && code.includes("INDIG")) ||
    category === "TI" ||
    code.startsWith("TI_") ||
    code.startsWith("TI-")
  );
}

export function isUcsFeature(feature?: MapFeature | null) {
  if (!feature) return false;
  const code = (feature.datasetCode ?? "").toUpperCase();
  const category = (feature.categoryCode ?? "").toUpperCase();
  return (
    category.includes("UCS") ||
    category.includes("CONSERVAC") ||
    code.includes("UCS") ||
    code.includes("CONSERVAC")
  );
}

export function buildLegendCodes(
  mapFeatures: MapFeature[] | null | undefined,
  options?: { includeIndigena?: boolean; includeUcs?: boolean },
) {
  const includeIndigena = options?.includeIndigena !== false;
  const includeUcs = options?.includeUcs !== false;
  const features = (mapFeatures ?? []).filter((feature) => {
    if (!feature) return false;
    if ((feature.categoryCode ?? "").toUpperCase() === "SICAR") return false;
    if (!includeIndigena && isIndigenaFeature(feature)) return false;
    if (!includeUcs && isUcsFeature(feature)) return false;
    return true;
  });
  return Array.from(
    new Set(
      features
        .map((feature) => feature.datasetCode)
        .filter((code): code is string => Boolean(code)),
    ),
  );
}

export function buildUcsLegendItems(
  mapFeatures: MapFeature[] | null | undefined,
): LegendItem[] {
  const features = (mapFeatures ?? []).filter((feature) => isUcsFeature(feature));
  if (features.length === 0) return [];

  const byCode = new Map<string, string>();
  for (const feature of features) {
    const code = getUcsLegendCode(feature);
    const label = getUcsDisplayName(feature);
    if (!code || !label || byCode.has(code)) continue;
    byCode.set(code, label);
  }
  const ordered = Array.from(byCode.entries())
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const total = ordered.length;
  return ordered.map((item, index) => ({
    code: item.code,
    label: item.label,
    color: colorForUcsLegendItem(index, total),
  }));
}

export function buildIndigenaLegendItems(
  datasetGroups: DatasetGroup[] | null | undefined,
  mapFeatures: MapFeature[] | null | undefined,
): LegendItem[] {
  const normalizeLabel = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const groups = datasetGroups ?? [];
  const environmental = groups.find((group) => group.title === "Análise Ambiental");
  const items =
    environmental?.items.filter((item) =>
      normalizeLabel(item.label ?? "").startsWith("terra indigena"),
    ) ?? [];
  const hitsOnly = items.filter((item) => item.hit);
  if (hitsOnly.length === 0) return [];
  const features = mapFeatures ?? [];
  const indigenaFeature = features.find((feature) => isIndigenaFeature(feature));
  const color = colorForDataset(indigenaFeature?.datasetCode ?? "INDIGENAS");
  return hitsOnly.map((item) => ({
    code: item.datasetCode,
    label: item.label ?? formatDatasetLabel(item.datasetCode),
    color,
  }));
}

function normalizeLegendLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function getUcsDisplayName(feature?: MapFeature | null): string | null {
  if (!feature || !isUcsFeature(feature)) return null;
  const displayName = (feature.displayName ?? "").trim();
  if (displayName) return displayName;
  const naturalId = (feature.naturalId ?? "").trim();
  if (naturalId) return naturalId;
  const datasetCode = (feature.datasetCode ?? "").trim();
  if (!datasetCode) return null;
  const featureId = (feature.featureId ?? "").trim();
  return featureId ? `${datasetCode}:${featureId}` : `${datasetCode}:UNKNOWN`;
}

export function getUcsLegendCode(feature?: MapFeature | null): string | null {
  const label = getUcsDisplayName(feature);
  if (!label) return null;
  return `UCS_${normalizeLegendLabel(label)}`;
}

export function colorForUcsLegendItem(index: number, total: number): string {
  const size = total > 0 ? total : 1;
  const hue = ((index * 360) / size + 23) % 360;
  return `hsl(${hue.toFixed(2)} 72% 43%)`;
}
