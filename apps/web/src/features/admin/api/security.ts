// apps/web/src/features/admin/api/security.ts
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";

export type PlatformAdminRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  status: string;
  grantedAt: string;
  appKey: string;
  roleKey: string;
};

export async function listPlatformAdmins(appKey = "PBI_EMBED") {
  const res = await http.get("/admin/security/platform-admins", { params: { appKey } });
  return unwrapData(res.data as ApiEnvelope<PlatformAdminRow[]>);
}

export async function grantPlatformAdmin(input: { appKey?: string; userId?: string; userEmail?: string }) {
  const res = await http.post("/admin/security/platform-admins", {
    appKey: input.appKey ?? "PBI_EMBED",
    roleKey: "platform_admin",
    userId: input.userId,
    userEmail: input.userEmail,
  });
  return unwrapData(res.data as ApiEnvelope<unknown>);
}

export async function revokePlatformAdmin(userId: string, appKey = "PBI_EMBED") {
  const res = await http.delete(`/admin/security/platform-admins/${encodeURIComponent(userId)}`, {
    params: { appKey, roleKey: "platform_admin" },
  });
  return unwrapData(res.data as ApiEnvelope<unknown>);
}
