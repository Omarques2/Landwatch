import { describe, expect, it } from 'vitest';
import {
  getFallbackAttachmentTab,
  getVisibleAttachmentTabs,
  isAttachmentTabVisible,
} from './capabilities';
import type { AttachmentsCapabilities } from './types';

const commonCapabilities: AttachmentsCapabilities = {
  canUpload: true,
  canReview: false,
  canManageCategories: false,
  canManagePermissions: false,
  canViewAudit: false,
  allowedScopes: ['ORG_FEATURE', 'ORG_CAR'],
};

describe('attachments capabilities helpers', () => {
  it('shows only common tabs for a regular user', () => {
    const tabs = getVisibleAttachmentTabs(commonCapabilities).map((item) => item.key);
    expect(tabs).toEqual(['explore', 'mine']);
    expect(isAttachmentTabVisible('audit', commonCapabilities)).toBe(false);
    expect(getFallbackAttachmentTab(commonCapabilities)).toBe('explore');
  });

  it('shows review and admin tabs when permitted', () => {
    const tabs = getVisibleAttachmentTabs({
      ...commonCapabilities,
      canReview: true,
      canManageCategories: true,
      canManagePermissions: true,
      canViewAudit: true,
    }).map((item) => item.key);

    expect(tabs).toEqual([
      'explore',
      'mine',
      'pending',
      'categories',
      'permissions',
      'audit',
    ]);
  });
});
