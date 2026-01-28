import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";

export type RlsValueType = "text" | "int" | "uuid";
export type RlsDefaultBehavior = "allow" | "deny";
export type RlsTargetStatus = "draft" | "active";
export type RlsRuleOp = "include" | "exclude";

export type RlsTarget = {
  id: string;
  datasetId: string;
  targetKey: string;
  displayName: string;
  factTable: string;
  factColumn: string;
  valueType: RlsValueType;
  defaultBehavior: RlsDefaultBehavior;
  status: RlsTargetStatus;
  createdAt: string;
};

export type RlsRule = {
  id: string;
  targetId: string;
  customerId: string | null;
  userId: string | null;
  op: RlsRuleOp;
  valueText: string | null;
  valueInt: number | null;
  valueUuid: string | null;
  createdAt: string;
};

export type RlsSnapshotTarget = {
  id: string;
  datasetId: string;
  targetKey: string;
  displayName: string;
  factTable: string;
  factColumn: string;
  valueType: RlsValueType;
  defaultBehavior: RlsDefaultBehavior;
  status: RlsTargetStatus;
  createdAt: string;
};

export type RlsSnapshotRule = {
  id: string;
  targetId: string;
  targetKey: string | null;
  targetDisplayName: string | null;
  customerId: string | null;
  customerCode: string | null;
  customerName: string | null;
  userId: string | null;
  userEmail: string | null;
  userDisplayName: string | null;
  op: RlsRuleOp;
  valueText: string | null;
  valueInt: number | null;
  valueUuid: string | null;
  createdAt: string;
};

export type RlsSnapshot = {
  datasetId: string;
  generatedAt: string;
  targets: RlsSnapshotTarget[];
  rules: RlsSnapshotRule[];
};

export type RlsDatasetSummary = {
  datasetId: string;
  reportCount: number;
  workspaceCount: number;
  sampleReportId: string | null;
  sampleReportName: string | null;
  sampleWorkspaceId: string | null;
  sampleWorkspaceName: string | null;
};

export type CreateTargetPayload = {
  targetKey: string;
  displayName: string;
  factTable: string;
  factColumn: string;
  valueType: RlsValueType;
  defaultBehavior?: RlsDefaultBehavior;
  status?: RlsTargetStatus;
};

export type UpdateTargetPayload = Partial<CreateTargetPayload>;

export type CreateRulePayload = {
  customerId?: string;
  userId?: string;
  op: RlsRuleOp;
  valueText?: string | null;
  valueInt?: number | null;
  valueUuid?: string | null;
};

export async function listRlsTargets(datasetId: string) {
  const res = await http.get(`/admin/rls/datasets/${encodeURIComponent(datasetId)}/targets`);
  return unwrapData(res.data as ApiEnvelope<{ items: RlsTarget[] }>);
}

export async function listRlsDatasets() {
  const res = await http.get("/admin/rls/datasets");
  return unwrapData(res.data as ApiEnvelope<{ items: RlsDatasetSummary[] }>);
}

export async function createRlsTarget(datasetId: string, payload: CreateTargetPayload) {
  const res = await http.post(`/admin/rls/datasets/${encodeURIComponent(datasetId)}/targets`, payload);
  return unwrapData(res.data as ApiEnvelope<RlsTarget>);
}

export async function updateRlsTarget(targetId: string, payload: UpdateTargetPayload) {
  const res = await http.patch(`/admin/rls/targets/${encodeURIComponent(targetId)}`, payload);
  return unwrapData(res.data as ApiEnvelope<RlsTarget>);
}

export async function deleteRlsTarget(targetId: string) {
  const res = await http.delete(`/admin/rls/targets/${encodeURIComponent(targetId)}`);
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}

export async function listRlsRules(targetId: string, opts?: { customerId?: string; userId?: string }) {
  const res = await http.get(`/admin/rls/targets/${encodeURIComponent(targetId)}/rules`, {
    params: { customerId: opts?.customerId, userId: opts?.userId },
  });
  return unwrapData(res.data as ApiEnvelope<{ items: RlsRule[] }>);
}

export async function createRlsRules(targetId: string, items: CreateRulePayload[]) {
  const res = await http.post(`/admin/rls/targets/${encodeURIComponent(targetId)}/rules`, { items });
  return unwrapData(res.data as ApiEnvelope<{ created: RlsRule[] }>);
}

export async function deleteRlsRule(ruleId: string) {
  const res = await http.delete(`/admin/rls/rules/${encodeURIComponent(ruleId)}`);
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}

export async function refreshRlsDataset(datasetId: string) {
  const res = await http.post(`/admin/rls/datasets/${encodeURIComponent(datasetId)}/refresh`);
  return unwrapData(
    res.data as ApiEnvelope<{
      status: "queued" | "scheduled" | "running";
      pending?: boolean;
      scheduledAt?: string;
      scheduledInMs?: number;
      refresh?: unknown;
    }>,
  );
}

export async function listRlsRefreshes(datasetId: string) {
  const res = await http.get(`/admin/rls/datasets/${encodeURIComponent(datasetId)}/refreshes`);
  return unwrapData(res.data as ApiEnvelope<{ items: any[] }>);
}

export async function getRlsSnapshot(datasetId: string) {
  const res = await http.get(`/admin/rls/datasets/${encodeURIComponent(datasetId)}/snapshot`);
  return unwrapData(res.data as ApiEnvelope<RlsSnapshot>);
}

export async function getRlsSnapshotCsv(datasetId: string) {
  const res = await http.get(`/admin/rls/datasets/${encodeURIComponent(datasetId)}/snapshot`, {
    params: { format: "csv" },
  });
  return unwrapData(
    res.data as ApiEnvelope<{ content: string; filename: string; contentType: string; generatedAt?: string }>,
  );
}
