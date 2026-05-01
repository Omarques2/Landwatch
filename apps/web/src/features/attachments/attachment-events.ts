import type { AttachmentEventType } from './types';

const EVENT_LABELS: Record<AttachmentEventType, string> = {
  CREATED: 'Criado',
  UPDATED: 'Atualizado',
  TARGET_ADDED: 'Vínculo adicionado',
  TARGET_UPDATED: 'Vínculo atualizado',
  TARGET_APPROVED: 'Aprovado',
  TARGET_REJECTED: 'Reprovado',
  TARGET_REMOVED: 'Vínculo removido',
  SCOPE_CHANGED: 'Escopo alterado',
  VALIDITY_CHANGED: 'Validade alterada',
  VISIBILITY_CHANGED: 'Visibilidade alterada',
  STATUS_CHANGED: 'Status alterado',
  REVOKED: 'Revogado',
  DOWNLOADED: 'Arquivo baixado',
  ZIP_DOWNLOADED: 'ZIP baixado',
  PUBLIC_ACCESS_GRANTED: 'Acesso público concedido',
  PUBLIC_ACCESS_DENIED: 'Acesso público negado',
};

function isFlatObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(
    (entry) =>
      entry === null ||
      ['string', 'number', 'boolean'].includes(typeof entry),
  );
}

function humanizeKey(key: string) {
  const normalized = key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function getAttachmentEventLabel(eventType: AttachmentEventType) {
  return EVENT_LABELS[eventType] ?? eventType;
}

export function formatAttachmentEventPayload(payload: unknown) {
  if (!payload) return '';
  if (isFlatObject(payload)) {
    return Object.entries(payload)
      .map(([key, value]) => `${humanizeKey(key)}: ${String(value)}`)
      .join(' • ');
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}
