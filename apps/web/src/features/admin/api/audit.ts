// apps/web/src/features/admin/api/audit.ts
import { http } from "@/api/http";
import { unwrapPaged, type ApiEnvelope } from "@/api/envelope";

export type AuditRow = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actor: { id: string; email: string | null; displayName: string | null } | null;
  ip: string | null;
  userAgent: string | null;
  before: any;
  after: any;
};

export async function listAuditLogs(params: {
  page?: number;
  pageSize?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
}) {
  const res = await http.get("/admin/audit", { params });
  return unwrapPaged(res.data as ApiEnvelope<AuditRow[]>);
}
