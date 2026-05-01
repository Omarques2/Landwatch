export type AttachmentModuleTab =
  | 'explore'
  | 'mine'
  | 'pending'
  | 'categories'
  | 'permissions'
  | 'audit';

export type DatasetRow = {
  datasetCode: string;
  categoryCode: string;
};

export type CategoryRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isJustification?: boolean;
  requiresApproval?: boolean;
  isPublicDefault?: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type FeatureRow = {
  datasetCode: string;
  categoryCode: string | null;
  featureId: string | null;
  featureKey: string | null;
  naturalId: string | null;
  displayName: string | null;
  geometry?: unknown | null;
};

export type AttachmentFeatureDetailResponse = FeatureRow & {
  attributes: Record<string, unknown>;
  geometry: unknown | null;
};

export type AttachmentTargetSelectionResponse = {
  rows: FeatureRow[];
  totalExceeded: boolean;
  limit: number;
};

export type MapFilterResponse = {
  filterHash: string;
  filterSessionId: string;
  expiresAt: string;
  renderMode: 'mvt' | 'pmtiles';
  stats?: {
    totalFeatures: number;
  };
  vectorSource?: {
    tiles: string[];
    bounds: [number, number, number, number];
    minzoom: number;
    maxzoom: number;
    sourceLayer: string;
    promoteId?: string | null;
  };
  pmtilesSources?: Array<{
    assetId: number;
    datasetCode: string;
    categoryCode: string | null;
    archiveUrl: string;
    bounds: [number, number, number, number];
    minzoom: number;
    maxzoom: number;
    sourceLayer: string;
    promoteId?: string | null;
    featureCount: number;
    snapshotDate: string;
    versionId: number;
  }>;
  mapOptions: {
    minZoom?: number;
    maxZoom?: number;
    centroidMaxZoom?: number;
    centroidHoldMaxMs?: number;
    prefetchMinZoom?: number;
    prefetchTargetZoom?: number;
    prefetchMaxVisibleCentroids?: number;
    prefetchQueueCap?: number;
    prefetchConcurrency?: number;
    prefetchInteractionTileRadius?: number;
    maxBounds?: [[number, number], [number, number]];
    refreshExpiredTiles?: boolean;
  };
};

export type UploadResponse = { id: string };

export type AttachmentVisibility = 'PUBLIC' | 'PRIVATE';
export type AttachmentScope =
  | 'ORG_FEATURE'
  | 'ORG_CAR'
  | 'PLATFORM_FEATURE'
  | 'PLATFORM_CAR';
export type AttachmentStatus =
  | 'PENDING'
  | 'PARTIALLY_APPROVED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVOKED';
export type AttachmentTargetStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'REMOVED';
export type AttachmentEventType =
  | 'CREATED'
  | 'UPDATED'
  | 'TARGET_ADDED'
  | 'TARGET_UPDATED'
  | 'TARGET_APPROVED'
  | 'TARGET_REJECTED'
  | 'TARGET_REMOVED'
  | 'SCOPE_CHANGED'
  | 'VALIDITY_CHANGED'
  | 'VISIBILITY_CHANGED'
  | 'STATUS_CHANGED'
  | 'REVOKED'
  | 'DOWNLOADED'
  | 'ZIP_DOWNLOADED'
  | 'PUBLIC_ACCESS_GRANTED'
  | 'PUBLIC_ACCESS_DENIED';

export type FeatureAttachmentMatchedTarget = {
  id: string;
  datasetCode: string;
  featureId: string | null;
  featureKey: string | null;
  naturalId: string | null;
  carKey: string | null;
  scope: AttachmentScope;
  appliesOrgId: string | null;
  validFrom: string;
  validTo: string | null;
  status: AttachmentTargetStatus;
  reviewReason: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
};

export type FeatureAttachmentSummary = {
  totalAttachments: number;
  approvedCount: number;
  pendingCount: number;
  informativeCount: number;
  justificationCount: number;
  expiredCount: number;
};

export type AttachmentListItem = {
  id: string;
  categoryId: string;
  ownerOrgId: string | null;
  createdByUserId: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: string;
  sha256: string;
  blobProvider: string;
  blobContainer: string;
  blobPath: string;
  blobEtag: string | null;
  visibility: AttachmentVisibility;
  status: AttachmentStatus;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  isJustification: boolean;
  matchedTargets: FeatureAttachmentMatchedTarget[];
  category: {
    id: string;
    code: string;
    name: string;
    isJustification: boolean;
    requiresApproval: boolean;
  };
};

export type FeatureAttachmentsResponse = {
  feature: FeatureRow & {
    attributes: Record<string, unknown>;
    geometry: Record<string, unknown> | null;
  };
  summary: FeatureAttachmentSummary;
  attachments: AttachmentListItem[];
};

export type AttachmentDetailResponse = {
  id: string;
  categoryId: string;
  ownerOrgId: string | null;
  createdByUserId: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: string;
  sha256: string;
  blobProvider: string;
  blobContainer: string;
  blobPath: string;
  blobEtag: string | null;
  visibility: AttachmentVisibility;
  status: AttachmentStatus;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  category: {
    id: string;
    code: string;
    name: string;
    isJustification: boolean;
    requiresApproval: boolean;
  };
  targets: Array<{
    id: string;
    datasetCode: string;
    featureId: string | null;
    featureKey: string | null;
    naturalId: string | null;
    carKey: string | null;
    scope: AttachmentScope;
    appliesOrgId: string | null;
    validFrom: string;
    validTo: string | null;
    status: AttachmentTargetStatus;
    reviewReason: string | null;
    reviewedAt: string | null;
    reviewedByUserId: string | null;
  }>;
};

export type AttachmentEventRow = {
  id: string;
  attachmentId: string;
  attachmentTargetId: string | null;
  actorUserId: string | null;
  actorOrgId: string | null;
  actorIp: string | null;
  eventType: AttachmentEventType;
  payloadJson: unknown;
  createdAt: string;
};

export type CarByKeyResponse = {
  featureKey: string;
  geom: unknown;
};

export type MapFeatureSelectedPayload = {
  datasetCode: string;
  categoryCode: string | null;
  featureId: string | null;
  featureKey: string | null;
  naturalId: string | null;
  displayName: string | null;
};

export type MapLoadStatsPayload = {
  isLoading: boolean;
  totalTiles: number;
  loadedTiles: number;
  erroredTiles: number;
  renderedFeatures: number;
  zoomLevel: number | null;
  centroidHoldFeatures: number;
  prefetchDemand: number;
  prefetchQueued: number;
  prefetchInFlight: number;
  prefetchCompleted: number;
  prefetchFailed: number;
  prefetchAborted: number;
};

export type AttachmentsCapabilities = {
  canUpload: boolean;
  canReview: boolean;
  canManageCategories: boolean;
  canManagePermissions: boolean;
  canViewAudit: boolean;
  allowedScopes: AttachmentScope[];
};

export type AttachmentsQueryState = {
  tab: AttachmentModuleTab;
  datasetCodes: string[];
  featureId: string | null;
  fromAnalysisId: string | null;
  carKey: string;
  q: string;
  intersectsCarOnly: boolean;
};

export type AdminOrgRow = {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'disabled';
  createdAt: string;
  _count?: {
    memberships: number;
    orgUserPermissions: number;
  };
};

export type AdminCapabilities = {
  canAccessAdmin: boolean;
};

export type AdminUserRow = {
  id: string;
  identityUserId: string | null;
  email: string | null;
  displayName: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
};

export type AdminMembershipRow = {
  id: string;
  orgId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    status: string;
  } | null;
  org: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export type AttachmentModuleTabDefinition = {
  key: AttachmentModuleTab;
  label: string;
  description: string;
  availability: 'ready' | 'planned';
};

export type WorkspaceAttachmentItem = AttachmentDetailResponse & {
  category: AttachmentDetailResponse['category'] & {
    code: string;
    name: string;
  };
};

export type WorkspaceAttachmentListResponse = {
  items: WorkspaceAttachmentItem[];
  counts: {
    all: number;
    pending: number;
    approved: number;
    rejected: number;
    revoked: number;
    expired: number;
  };
  nextCursor: string | null;
};

export type PendingAttachmentTargetItem = FeatureAttachmentMatchedTarget & {
  targetId: string;
  attachmentId: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: string;
  attachmentStatus: AttachmentStatus;
  categoryCode: string;
  categoryName: string;
  isJustification: boolean;
  uploaderUserId: string | null;
  uploaderEmail: string | null;
  uploaderName: string | null;
  submittedAt: string;
};

export type PendingAttachmentTargetsResponse = {
  items: PendingAttachmentTargetItem[];
  nextCursor: string | null;
};

export type AttachmentReviewer = {
  id: string;
  orgId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  permission: 'ATTACHMENT_REVIEW';
  createdAt: string;
};

export type AttachmentReviewerCandidate = {
  userId: string;
  email: string | null;
  displayName: string | null;
};

export type GlobalAttachmentEventRow = AttachmentEventRow & {
  actorEmail: string | null;
  actorName: string | null;
  originalFilename: string | null;
  categoryCode: string | null;
  categoryName: string | null;
};

export type GlobalAttachmentEventsResponse = {
  items: GlobalAttachmentEventRow[];
  nextCursor: string | null;
};

export type UploadFormState = {
  categoryCode: string;
  visibility: AttachmentVisibility;
  scope: AttachmentScope;
  validFrom: string;
  validTo: string;
};

export type AttachmentValidityMode = 'period' | 'date' | 'lifetime';
export type AttachmentValidityUnit = 'months' | 'years';

export type AttachmentValidityState = {
  mode: AttachmentValidityMode;
  validFrom: string;
  validTo: string;
  periodValue: number;
  periodUnit: AttachmentValidityUnit;
};
