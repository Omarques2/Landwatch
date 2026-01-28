// apps/web/src/features/admin/api/powerbi.ts
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";

export type RemoteWorkspace = {
  id: string;
  name: string;
  isReadOnly?: boolean;
  type?: string;
};

export type RemoteReport = {
  workspaceId: string;
  id: string;
  name: string;
  datasetId?: string;
  embedUrl?: string;
};

export async function listRemoteWorkspaces() {
  const res = await http.get("/admin/powerbi/remote/workspaces");
  return unwrapData(res.data as ApiEnvelope<RemoteWorkspace[]>);
}

export async function listRemoteReports(workspaceId: string) {
  const res = await http.get("/admin/powerbi/remote/reports", { params: { workspaceId } });
  return unwrapData(res.data as ApiEnvelope<RemoteReport[]>);
}

export async function syncPowerBiCatalog(payload: {
  customerId: string;
  workspaceIds?: string[];
  deactivateMissing?: boolean;
}) {
  const res = await http.post("/admin/powerbi/sync", payload);
  return unwrapData(
    res.data as ApiEnvelope<{
      ok: boolean;
      customerId: string;
      workspacesSeenRemote: number;
      workspacesUpserted: number;
      reportsUpserted: number;
      reportsDeactivated: number;
    }>,
  );
}

export type CustomerCatalog = {
  customer: { id: string; code: string; name: string; status: string };
  workspaces: Array<{
    workspaceRefId: string;
    workspaceId: string;
    name: string;
    isActive: boolean;
    createdAt: string;
    reports: Array<{
      reportRefId: string;
      reportId: string;
      name: string;
      datasetId: string | null;
      isActive: boolean;
      canView: boolean;
      createdAt: string;
    }>;
  }>;
};

export async function getPowerBiCatalog(customerId: string) {
  const res = await http.get("/admin/powerbi/catalog", { params: { customerId } });
  return unwrapData(res.data as ApiEnvelope<CustomerCatalog>);
}

export type GlobalCatalog = {
  workspaces: Array<{
    workspaceRefId: string;
    workspaceId: string;
    name: string;
    isActive: boolean;
    createdAt: string;
    reports: Array<{
      reportRefId: string;
      reportId: string;
      name: string;
      datasetId: string | null;
      isActive: boolean;
      createdAt: string;
    }>;
  }>;
};

export async function getPowerBiGlobalCatalog() {
  const res = await http.get("/admin/powerbi/catalog/global");
  return unwrapData(res.data as ApiEnvelope<GlobalCatalog>);
}

export type AdminEmbedConfig = {
  reportId: string;
  workspaceId: string;
  embedUrl: string;
  embedToken: string;
  expiresOn?: string;
};

export async function getAdminReportPreview(
  reportRefId: string,
  params?: { customerId?: string; userId?: string; forceIdentity?: boolean },
) {
  const res = await http.get(`/admin/powerbi/reports/${reportRefId}/preview`, { params });
  return unwrapData(res.data as ApiEnvelope<AdminEmbedConfig>);
}

export async function unlinkCustomerWorkspace(customerId: string, workspaceRefId: string) {
  const res = await http.post(`/admin/customers/${customerId}/workspaces/${workspaceRefId}/unlink`);
  return unwrapData(
    res.data as ApiEnvelope<{
      ok: boolean;
      workspace: { workspaceRefId: string; isActive: boolean };
      reports: { totalFound: number; permissionsRevoked: number };
    }>,
  );
}

export async function setCustomerReportPermission(customerId: string, reportRefId: string, canView: boolean) {
  const res = await http.put(`/admin/customers/${customerId}/reports/${reportRefId}`, { canView });
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean; workspaceActivated?: boolean }>);
}

export async function setCustomerWorkspacePermission(
  customerId: string,
  workspaceRefId: string,
  payload: { canView: boolean; restoreReports?: boolean },
) {
  const res = await http.put(`/admin/customers/${customerId}/workspaces/${workspaceRefId}`, payload);
  return unwrapData(
    res.data as ApiEnvelope<{
      ok: boolean;
      workspace: { workspaceRefId: string; canView: boolean };
      reportsUpdated: number;
      reportsCreated: number;
    }>,
  );
}

export type ReportPage = {
  id: string;
  pageName: string;
  displayName: string | null;
  pageOrder: number;
  isActive: boolean;
  createdAt: string;
  canView?: boolean;
};

export type PageGroup = {
  id: string;
  name: string;
  isActive: boolean;
  pageIds: string[];
  assigned?: boolean;
};

export async function syncReportPages(reportRefId: string) {
  const res = await http.post(`/admin/powerbi/reports/${reportRefId}/pages/sync`);
  return unwrapData(
    res.data as ApiEnvelope<{
      ok: boolean;
      reportRefId: string;
      pagesUpserted: number;
      pagesDeactivated: number;
      remoteCount: number;
    }>,
  );
}

export async function listReportPages(reportRefId: string) {
  const res = await http.get(`/admin/powerbi/reports/${reportRefId}/pages`);
  return unwrapData(res.data as ApiEnvelope<ReportPage[]>);
}

export async function listPageGroups(reportRefId: string) {
  const res = await http.get(`/admin/powerbi/reports/${reportRefId}/page-groups`);
  return unwrapData(res.data as ApiEnvelope<PageGroup[]>);
}

export async function createPageGroup(reportRefId: string, payload: { name: string; pageIds: string[] }) {
  const res = await http.post(`/admin/powerbi/reports/${reportRefId}/page-groups`, payload);
  return unwrapData(res.data as ApiEnvelope<{ id: string }>);
}

export async function updatePageGroup(groupId: string, payload: { name?: string; isActive?: boolean }) {
  const res = await http.put(`/admin/powerbi/page-groups/${groupId}`, payload);
  return unwrapData(res.data as ApiEnvelope<{ id: string; name: string; isActive: boolean }>);
}

export async function setPageGroupPages(groupId: string, pageIds: string[]) {
  const res = await http.put(`/admin/powerbi/page-groups/${groupId}/pages`, { pageIds });
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}

export async function deletePageGroup(groupId: string) {
  const res = await http.delete(`/admin/powerbi/page-groups/${groupId}`);
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}

export async function getCustomerPageAccess(customerId: string, reportRefId: string) {
  const res = await http.get(`/admin/powerbi/customers/${customerId}/reports/${reportRefId}/pages`);
  return unwrapData(
    res.data as ApiEnvelope<{
      pages: ReportPage[];
      groups: PageGroup[];
    }>,
  );
}

export async function getUserPageAccess(userId: string, reportRefId: string) {
  const res = await http.get(`/admin/powerbi/users/${userId}/reports/${reportRefId}/pages`);
  return unwrapData(
    res.data as ApiEnvelope<{
      pages: ReportPage[];
      groups: PageGroup[];
    }>,
  );
}

export async function setCustomerPageGroup(customerId: string, groupId: string, isActive: boolean) {
  const res = await http.put(`/admin/powerbi/customers/${customerId}/page-groups/${groupId}`, { isActive });
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}

export async function setUserPageGroup(userId: string, groupId: string, isActive: boolean) {
  const res = await http.put(`/admin/powerbi/users/${userId}/page-groups/${groupId}`, { isActive });
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}

export async function setCustomerPageAllow(customerId: string, pageId: string, canView: boolean) {
  const res = await http.put(`/admin/powerbi/customers/${customerId}/pages/${pageId}`, { canView });
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}

export async function setUserPageAllow(userId: string, pageId: string, canView: boolean) {
  const res = await http.put(`/admin/powerbi/users/${userId}/pages/${pageId}`, { canView });
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}
