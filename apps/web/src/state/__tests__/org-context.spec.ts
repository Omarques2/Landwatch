import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRejectedOrgs,
  getActiveOrgId,
  hydrateActiveOrgFromMemberships,
  markOrgRejected,
  setActiveOrgId,
} from "@/state/org-context";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function membership(orgId: string) {
  return { orgId, role: "member" };
}

describe("org-context active org selection", () => {
  beforeEach(() => {
    setActiveOrgId(null);
    clearRejectedOrgs();
  });

  it("selects the first membership when none is active", () => {
    hydrateActiveOrgFromMemberships([membership(A), membership(B)]);
    expect(getActiveOrgId()).toBe(A);
  });

  it("keeps the current org when it is still a membership", () => {
    setActiveOrgId(B);
    hydrateActiveOrgFromMemberships([membership(A), membership(B)]);
    expect(getActiveOrgId()).toBe(B);
  });

  it("resets to a valid membership when the current org is not a membership", () => {
    setActiveOrgId("99999999-9999-4999-8999-999999999999");
    hydrateActiveOrgFromMemberships([membership(A)]);
    expect(getActiveOrgId()).toBe(A);
  });

  it("markOrgRejected clears the active org and excludes it from re-selection", () => {
    setActiveOrgId(A);
    markOrgRejected(A);
    expect(getActiveOrgId()).toBeNull();
    // A is rejected → hydrate must pick the next usable org, not A.
    hydrateActiveOrgFromMemberships([membership(A), membership(B)]);
    expect(getActiveOrgId()).toBe(B);
  });

  it("does not pick any org when all memberships are rejected", () => {
    markOrgRejected(A);
    hydrateActiveOrgFromMemberships([membership(A)]);
    expect(getActiveOrgId()).toBeNull();
  });

  it("clearRejectedOrgs allows the org to be selected again", () => {
    markOrgRejected(A);
    clearRejectedOrgs();
    hydrateActiveOrgFromMemberships([membership(A)]);
    expect(getActiveOrgId()).toBe(A);
  });
});
