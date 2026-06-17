import { getActiveOrgId } from "@/state/org-context";

// Generic stale-while-revalidate cache for list/resource responses.
// Mirrors features/analyses/analysis-map-cache.ts (memory + sessionStorage,
// versioned). Keys are scoped by the active org, since list data is org-scoped
// and must never leak across orgs when the active org changes.

type CacheEntry<T> = {
  value: T;
  storedAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const CACHE_PREFIX = "landwatch:list:v1:";
const DEFAULT_TTL_MS = 60_000;

function storageAvailable(): boolean {
  try {
    const testKey = `${CACHE_PREFIX}__test__`;
    window.sessionStorage.setItem(testKey, "1");
    window.sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a cache key from a logical name + params, scoped to the active org.
 * Params are stable-stringified (sorted keys) so equivalent queries hit.
 */
export function listCacheKey(
  name: string,
  params: Record<string, unknown> = {},
): string {
  const org = getActiveOrgId() ?? "__no_org__";
  const stable = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
  return `${CACHE_PREFIX}${org}:${name}:${stable}`;
}

export type ListCacheRead<T> = {
  value: T;
  /** true when older than ttl — caller should still revalidate. */
  stale: boolean;
};

/** Returns the cached value (fresh or stale) or null when absent. */
export function readListCache<T>(
  key: string,
  ttlMs = DEFAULT_TTL_MS,
): ListCacheRead<T> | null {
  const now = Date.now();

  const memory = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memory) {
    return { value: memory.value, stale: now - memory.storedAt > ttlMs };
  }

  if (typeof window === "undefined" || !storageAvailable()) return null;
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed !== "object") return null;
    memoryCache.set(key, parsed);
    return { value: parsed.value, stale: now - parsed.storedAt > ttlMs };
  } catch {
    return null;
  }
}

export function writeListCache<T>(key: string, value: T): void {
  const entry: CacheEntry<T> = { value, storedAt: Date.now() };
  memoryCache.set(key, entry);
  if (typeof window === "undefined" || !storageAvailable()) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore storage failures (quota/private mode)
  }
}

/**
 * Invalidate cache entries. Without args clears everything; with a `name`
 * clears every entry for that logical list (all orgs/params) — use after a
 * mutation so the next visit reflects the change.
 */
export function clearListCache(name?: string): void {
  const matches = (key: string) =>
    name ? key.includes(`:${name}:`) : key.startsWith(CACHE_PREFIX);

  for (const key of [...memoryCache.keys()]) {
    if (matches(key)) memoryCache.delete(key);
  }
  if (typeof window === "undefined" || !storageAvailable()) return;
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith(CACHE_PREFIX) && matches(key)) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // ignore storage failures
  }
}
