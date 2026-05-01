import { ref } from "vue";

type Membership = {
  orgId: string;
  role: string;
  org?: { name?: string | null; slug?: string | null; status?: string | null };
};

const activeOrgId = ref<string | null>(null);

export function setActiveOrgId(orgId: string | null) {
  activeOrgId.value = orgId?.trim() || null;
}

export function getActiveOrgId() {
  return activeOrgId.value;
}

export function hydrateActiveOrgFromMemberships(
  memberships?: Membership[] | null,
) {
  if (!Array.isArray(memberships) || memberships.length === 0) return;
  const current = activeOrgId.value;
  const hasCurrent = memberships.some(
    (item) => item.orgId?.trim() && item.orgId === current,
  );
  if (hasCurrent) return;
  const first = memberships.find((item) => item.orgId?.trim());
  if (first?.orgId) {
    activeOrgId.value = first.orgId;
  }
}

