import type { FeatureAttachmentSummary } from './types';

type AttachmentSummaryInput = {
  isJustification: boolean;
  matchedTargets: Array<{
    status: string;
    validTo: string | null;
  }>;
};

export type FeatureAttachmentHeaderBadge = {
  kind: 'approved' | 'pending' | 'expired' | 'informative';
  label: string;
  count: number;
};

export function buildFeatureAttachmentSummary(
  attachments: ReadonlyArray<AttachmentSummaryInput>,
  referenceDate: string,
): FeatureAttachmentSummary {
  return attachments.reduce<FeatureAttachmentSummary>(
    (summary, attachment) => {
      summary.totalAttachments += 1;
      if (attachment.isJustification) {
        summary.justificationCount += 1;
      } else {
        summary.informativeCount += 1;
      }

      const hasApproved = attachment.matchedTargets.some((target) => target.status === 'APPROVED');
      const hasPending = attachment.matchedTargets.some((target) => target.status === 'PENDING');
      const hasExpired = attachment.matchedTargets.some(
        (target) => target.validTo !== null && target.validTo < referenceDate,
      );

      if (hasApproved) summary.approvedCount += 1;
      if (hasPending) summary.pendingCount += 1;
      if (hasExpired) summary.expiredCount += 1;
      return summary;
    },
    {
      totalAttachments: 0,
      approvedCount: 0,
      pendingCount: 0,
      informativeCount: 0,
      justificationCount: 0,
      expiredCount: 0,
    },
  );
}

export function deriveFeatureAttachmentHeaderBadges(
  summary: FeatureAttachmentSummary,
): FeatureAttachmentHeaderBadge[] {
  const badges: FeatureAttachmentHeaderBadge[] = [];
  if (summary.approvedCount > 0) {
    badges.push({ kind: 'approved', label: 'Aprovado', count: summary.approvedCount });
  }
  if (summary.pendingCount > 0) {
    badges.push({ kind: 'pending', label: 'Pendente', count: summary.pendingCount });
  }
  if (summary.expiredCount > 0) {
    badges.push({ kind: 'expired', label: 'Vencido', count: summary.expiredCount });
  }
  if (summary.informativeCount > 0) {
    badges.push({
      kind: 'informative',
      label: 'Informativo',
      count: summary.informativeCount,
    });
  }
  return badges;
}
