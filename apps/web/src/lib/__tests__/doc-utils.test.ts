import { describe, expect, it } from "vitest";
import { isValidCpf, isValidCnpj } from "../doc-utils";

describe("doc-utils", () => {
  it("validates CPF check digits", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
  });

  it("validates CNPJ check digits", () => {
    expect(isValidCnpj("27865757000102")).toBe(true);
    expect(isValidCnpj("27865757000103")).toBe(false);
  });
});
