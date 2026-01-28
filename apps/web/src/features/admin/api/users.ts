// apps/web/src/features/admin/api/users.ts
import { http } from "@/api/http";
import { unwrapData, unwrapPaged, type ApiEnvelope } from "@/api/envelope";
import type { MembershipRole } from "./memberships";

export type PendingUserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_login_at: string | null;
  status: "pending" | "active" | "disabled";
};

export type ActiveUserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_login_at: string | null;
  status: "pending" | "active" | "disabled";
  isPlatformAdmin?: boolean;
};

export type ActivatePayload = {
  customerId: string;
  role: MembershipRole;
  grantCustomerWorkspaces?: boolean;
};

export async function adminMe() {
  const res = await http.get("/admin/me");
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}

export async function listPendingUsers() {
  const res = await http.get("/admin/users/pending");
  return unwrapData(res.data as ApiEnvelope<PendingUserRow[]>);
}

export async function listActiveUsers(
  q = "",
  page = 1,
  pageSize = 25,
  customerIds?: string[],
) {
  const res = await http.get("/admin/users/active", {
    params: { q, page, pageSize, customerIds: customerIds?.join(",") },
  });
  return unwrapPaged(res.data as ApiEnvelope<ActiveUserRow[]>);
}

export async function getUserById(userId: string) {
  const res = await http.get(`/admin/users/${encodeURIComponent(userId)}`);
  return unwrapData(res.data as ApiEnvelope<ActiveUserRow>);
}

export async function activateUser(userId: string, payload: ActivatePayload) {
  const res = await http.post(`/admin/users/${userId}/activate`, payload);
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}

export async function disableUser(userId: string) {
  const res = await http.post(`/admin/users/${userId}/disable`);
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}

export async function setUserStatus(userId: string, status: "active" | "disabled") {
  const res = await http.post(`/admin/users/${userId}/status`, { status });
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean }>);
}
