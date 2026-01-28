type CacheEntry<T> = {
  v: number;
  ts: number;
  data: T;
};

const CACHE_VERSION = 1;

function safeParse<T>(raw: string | null): CacheEntry<T> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

export function readCache<T>(key: string, ttlMs: number) {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  const entry = safeParse<T>(raw);
  if (!entry || entry.v !== CACHE_VERSION) return null;
  const age = Date.now() - entry.ts;
  return { data: entry.data, stale: age > ttlMs, ts: entry.ts };
}

export function writeCache<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  const entry: CacheEntry<T> = { v: CACHE_VERSION, ts: Date.now(), data };
  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore storage errors
  }
}

export function invalidateCache(prefixOrKey: string) {
  if (typeof window === "undefined") return;
  try {
    if (prefixOrKey.endsWith("*")) {
      const prefix = prefixOrKey.slice(0, -1);
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          window.localStorage.removeItem(key);
        }
      }
      return;
    }
    window.localStorage.removeItem(prefixOrKey);
  } catch {
    // ignore storage errors
  }
}

