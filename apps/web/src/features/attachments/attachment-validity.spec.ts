import { describe, expect, it } from 'vitest';
import {
  addValidityPeriod,
  buildValidityPreview,
  resolveValidityPayload,
} from './attachment-validity';

describe('attachment validity helpers', () => {
  it('adds month and year periods preserving date-only output', () => {
    expect(addValidityPeriod('2026-04-21', 3, 'months')).toBe('2026-07-21');
    expect(addValidityPeriod('2026-04-21', 2, 'years')).toBe('2028-04-21');
  });

  it('resolves period and lifetime modes into API payload fields', () => {
    expect(
      resolveValidityPayload({
        mode: 'period',
        validFrom: '2026-04-21',
        validTo: '',
        periodValue: 6,
        periodUnit: 'months',
      }),
    ).toEqual({ validFrom: '2026-04-21', validTo: '2026-10-21' });

    expect(
      resolveValidityPayload({
        mode: 'lifetime',
        validFrom: '2026-04-21',
        validTo: '',
        periodValue: 1,
        periodUnit: 'years',
      }),
    ).toEqual({ validFrom: '2026-04-21', validTo: null });
  });

  it('builds a readable preview for the user', () => {
    expect(
      buildValidityPreview({ validFrom: '2026-04-21', validTo: '2026-10-21' }),
    ).toContain('21/04/2026');
    expect(
      buildValidityPreview({ validFrom: '2026-04-21', validTo: null }),
    ).toContain('vitalícia');
  });
});
