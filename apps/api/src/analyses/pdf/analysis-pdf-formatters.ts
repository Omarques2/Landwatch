export type AnalysisJustificationStatus = 'none' | 'partial' | 'full';

export type AnalysisDatasetStatusKind = 'ok' | 'hit' | 'partial' | 'justified';

export const ANALYSIS_DATASET_STATUS_KIND_ORDER: AnalysisDatasetStatusKind[] = [
  'ok',
  'justified',
  'partial',
  'hit',
];

export type AnalysisDatasetStatusSource = {
  hit: boolean;
  hasJustification?: boolean;
  justificationStatus?: AnalysisJustificationStatus;
  totalHits?: number;
  justifiedHits?: number;
};

type RankedPrintChip<T> = {
  item: T;
  label: string;
  preferredColumns: number;
};

function titleCaseWord(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function toTitleCase(value?: string | null): string {
  return (value ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ')
    .trim();
}

export function formatDatasetLabel(code: string): string {
  const cleaned = (code ?? '')
    .replace(/[-.]/g, ' ')
    .replace(/__+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => (/\d{4}$/.test(part) ? part : titleCaseWord(part)))
    .join(' ')
    .trim();
}

export function formatPrintDatasetLabel(label: string): string {
  return label
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^Prodes\s+/i, '')
    .trim();
}

export function preferredPrintColumns(label: string): number {
  const normalized = formatPrintDatasetLabel(label);
  if (!normalized) return 5;
  if (normalized.length >= 44) return 2;
  if (normalized.length >= 36) return 3;
  if (normalized.length >= 30) return 4;
  return 5;
}

export function buildPrintChipRows<T>(
  items: T[],
  getLabel: (item: T) => string,
): Array<{ columns: number; items: T[] }> {
  const ranked: RankedPrintChip<T>[] = items
    .map((item) => {
      const label = formatPrintDatasetLabel(getLabel(item));
      return {
        item,
        label,
        preferredColumns: preferredPrintColumns(label),
      };
    })
    .sort((left, right) => {
      if (left.preferredColumns !== right.preferredColumns) {
        return right.preferredColumns - left.preferredColumns;
      }
      if (left.label.length !== right.label.length) {
        return right.label.length - left.label.length;
      }
      return left.label.localeCompare(right.label, 'pt-BR');
    });

  const rows: Array<{ columns: number; items: T[] }> = [];

  while (ranked.length > 0) {
    const lead = ranked.shift();
    if (!lead) break;
    const columns = lead.preferredColumns;
    const rowItems: T[] = [lead.item];
    for (let index = 0; index < ranked.length && rowItems.length < columns; ) {
      const current = ranked[index];
      if (current && current.preferredColumns >= columns) {
        rowItems.push(current.item);
        ranked.splice(index, 1);
        continue;
      }
      index += 1;
    }
    rows.push({ columns, items: rowItems });
  }

  return rows;
}

export const ANALYSIS_DATASET_COLORS = [
  '#0b5cad',
  '#007c91',
  '#00875a',
  '#3f7d20',
  '#5b8c00',
  '#706c00',
  '#1769aa',
  '#005f73',
  '#00796b',
  '#2e7d32',
  '#558b2f',
  '#827717',
  '#3949ab',
  '#5e35b1',
  '#7b1fa2',
  '#00838f',
  '#00695c',
  '#33691e',
  '#1565c0',
  '#4527a0',
];

export function colorForDataset(code: string): string {
  const input = (code ?? '').toUpperCase();
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % ANALYSIS_DATASET_COLORS.length;
  return ANALYSIS_DATASET_COLORS[index] ?? '#0b5cad';
}

export function colorForUcsLegendItem(index: number, total: number): string {
  const size = total > 0 ? total : 1;
  const hue = 92 + (index * 250) / size;
  return `hsl(${hue.toFixed(2)} 70% 36%)`;
}

export function getAnalysisDatasetStatusKind(
  item: AnalysisDatasetStatusSource,
): AnalysisDatasetStatusKind {
  if (item.justificationStatus === 'full') return 'justified';
  if (item.justificationStatus === 'partial') return 'partial';
  if (item.hasJustification) return 'justified';
  return item.hit ? 'hit' : 'ok';
}

export function getAnalysisDatasetStatusLabel(kind: AnalysisDatasetStatusKind) {
  if (kind === 'ok') return 'Sem interseção';
  if (kind === 'partial') return 'Parcialmente justificada';
  if (kind === 'hit') return 'Com interseção';
  return 'Com justificativa';
}

export function getAnalysisDatasetLegendKinds(
  groups:
    | Array<{ items?: AnalysisDatasetStatusSource[] | null }>
    | null
    | undefined,
): AnalysisDatasetStatusKind[] {
  if (!groups?.length) return ['ok'];
  const kinds = new Set<AnalysisDatasetStatusKind>();
  for (const group of groups) {
    for (const item of group.items ?? []) {
      kinds.add(getAnalysisDatasetStatusKind(item));
    }
  }
  if (!kinds.size) return ['ok'];
  return ANALYSIS_DATASET_STATUS_KIND_ORDER.filter((kind) => kinds.has(kind));
}

export type AnalysisLegendFeature = {
  categoryCode?: string | null;
  datasetCode?: string | null;
  featureId?: string | null;
  displayName?: string | null;
  naturalId?: string | null;
};

export function isUcsFeature(feature?: AnalysisLegendFeature | null) {
  if (!feature) return false;
  const category = (feature.categoryCode ?? '').toUpperCase();
  const code = (feature.datasetCode ?? '').toUpperCase();
  return (
    category.includes('UCS') ||
    category.includes('CONSERVAC') ||
    code.includes('UCS') ||
    code.includes('CONSERVAC')
  );
}

export function getUcsDisplayName(feature?: AnalysisLegendFeature | null) {
  if (!feature || !isUcsFeature(feature)) return null;
  const displayName = (feature.displayName ?? '').trim();
  if (displayName) return displayName;
  const naturalId = (feature.naturalId ?? '').trim();
  if (naturalId) return naturalId;
  const datasetCode = (feature.datasetCode ?? '').trim();
  if (!datasetCode) return null;
  const featureId = (feature.featureId ?? '').trim();
  return featureId ? `${datasetCode}:${featureId}` : `${datasetCode}:UNKNOWN`;
}

function normalizeLegendLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function getUcsLegendCode(feature?: AnalysisLegendFeature | null) {
  const label = getUcsDisplayName(feature);
  if (!label) return null;
  return `UCS_${normalizeLegendLabel(label)}`;
}

export function buildUcsLegendItems(
  features: AnalysisLegendFeature[] | null | undefined,
) {
  const byCode = new Map<string, { code: string; label: string }>();
  for (const feature of features ?? []) {
    if (!isUcsFeature(feature)) continue;
    const code = getUcsLegendCode(feature);
    const label = getUcsDisplayName(feature);
    if (!code || !label || byCode.has(code)) continue;
    byCode.set(code, { code, label });
  }
  const ordered = Array.from(byCode.values()).sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR'),
  );
  const total = ordered.length || 1;
  return ordered.map((item, index) => ({
    ...item,
    color: colorForUcsLegendItem(index, total),
  }));
}

export function getJustificationCoverageSummary(
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

export function formatDate(value?: string | Date | null) {
  if (!value) return '-';
  const raw =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  if (y && m && d) return `${d}/${m}/${y}`;
  return raw;
}

export function formatMunicipio(municipio?: string | null, uf?: string | null) {
  if (!municipio && !uf) return '-';
  if (municipio && uf) return `${municipio} - ${uf}`;
  return municipio ?? uf ?? '-';
}

export function formatBiomas(biomas?: string[] | null) {
  if (!biomas?.length) return '-';
  return biomas.map((bioma) => fixMojibake(bioma)).join(', ');
}

export function formatCoordinates(
  coords?: { lat: number; lng: number } | null,
) {
  if (!coords) return '-';
  return `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
}

export function formatAreaHa(value: number | null) {
  if (!value) return '-';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatStatusLabel(status?: string | null) {
  if (!status) return '';
  if (status === 'AT') return 'Ativo';
  if (status === 'PE') return 'Pendente';
  if (status === 'SU') return 'Suspenso';
  if (status === 'CA') return 'Cancelado';
  return status;
}

export function normalizeDigits(value: string) {
  return value.replace(/\D/g, '');
}

export function formatCpf(value: string) {
  const digits = normalizeDigits(value);
  if (digits.length !== 11) return '';
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCnpj(value: string) {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  const padded = digits.length < 14 ? digits.padStart(14, '0') : digits;
  if (padded.length !== 14) return '';
  return `${padded.slice(0, 2)}.${padded.slice(2, 5)}.${padded.slice(5, 8)}/${padded.slice(8, 12)}-${padded.slice(12)}`;
}

export function fixMojibake(value: string) {
  if (!value) return value;
  if (!/[ÃÂ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return value;
  }
}

export function buildPdfFilename(input: {
  id: string;
  farmName?: string | null;
  analysisDate?: string | Date | null;
}) {
  const farm = (input.farmName || 'Analise')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const date =
    input.analysisDate instanceof Date
      ? input.analysisDate.toISOString().slice(0, 10)
      : String(input.analysisDate ?? '').slice(0, 10);
  const suffix = [farm, date, input.id].filter(Boolean).join('-');
  return `${suffix ? `Sigfarm-LandWatch-${suffix}` : 'Sigfarm-LandWatch'}.pdf`;
}
