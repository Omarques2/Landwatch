// apps/web/src/features/admin/api/memberships.ts
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";

export type MembershipRole = "owner" | "admin" | "member" | "viewer";

export async function upsertUserMembership(userId: string, payload: {
  customerId: string;
  role: MembershipRole;
  isActive?: boolean;
  grantCustomerWorkspaces?: boolean;
  revokeCustomerPermissions?: boolean;
  ensureUserActive?: boolean;
}) {
  const res = await http.post(`/admin/users/${userId}/memberships`, payload);
  return unwrapData(
    res.data as ApiEnvelope<{
      ok: boolean;
      membership: { customerId: string; role: MembershipRole; isActive: boolean };
      granted?: { wsGranted: number; rpGranted: number };
      revoked?: { wsRevoked: number; rpRevoked: number };
    }>,
  );
}

export async function patchUserMembership(userId: string, customerId: string, payload: {
  role?: MembershipRole;
  isActive?: boolean;
  grantCustomerWorkspaces?: boolean;
  revokeCustomerPermissions?: boolean;
}) {
  const res = await http.patch(`/admin/users/${userId}/memberships/${customerId}`, payload);
  return unwrapData(
    res.data as ApiEnvelope<{
      ok: boolean;
      membership: { customerId: string; role: MembershipRole; isActive: boolean };
      granted?: { wsGranted: number; rpGranted: number };
      revoked?: { wsRevoked: number; rpRevoked: number };
    }>,
  );
}

export async function removeUserMembership(userId: string, customerId: string, revokeCustomerPermissions = true) {
  const res = await http.delete(`/admin/users/${userId}/memberships/${customerId}`, {
    params: { revokeCustomerPermissions },
  });
  return unwrapData(
    res.data as ApiEnvelope<{ ok: boolean; revoked?: { wsRevoked: number; rpRevoked: number } }>,
  );
}

export async function transferUserMembership(userId: string, payload: {
  fromCustomerId: string;
  toCustomerId: string;
  toRole: MembershipRole;
  deactivateFrom?: boolean;
  revokeFromCustomerPermissions?: boolean;
  grantToCustomerWorkspaces?: boolean;
  toIsActive?: boolean;
}) {
  const res = await http.post(`/admin/users/${userId}/transfer`, payload);
  return unwrapData(
    res.data as ApiEnvelope<{
      ok: boolean;
      toMembership: { customerId: string; role: MembershipRole; isActive: boolean };
      revokedFrom?: { wsRevoked: number; rpRevoked: number };
      grantedTo?: { wsGranted: number; rpGranted: number };
    }>,
  );
}
