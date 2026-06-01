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
const MAX_QUERY_TARGETS = 20;

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

function parseTarget(value: string) {
  const separatorIndex = value.indexOf(':');
  if (separatorIndex < 1) return null;
  const datasetCode = value.slice(0, separatorIndex).trim();
  const featureId = value.slice(separatorIndex + 1).trim();
  if (!datasetCode || !featureId) return null;
  return { datasetCode, featureId };
}

function targetKey(target: { datasetCode: string; featureId: string }) {
  return `${target.datasetCode}:${target.featureId}`;
}

function parseTargets(
  value: LocationQueryValue | LocationQueryValue[] | undefined,
) {
  const byKey = new Map<string, { datasetCode: string; featureId: string }>();
  for (const item of asStringArray(value)) {
    const target = parseTarget(item);
    if (!target) continue;
    byKey.set(targetKey(target), target);
    if (byKey.size >= MAX_QUERY_TARGETS) break;
  }
  return Array.from(byKey.values());
}

export function parseAttachmentsQueryState(query: LocationQuery): AttachmentsQueryState {
  const requestedTab = typeof query.tab === 'string' ? query.tab.trim() : '';
  const datasetCodes = Array.from(new Set(asStringArray(query.datasetCode)));
  const featureId = typeof query.featureId === 'string' ? query.featureId.trim() || null : null;
  const targets = parseTargets(query.target);
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
    targets,
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
    target: state.targets.length ? state.targets.map(targetKey) : undefined,
    fromAnalysisId: state.fromAnalysisId ?? undefined,
    carKey: state.carKey || undefined,
    q: state.q || undefined,
    intersectsCarOnly: state.intersectsCarOnly ? '1' : undefined,
  } satisfies LocationQueryRaw;
}
