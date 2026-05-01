import type {
  AttachmentListItem,
  AttachmentScope,
  AttachmentStatus,
  AttachmentTargetStatus,
  FeatureAttachmentMatchedTarget,
} from './types';

export const ATTACHMENT_SCOPE_DISPLAY_ORDER: AttachmentScope[] = [
  'PLATFORM_FEATURE',
  'PLATFORM_CAR',
  'ORG_FEATURE',
  'ORG_CAR',
];

export function formatDatePtBr(value: string | null | undefined) {
  if (!value) return 'Sem data';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function formatDateTimePtBr(value: string | null | undefined) {
  if (!value) return 'Sem registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function formatBytes(value: string | number | null | undefined) {
  const numeric = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = numeric;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function getAttachmentScopeLabel(scope: AttachmentScope) {
  if (scope === 'ORG_FEATURE') return 'Feição da organização';
  if (scope === 'ORG_CAR') return 'CAR da organização';
  if (scope === 'PLATFORM_FEATURE') return 'Feição da plataforma';
  return 'CAR da plataforma';
}

export function isOrgAttachmentScope(scope: AttachmentScope) {
  return scope === 'ORG_FEATURE' || scope === 'ORG_CAR';
}

export function getAttachmentScopeSelectOptions(
  allowedScopes: ReadonlyArray<AttachmentScope>,
  hasCar: boolean,
) {
  const allowed = new Set(allowedScopes);
  const options = ATTACHMENT_SCOPE_DISPLAY_ORDER
    .filter((scope) => allowed.has(scope))
    .filter((scope) => (scope.endsWith('_CAR') ? hasCar : true))
    .map((scope) => ({
      value: scope,
      label: getAttachmentScopeLabel(scope),
      disabled: false,
    }));
  const hasPlatformOption = options.some((option) => !isOrgAttachmentScope(option.value));
  return options.map((option) => ({
    ...option,
    disabled: hasPlatformOption && isOrgAttachmentScope(option.value),
  }));
}

export function getDefaultAttachmentScope(
  allowedScopes: ReadonlyArray<AttachmentScope>,
  hasCar: boolean,
) {
  const options = getAttachmentScopeSelectOptions(allowedScopes, hasCar);
  return options.find((option) => !option.disabled)?.value ?? options[0]?.value ?? 'ORG_FEATURE';
}

export function getAttachmentStatusLabel(status: AttachmentStatus) {
  if (status === 'APPROVED') return 'Aprovado';
  if (status === 'PARTIALLY_APPROVED') return 'Parcial';
  if (status === 'REJECTED') return 'Reprovado';
  if (status === 'REVOKED') return 'Revogado';
  return 'Pendente';
}

export function getTargetStatusLabel(status: AttachmentTargetStatus) {
  if (status === 'APPROVED') return 'Aprovado';
  if (status === 'REJECTED') return 'Reprovado';
  if (status === 'REMOVED') return 'Removido';
  return 'Pendente';
}

export function getAttachmentFileKind(contentType: string) {
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.startsWith('image/')) return 'image';
  return 'file';
}

export function pickFeatureAttributeEntries(
  attributes: Record<string, unknown>,
  limit = 6,
) {
  return Object.entries(attributes)
    .filter(([key, value]) => key.toLowerCase() !== 'path' && value !== null && value !== '')
    .slice(0, limit);
}

export function formatFeatureAttributeValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function describeTargetScope(targets: ReadonlyArray<FeatureAttachmentMatchedTarget>) {
  const uniqueScopes = Array.from(new Set(targets.map((target) => target.scope)));
  if (uniqueScopes.length === 1) {
    return getAttachmentScopeLabel(uniqueScopes[0] as AttachmentScope);
  }
  return `${targets.length} vínculos em escopos distintos`;
}

export function describeTargetValidity(targets: ReadonlyArray<FeatureAttachmentMatchedTarget>) {
  if (targets.length === 0) return 'Sem vigência';
  const uniqueValidity = Array.from(
    new Set(targets.map((target) => `${target.validFrom}|${target.validTo ?? ''}`)),
  );
  if (uniqueValidity.length > 1) {
    return `${targets.length} vínculos com vigências distintas`;
  }
  const [target] = targets;
  if (!target) return 'Sem vigência';
  if (!target.validTo) {
    return `Desde ${formatDatePtBr(target.validFrom)} • vitalício`;
  }
  return `${formatDatePtBr(target.validFrom)} até ${formatDatePtBr(target.validTo)}`;
}

export function isAttachmentExpired(
  attachment: Pick<AttachmentListItem, 'matchedTargets'>,
  referenceDate: string,
) {
  return attachment.matchedTargets.some(
    (target) => target.validTo !== null && target.validTo < referenceDate,
  );
}

export function getAttachmentHeaderTitle(attachment: AttachmentListItem) {
  return attachment.originalFilename || attachment.category.name;
}
