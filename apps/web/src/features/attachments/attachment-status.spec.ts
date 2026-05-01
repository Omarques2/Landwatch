import { describe, expect, it } from 'vitest';
import {
  buildFeatureAttachmentSummary,
  deriveFeatureAttachmentHeaderBadges,
} from './attachment-status';

const buildAttachment = (overrides = {}) => ({
  id: 'att-1',
  isJustification: true,
  matchedTargets: [
    {
      id: 'target-1',
      status: 'APPROVED',
      validFrom: '2026-01-01',
      validTo: null,
    },
  ],
  ...overrides,
});

describe('attachment status helpers', () => {
  it('builds summary counts across approved, pending, informative and expired attachments', () => {
    const summary = buildFeatureAttachmentSummary([
      buildAttachment(),
      buildAttachment({
        id: 'att-2',
        matchedTargets: [
          { id: 'target-2', status: 'PENDING', validFrom: '2026-01-01', validTo: null },
        ],
      }),
      buildAttachment({
        id: 'att-3',
        isJustification: false,
        matchedTargets: [
          { id: 'target-3', status: 'APPROVED', validFrom: '2026-01-01', validTo: '2026-01-10' },
        ],
      }),
    ], '2026-02-01');

    expect(summary).toEqual({
      totalAttachments: 3,
      approvedCount: 2,
      pendingCount: 1,
      informativeCount: 1,
      justificationCount: 2,
      expiredCount: 1,
    });
  });

  it('derives header badges from the feature summary', () => {
    const badges = deriveFeatureAttachmentHeaderBadges({
      totalAttachments: 3,
      approvedCount: 1,
      pendingCount: 1,
      informativeCount: 1,
      justificationCount: 2,
      expiredCount: 1,
    });

    expect(badges).toEqual([
      { kind: 'approved', label: 'Aprovado', count: 1 },
      { kind: 'pending', label: 'Pendente', count: 1 },
      { kind: 'expired', label: 'Vencido', count: 1 },
      { kind: 'informative', label: 'Informativo', count: 1 },
    ]);
  });
});
