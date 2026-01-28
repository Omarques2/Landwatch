// apps/web/src/features/admin/api/overview.ts
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";

export type AdminOverviewDTO = {
  counts: {
    pendingUsers: number;
    inactiveCustomers: number;
    platformAdmins: number;
    workspaces: number;
    reports: number;
  };
  audit: {
    critical: Array<{
      id: string;
      createdAt: string;
      action: string;
      entityType: string;
      entityId: string | null;
      actorUserId: string | null;
      actor: { email: string | null; displayName: string | null } | null;
    }>;
  };
  powerbi: {
    lastSyncAt: string | null;
    lastSyncStatus: "ok" | "fail" | "unknown";
  };
};

export async function getAdminOverview() {
  const res = await http.get("/admin/overview");
  return unwrapData(res.data as ApiEnvelope<AdminOverviewDTO>);
}
