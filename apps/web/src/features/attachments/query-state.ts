import type {
  LocationQuery,
  LocationQueryRaw,
  LocationQueryValue,
} from 'vue-router';
import type { AttachmentModuleTab, AttachmentsQueryState } from './types';

const TABS = new Set<AttachmentModuleTab>([
  'explore',
  'mine',
  'pending',
  'categories',
  'permissions',
  'audit',
]);

function asStringArray(
  value: LocationQueryValue | LocationQueryValue[] | undefined,
): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

export function parseAttachmentsQueryState(query: LocationQuery): AttachmentsQueryState {
  const requestedTab = typeof query.tab === 'string' ? query.tab.trim() : '';
  const datasetCodes = Array.from(new Set(asStringArray(query.datasetCode)));
  const featureId = typeof query.featureId === 'string' ? query.featureId.trim() || null : null;
  const fromAnalysisId =
    typeof query.fromAnalysisId === 'string'
      ? query.fromAnalysisId.trim() || null
      : null;
  const carKey = typeof query.carKey === 'string' ? query.carKey.trim() : '';
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const intersectsCarOnly =
    query.intersectsCarOnly === '1' ||
    query.intersectsCarOnly === 'true' ||
    (carKey.length > 0 && query.intersectsCarOnly == null);

  return {
    tab: TABS.has(requestedTab as AttachmentModuleTab)
      ? (requestedTab as AttachmentModuleTab)
      : 'explore',
    datasetCodes,
    featureId,
    fromAnalysisId,
    carKey,
    q,
    intersectsCarOnly,
  };
}

export function buildAttachmentsQueryState(
  state: AttachmentsQueryState,
): LocationQueryRaw {
  return {
    tab: state.tab,
    datasetCode: state.datasetCodes.length ? state.datasetCodes : undefined,
    featureId: state.featureId ?? undefined,
    fromAnalysisId: state.fromAnalysisId ?? undefined,
    carKey: state.carKey || undefined,
    q: state.q || undefined,
    intersectsCarOnly: state.intersectsCarOnly ? '1' : undefined,
  } satisfies LocationQueryRaw;
}
