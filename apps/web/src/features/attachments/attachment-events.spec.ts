import { describe, expect, it } from 'vitest';
import {
  formatAttachmentEventPayload,
  getAttachmentEventLabel,
} from './attachment-events';

describe('attachment event helpers', () => {
  it('maps persisted event types to readable labels', () => {
    expect(getAttachmentEventLabel('CREATED')).toBe('Criado');
    expect(getAttachmentEventLabel('TARGET_APPROVED')).toBe('Aprovado');
    expect(getAttachmentEventLabel('ZIP_DOWNLOADED')).toBe('ZIP baixado');
  });

  it('formats simple payloads and falls back to pretty JSON for complex ones', () => {
    expect(
      formatAttachmentEventPayload({ status: 'APPROVED', reason: 'Documento válido' }),
    ).toContain('Status: APPROVED');

    expect(
      formatAttachmentEventPayload({ nested: { value: 1 }, list: [1, 2, 3] }),
    ).toContain('"nested"');
  });
});
