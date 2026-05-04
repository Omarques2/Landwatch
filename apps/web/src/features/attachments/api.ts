import { http } from '@/api/http';
import { unwrapData, type ApiEnvelope } from '@/api/envelope';
import type {
  AttachmentDetailResponse,
  AttachmentFeatureDetailResponse,
  AttachmentEventRow,
  AttachmentReviewer,
  AttachmentReviewerCandidate,
  AttachmentScope,
  AttachmentTargetSelectionResponse,
  AttachmentVisibility,
  AdminCapabilities,
  AdminMembershipRow,
  AdminOrgRow,
  AdminUserRow,
  CategoryRow,
  DatasetRow,
  FeatureAttachmentsResponse,
  FeatureRow,
  GlobalAttachmentEventsResponse,
  PendingAttachmentTargetsResponse,
  WorkspaceAttachmentListResponse,
} from './types';

export type CreateAttachmentPayload = {
  file: File;
  categoryCode: string;
  visibility: AttachmentVisibility;
  targets: Array<{
    datasetCode: string;
    featureId?: string | null;
    featureKey?: string | null;
    naturalId?: string | null;
    scope: AttachmentScope;
    carKey?: string | null;
    validFrom: string;
    validTo?: string | null;
  }>;
};

export async function listFeatureAttachments(
  datasetCode: string,
  featureId: string,
  carKey?: string | null,
) {
  const response = await http.get<ApiEnvelope<FeatureAttachmentsResponse>>(
    `/v1/attachments/features/${encodeURIComponent(datasetCode)}/${encodeURIComponent(featureId)}/attachments`,
    {
      params: carKey ? { carKey } : undefined,
    },
  );
  return unwrapData(response.data);
}

export async function getAttachmentDetail(attachmentId: string) {
  const response = await http.get<ApiEnvelope<AttachmentDetailResponse>>(
    `/v1/attachments/${encodeURIComponent(attachmentId)}`,
  );
  return unwrapData(response.data);
}

export async function getAttachmentFeatureDetail(
  datasetCode: string,
  featureId: string,
) {
  const response = await http.get<ApiEnvelope<AttachmentFeatureDetailResponse>>(
    `/v1/attachments/features/${encodeURIComponent(datasetCode)}/${encodeURIComponent(featureId)}`,
  );
  return unwrapData(response.data);
}

export async function getAttachmentEvents(attachmentId: string) {
  const response = await http.get<ApiEnvelope<AttachmentEventRow[]>>(
    `/v1/attachments/${encodeURIComponent(attachmentId)}/events`,
  );
  return unwrapData(response.data);
}

export async function listMyAttachments(params: {
  status?: string;
  categoryCode?: string;
  datasetCode?: string;
  q?: string;
}) {
  const response = await http.get<ApiEnvelope<WorkspaceAttachmentListResponse>>(
    '/v1/attachments/mine',
    { params },
  );
  return unwrapData(response.data);
}

export async function listPendingAttachmentTargets(params: {
  categoryCode?: string;
  datasetCode?: string;
  q?: string;
}) {
  const response = await http.get<ApiEnvelope<PendingAttachmentTargetsResponse>>(
    '/v1/attachments/pending',
    { params },
  );
  return unwrapData(response.data);
}

export async function approveAttachmentTarget(
  attachmentId: string,
  targetId: string,
  reason?: string,
) {
  const response = await http.post<ApiEnvelope<unknown>>(
    `/v1/attachments/${encodeURIComponent(attachmentId)}/targets/${encodeURIComponent(targetId)}/approve`,
    reason?.trim() ? { reason: reason.trim() } : {},
  );
  return unwrapData(response.data);
}

export async function rejectAttachmentTarget(
  attachmentId: string,
  targetId: string,
  reason: string,
) {
  const response = await http.post<ApiEnvelope<unknown>>(
    `/v1/attachments/${encodeURIComponent(attachmentId)}/targets/${encodeURIComponent(targetId)}/reject`,
    { reason },
  );
  return unwrapData(response.data);
}

export async function listGlobalAttachmentEvents(params: {
  eventType?: string;
  attachmentId?: string;
  actorUserId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const response = await http.get<ApiEnvelope<GlobalAttachmentEventsResponse>>(
    '/v1/attachments/events',
    { params },
  );
  return unwrapData(response.data);
}

export async function listAttachmentReviewers() {
  const response = await http.get<ApiEnvelope<AttachmentReviewer[]>>(
    '/v1/attachments/permissions/reviewers',
  );
  return unwrapData(response.data);
}

export async function listAttachmentReviewerCandidates(q: string) {
  const response = await http.get<ApiEnvelope<AttachmentReviewerCandidate[]>>(
    '/v1/attachments/permissions/candidates',
    { params: { q: q.trim() || undefined } },
  );
  return unwrapData(response.data);
}

export async function addAttachmentReviewer(userId: string) {
  const response = await http.post<ApiEnvelope<AttachmentReviewer>>(
    '/v1/attachments/permissions/reviewers',
    { userId },
  );
  return unwrapData(response.data);
}

export async function removeAttachmentReviewer(userId: string) {
  const response = await http.delete<ApiEnvelope<{ removed: number }>>(
    `/v1/attachments/permissions/reviewers/${encodeURIComponent(userId)}`,
  );
  return unwrapData(response.data);
}

export async function createAttachmentCategory(payload: Partial<CategoryRow>) {
  const response = await http.post<ApiEnvelope<CategoryRow>>(
    '/v1/attachments/categories',
    payload,
  );
  return unwrapData(response.data);
}

export async function updateAttachmentCategory(id: string, payload: Partial<CategoryRow>) {
  const response = await http.patch<ApiEnvelope<CategoryRow>>(
    `/v1/attachments/categories/${encodeURIComponent(id)}`,
    payload,
  );
  return unwrapData(response.data);
}

export async function searchAttachmentFeatures(input: {
  datasetCodes: string[];
  q?: string;
  pageSize?: number;
}) {
  const response = await http.post<
    ApiEnvelope<{
      rows: FeatureRow[];
      nextCursor: string | null;
      pageSize: number;
    }>
  >('/v1/attachments/features/search', {
    datasetCodes: input.datasetCodes,
    q: input.q?.trim() || undefined,
    pageSize: input.pageSize ?? 12,
    includeGeometry: false,
  });
  return unwrapData(response.data);
}

export async function selectFilteredAttachmentTargets(input: {
  datasetCodes: string[];
  q?: string;
  carKey?: string;
  intersectsCarOnly?: boolean;
}) {
  const response = await http.post<ApiEnvelope<AttachmentTargetSelectionResponse>>(
    '/v1/attachments/features/select-filtered',
    {
      datasetCodes: input.datasetCodes,
      q: input.q?.trim() || undefined,
      carKey: input.carKey?.trim() || undefined,
      intersectsCarOnly: input.intersectsCarOnly,
    },
  );
  return unwrapData(response.data);
}

export async function selectAnalysisAttachmentTargets(analysisId: string) {
  const response = await http.get<ApiEnvelope<AttachmentTargetSelectionResponse>>(
    `/v1/attachments/analyses/${encodeURIComponent(analysisId)}/targets`,
  );
  return unwrapData(response.data);
}

export async function createFeatureAttachment(payload: CreateAttachmentPayload) {
  const formData = new FormData();
  formData.append('file', payload.file);
  formData.append(
    'metadata',
    JSON.stringify({
      categoryCode: payload.categoryCode,
      visibility: payload.visibility,
      targets: payload.targets.map((target) => ({
        datasetCode: target.datasetCode,
        featureId: target.featureId ?? undefined,
        featureKey: target.featureKey ?? undefined,
        naturalId: target.naturalId ?? undefined,
        scope: target.scope,
        carKey: target.carKey ?? undefined,
        validFrom: target.validFrom,
        validTo: target.validTo ?? undefined,
      })),
    }),
  );
  const response = await http.post<ApiEnvelope<{ id: string }>>(
    '/v1/attachments',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );
  return unwrapData(response.data);
}

export async function updateAttachment(
  attachmentId: string,
  payload: {
    categoryCode?: string;
    visibility?: AttachmentVisibility;
    note?: string;
  },
) {
  const response = await http.patch<ApiEnvelope<AttachmentDetailResponse>>(
    `/v1/attachments/${encodeURIComponent(attachmentId)}`,
    payload,
  );
  return unwrapData(response.data);
}

export async function addAttachmentTargets(
  attachmentId: string,
  targets: CreateAttachmentPayload['targets'],
) {
  const response = await http.post<ApiEnvelope<AttachmentDetailResponse>>(
    `/v1/attachments/${encodeURIComponent(attachmentId)}/targets`,
    { targets },
  );
  return unwrapData(response.data);
}

export async function updateAttachmentTarget(
  attachmentId: string,
  targetId: string,
  payload: Partial<CreateAttachmentPayload['targets'][number]>,
) {
  const response = await http.patch<ApiEnvelope<unknown>>(
    `/v1/attachments/${encodeURIComponent(attachmentId)}/targets/${encodeURIComponent(targetId)}`,
    payload,
  );
  return unwrapData(response.data);
}

export async function removeAttachmentTarget(
  attachmentId: string,
  targetId: string,
  reason?: string,
) {
  const response = await http.post<ApiEnvelope<unknown>>(
    `/v1/attachments/${encodeURIComponent(attachmentId)}/targets/${encodeURIComponent(targetId)}/remove`,
    reason?.trim() ? { reason: reason.trim() } : {},
  );
  return unwrapData(response.data);
}

export async function revokeAttachment(attachmentId: string) {
  const response = await http.post<ApiEnvelope<AttachmentDetailResponse>>(
    `/v1/attachments/${encodeURIComponent(attachmentId)}/revoke`,
  );
  return unwrapData(response.data);
}

export async function downloadAttachmentFile(attachmentId: string, filenameHint?: string) {
  const response = await http.get<Blob>(
    `/v1/attachments/${encodeURIComponent(attachmentId)}/download`,
    {
      responseType: 'blob',
    },
  );
  const blob = response.data;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filenameHint || 'anexo';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function buildAvailableTargetDatasetCodes(
  datasets: ReadonlyArray<DatasetRow>,
  selectedDatasetCodes: ReadonlyArray<string>,
  primaryFeature: FeatureRow | null,
) {
  const preferred = Array.from(
    new Set([
      ...(primaryFeature?.datasetCode ? [primaryFeature.datasetCode] : []),
      ...selectedDatasetCodes,
    ]),
  );
  if (preferred.length > 0) {
    return preferred;
  }
  return datasets.map((dataset) => dataset.datasetCode);
}

export async function listAdminOrgs() {
  const response = await http.get<ApiEnvelope<AdminOrgRow[]>>('/v1/admin/orgs');
  return unwrapData(response.data);
}

export async function getAdminCapabilities() {
  const response = await http.get<ApiEnvelope<AdminCapabilities>>('/v1/admin/capabilities');
  return unwrapData(response.data);
}

export async function createAdminOrg(payload: { name: string; slug?: string }) {
  const response = await http.post<ApiEnvelope<AdminOrgRow>>('/v1/admin/orgs', payload);
  return unwrapData(response.data);
}

export async function updateAdminOrg(orgId: string, payload: Partial<Pick<AdminOrgRow, 'name' | 'status'>>) {
  const response = await http.patch<ApiEnvelope<AdminOrgRow>>(
    `/v1/admin/orgs/${encodeURIComponent(orgId)}`,
    payload,
  );
  return unwrapData(response.data);
}

export async function listAdminUsers(q?: string) {
  const response = await http.get<ApiEnvelope<AdminUserRow[]>>('/v1/admin/users', {
    params: { q: q?.trim() || undefined },
  });
  return unwrapData(response.data);
}

export async function updateAdminUserStatus(
  userId: string,
  payload: {
    status: 'active' | 'disabled';
    orgId?: string;
    role?: AdminMembershipRow['role'];
  },
) {
  const response = await http.patch<ApiEnvelope<AdminUserRow>>(
    `/v1/admin/users/${encodeURIComponent(userId)}/status`,
    payload,
  );
  return unwrapData(response.data);
}

export async function listAdminMemberships(orgId: string) {
  const response = await http.get<ApiEnvelope<AdminMembershipRow[]>>(
    `/v1/admin/orgs/${encodeURIComponent(orgId)}/memberships`,
  );
  return unwrapData(response.data);
}

export async function addAdminMembership(orgId: string, payload: { userId: string; role: AdminMembershipRow['role'] }) {
  const response = await http.post<ApiEnvelope<AdminMembershipRow>>(
    `/v1/admin/orgs/${encodeURIComponent(orgId)}/memberships`,
    payload,
  );
  return unwrapData(response.data);
}

export async function updateAdminMembership(
  orgId: string,
  userId: string,
  payload: { userId: string; role: AdminMembershipRow['role'] },
) {
  const response = await http.patch<ApiEnvelope<AdminMembershipRow>>(
    `/v1/admin/orgs/${encodeURIComponent(orgId)}/memberships/${encodeURIComponent(userId)}`,
    payload,
  );
  return unwrapData(response.data);
}

export async function removeAdminMembership(orgId: string, userId: string) {
  const response = await http.delete<ApiEnvelope<{ removed: number }>>(
    `/v1/admin/orgs/${encodeURIComponent(orgId)}/memberships/${encodeURIComponent(userId)}`,
  );
  return unwrapData(response.data);
}

export function forceVisibilityForCategory(
  categories: ReadonlyArray<CategoryRow>,
  categoryCode: string,
  requestedVisibility: AttachmentVisibility,
) {
  const category = categories.find((item) => item.code === categoryCode);
  return category?.isJustification ? 'PUBLIC' : requestedVisibility;
}
