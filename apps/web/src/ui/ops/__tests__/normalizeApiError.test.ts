import { describe, expect, it } from "vitest";
import { normalizeApiError } from "@/ui/ops/normalizeApiError";

describe("normalizeApiError", () => {
  it("normalizes native Error", () => {
    const err = new Error("ops");
    const out = normalizeApiError(err);
    expect(out.kind).toBe("unknown");
    expect(out.message).toBe("ops");
    expect(out.details?.name).toBe("Error");
  });

  it("handles non-error values", () => {
    const out = normalizeApiError({ nope: true });
    expect(out.kind).toBe("unknown");
    expect(out.message).toBe("Erro inesperado");
    expect(out.details?.raw).toEqual({ nope: true });
  });
});
