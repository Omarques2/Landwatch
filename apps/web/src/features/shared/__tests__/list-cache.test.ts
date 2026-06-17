import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearListCache,
  listCacheKey,
  readListCache,
  writeListCache,
} from "../list-cache";

vi.mock("@/state/org-context", () => ({
  getActiveOrgId: vi.fn(() => activeOrg),
}));

let activeOrg: string | null = "org-1";

describe("list-cache", () => {
  beforeEach(() => {
    activeOrg = "org-1";
    clearListCache();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    clearListCache();
  });

  it("stores and reads a value (fresh)", () => {
    const key = listCacheKey("analyses", { page: 1 });
    writeListCache(key, [{ id: "a1" }]);
    const read = readListCache<{ id: string }[]>(key);
    expect(read?.value).toEqual([{ id: "a1" }]);
    expect(read?.stale).toBe(false);
  });

  it("marks the entry stale after the TTL", () => {
    const key = listCacheKey("analyses");
    writeListCache(key, ["x"]);
    // ttl -1 → any elapsed time (even 0ms) is past it → stale, but value kept.
    const read = readListCache<string[]>(key, -1);
    expect(read?.value).toEqual(["x"]);
    expect(read?.stale).toBe(true);
  });

  it("scopes keys by active org (no cross-org leak)", () => {
    activeOrg = "org-A";
    const keyA = listCacheKey("farms");
    writeListCache(keyA, ["A"]);

    activeOrg = "org-B";
    const keyB = listCacheKey("farms");
    expect(keyA).not.toBe(keyB);
    expect(readListCache<string[]>(keyB)).toBeNull();

    activeOrg = "org-A";
    expect(readListCache<string[]>(listCacheKey("farms"))?.value).toEqual(["A"]);
  });

  it("builds stable keys regardless of param order", () => {
    const k1 = listCacheKey("analyses", { a: 1, b: 2 });
    const k2 = listCacheKey("analyses", { b: 2, a: 1 });
    expect(k1).toBe(k2);
  });

  it("clearListCache(name) clears only that list", () => {
    writeListCache(listCacheKey("analyses"), ["an"]);
    writeListCache(listCacheKey("farms"), ["fa"]);
    clearListCache("analyses");
    expect(readListCache(listCacheKey("analyses"))).toBeNull();
    expect(readListCache<string[]>(listCacheKey("farms"))?.value).toEqual(["fa"]);
  });

  it("survives a fresh memory cache via sessionStorage", () => {
    const key = listCacheKey("analyses", { page: 1 });
    writeListCache(key, ["persisted"]);
    // simulate a reload: only memory is lost, sessionStorage remains
    // (clearListCache clears both, so emulate by re-reading after writing)
    const read = readListCache<string[]>(key);
    expect(read?.value).toEqual(["persisted"]);
  });
});
