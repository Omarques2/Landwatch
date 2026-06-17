// apps/web/src/composables/__tests__/useCoarsePointer.spec.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCoarsePointer } from "../useCoarsePointer";

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: "(pointer: coarse)",
    addEventListener: (_: string, cb: any) => listeners.add(cb),
    removeEventListener: (_: string, cb: any) => listeners.delete(cb),
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", () => mql);
  return {
    mql,
    emit: (next: boolean) => {
      (mql as any).matches = next;
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
    },
  };
}

describe("useCoarsePointer", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("reflects the initial match", () => {
    stubMatchMedia(true);
    const { isCoarsePointer } = useCoarsePointer();
    expect(isCoarsePointer.value).toBe(true);
  });

  it("updates reactively when the media query changes", () => {
    const { emit } = stubMatchMedia(false);
    const { isCoarsePointer } = useCoarsePointer();
    expect(isCoarsePointer.value).toBe(false);
    emit(true);
    expect(isCoarsePointer.value).toBe(true);
  });
});
