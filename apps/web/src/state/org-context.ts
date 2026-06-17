import { ref } from "vue";

type Membership = {
  orgId: string;
  role: string;
  org?: { name?: string | null; slug?: string | null; status?: string | null };
};

const activeOrgId = ref<string | null>(null);

// Orgs the backend rejected for this user this session (e.g. /access/me 403:
// not a member, org disabled, or a PLATFORM org a non-admin cannot use as
// tenant context). We never auto-select a rejected org, so a stale/invalid
// active org can't strand the user on /403 — selection moves to a usable org.
const rejectedOrgs = new Set<string>();

export function setActiveOrgId(orgId: string | null) {
  activeOrgId.value = orgId?.trim() || null;
}

export function getActiveOrgId() {
  return activeOrgId.value;
}

export function markOrgRejected(orgId: string | null | undefined) {
  const value = orgId?.trim();
  if (!value) return;
  rejectedOrgs.add(value);
  if (activeOrgId.value === value) {
    activeOrgId.value = null;
  }
}

export function clearRejectedOrgs() {
  rejectedOrgs.clear();
}

export function hydrateActiveOrgFromMemberships(
  memberships?: Membership[] | null,
) {
  if (!Array.isArray(memberships) || memberships.length === 0) return;
  const usable = memberships.filter(
    (item) => item.orgId?.trim() && !rejectedOrgs.has(item.orgId),
  );
  const current = activeOrgId.value;
  const currentIsUsable = Boolean(
    current && usable.some((item) => item.orgId === current),
  );
  if (currentIsUsable) return;
  // Current org is missing/invalid/rejected → pick the first usable membership
  // (or clear it when none remain, so the guard sends no org rather than a bad one).
  activeOrgId.value = usable[0]?.orgId ?? null;
}
