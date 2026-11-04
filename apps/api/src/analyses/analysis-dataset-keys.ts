// Shared rules that map analysis results to the dataset items shown in
// datasetGroups. Used by AnalysisDetailService and AnalysisOverlapService so
// overlap percentages are keyed exactly like the rendered items.

export const LDI_ITEM_KEY = 'LDI_SEMAS';

export function toDatasetToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export function buildIndigenaItemKey(phase: string) {
  return `INDIGENAS_${toDatasetToken(phase) || 'FASE'}`;
}

export function buildUcsItemKey(category: string) {
  return `UCS_${toDatasetToken(category) || 'CATEGORIA'}`;
}

export function isIndigenaDataset(
  categoryCode?: string | null,
  datasetCode?: string | null,
) {
  const category = (categoryCode ?? '').toUpperCase();
  const code = (datasetCode ?? '').toUpperCase();
  if (category === 'TI') return true;
  if (code.startsWith('TI_') || code.startsWith('TI-')) return true;
  if (category.includes('TERRA') && category.includes('INDIG')) return true;
  if (code.includes('TERRA') && code.includes('INDIG')) return true;
  if (category.includes('INDIGEN')) return true;
  if (code.includes('INDIGEN')) return true;
  return false;
}

export function isUcsDataset(
  categoryCode?: string | null,
  datasetCode?: string | null,
) {
  const category = (categoryCode ?? '').toUpperCase();
  const code = (datasetCode ?? '').toUpperCase();
  if (category.includes('UCS') || category.includes('CONSERVAC')) return true;
  if (code.includes('UCS') || code.includes('CONSERVAC')) return true;
  return false;
}

export function isLdiDataset(
  categoryCode?: string | null,
  datasetCode?: string | null,
) {
  const category = (categoryCode ?? '').toUpperCase();
  const code = (datasetCode ?? '').toUpperCase();
  return category.startsWith('LDI') || code.includes('LDI');
}
