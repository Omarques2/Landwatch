// apps/web/src/features/admin/api/permissions.ts
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import type { MembershipRole } from "./memberships";

export type UserPermissionsResponse = {
  user: { id: string; email: string | null; displayName: string | null; status: string };
  customerId: string | null;
  customer?: { id: string; code: string; name: string; status: string };
  memberships: Array<{
    customerId: string;
    role: MembershipRole;
    isActive: boolean;
    customer: { id: string; code: string; name: string; status: string };
  }>;
  workspaces: Array<{
    workspaceRefId: string;
    workspaceId: string;
    name: string;
    canView: boolean;
    reports: Array<{
      reportRefId: string;
      reportId: string;
      name: string;
      datasetId: string | null;
      canView: boolean;
    }>;
  }>;
};

export async function getUserPermissions(userId: string, customerId?: string) {
  const res = await http.get(`/admin/users/${userId}/permissions`, { params: { customerId } });
  return unwrapData(res.data as ApiEnvelope<UserPermissionsResponse>);
}

export async function setWorkspacePermission(
  userId: string,
  customerId: string,
  workspaceRefId: string,
  canView: boolean,
  grantReports = true,
) {
  const res = await http.put(`/admin/users/${userId}/workspaces/${workspaceRefId}`, {
    customerId,
    canView,
    grantReports,
  });
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean; reportsAffected?: number }>);
}

export async function setReportPermission(
  userId: string,
  customerId: string,
  reportRefId: string,
  canView: boolean,
) {
  const res = await http.put(`/admin/users/${userId}/reports/${reportRefId}`, { customerId, canView });
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}
