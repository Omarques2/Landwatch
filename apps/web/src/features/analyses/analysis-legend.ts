import { colorForDataset, formatDatasetLabel } from "./analysis-colors";

export type DatasetGroup = {
  title: string;
  items: Array<{ datasetCode: string; hit: boolean; label?: string }>;
};

export type MapFeature = {
  categoryCode?: string;
  datasetCode?: string;
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
  datasetGroups: DatasetGroup[] | null | undefined,
  mapFeatures: MapFeature[] | null | undefined,
): LegendItem[] {
  const normalizeLabel = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const groups = datasetGroups ?? [];
  const ucsGroup = groups.find(
    (group) => normalizeLabel(group.title ?? "") === "unidades de conservacao",
  );
  const items = (ucsGroup?.items ?? []).filter((item) => item.hit);
  if (items.length === 0) return [];

  const byLabel = new Map<string, { datasetCode: string; label: string }>();
  for (const item of items) {
    const label = (item.label ?? formatDatasetLabel(item.datasetCode)).trim();
    if (!label) continue;
    const key = normalizeLabel(label);
    if (!byLabel.has(key)) {
      byLabel.set(key, { datasetCode: item.datasetCode, label });
    }
  }

  const features = mapFeatures ?? [];
  const ucsFeature = features.find((feature) => isUcsFeature(feature));
  const color = colorForDataset(ucsFeature?.datasetCode ?? "UNIDADES_CONSERVACAO");

  const legendItems = Array.from(byLabel.entries()).map(([key, item]) => ({
    code: `UCS_${key}`,
    label: item.label,
    color,
  }));
  legendItems.sort((a, b) => a.label.localeCompare(b.label));
  return legendItems;
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
