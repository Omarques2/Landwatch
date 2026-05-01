import type {
  AttachmentModuleTab,
  AttachmentModuleTabDefinition,
  AttachmentsCapabilities,
} from './types';

export const ATTACHMENT_MODULE_TABS: ReadonlyArray<AttachmentModuleTabDefinition> = [
  {
    key: 'explore',
    label: 'Explorar',
    description: 'Disponível em breve.',
    availability: 'ready',
  },
  {
    key: 'mine',
    label: 'Meus anexos',
    description: 'Disponível em breve.',
    availability: 'planned',
  },
  {
    key: 'pending',
    label: 'Pendências',
    description: 'Disponível em breve.',
    availability: 'planned',
  },
  {
    key: 'categories',
    label: 'Categorias',
    description: 'Disponível em breve.',
    availability: 'planned',
  },
  {
    key: 'permissions',
    label: 'Permissões',
    description: 'Disponível em breve.',
    availability: 'planned',
  },
  {
    key: 'audit',
    label: 'Auditoria',
    description: 'Disponível em breve.',
    availability: 'planned',
  },
];

export function getVisibleAttachmentTabs(
  capabilities: AttachmentsCapabilities | null,
): AttachmentModuleTabDefinition[] {
  if (!capabilities) {
    return ATTACHMENT_MODULE_TABS.filter((tab) => tab.key === 'explore');
  }

  return ATTACHMENT_MODULE_TABS.filter((tab) => {
    if (tab.key === 'explore') return true;
    if (tab.key === 'mine') return true;
    if (tab.key === 'pending') return capabilities.canReview;
    if (tab.key === 'categories') return capabilities.canManageCategories;
    if (tab.key === 'permissions') return capabilities.canManagePermissions;
    if (tab.key === 'audit') return capabilities.canViewAudit;
    return false;
  });
}

export function getFallbackAttachmentTab(
  capabilities: AttachmentsCapabilities | null,
): AttachmentModuleTab {
  return getVisibleAttachmentTabs(capabilities)[0]?.key ?? 'explore';
}

export function isAttachmentTabVisible(
  tab: string | null | undefined,
  capabilities: AttachmentsCapabilities | null,
): tab is AttachmentModuleTab {
  if (!tab) return false;
  return getVisibleAttachmentTabs(capabilities).some((item) => item.key === tab);
}
