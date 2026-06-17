import { describe, it, expect } from "vitest";
import { normalizeOrgHeader } from "../org-header";

const UUID = "d5b1f565-ff70-4e54-9a3b-eae0e7e9335d";

describe("normalizeOrgHeader", () => {
  it("returns a valid UUID unchanged", () => {
    expect(normalizeOrgHeader(UUID)).toBe(UUID);
    expect(normalizeOrgHeader(`  ${UUID}  `)).toBe(UUID);
  });

  it("returns null for empty / nullish", () => {
    expect(normalizeOrgHeader(null)).toBeNull();
    expect(normalizeOrgHeader(undefined)).toBeNull();
    expect(normalizeOrgHeader("")).toBeNull();
    expect(normalizeOrgHeader("   ")).toBeNull();
  });

  it('returns null for literal "null"/"undefined"', () => {
    expect(normalizeOrgHeader("null")).toBeNull();
    expect(normalizeOrgHeader("UNDEFINED")).toBeNull();
  });

  it("returns null for non-UUID strings", () => {
    expect(normalizeOrgHeader("org-123")).toBeNull();
    expect(normalizeOrgHeader("not-a-uuid")).toBeNull();
  });
});
