type CacheEntry<T> = {
  value: T;
  storedAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const CACHE_PREFIX = "analysis-map:";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

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

export function getAnalysisMapCache<T>(
  id: string,
  tolerance: number | undefined,
  ttlMs = DEFAULT_TTL_MS,
): T | null {
  const key = `${CACHE_PREFIX}${id}:${tolerance ?? "default"}`;
  const now = Date.now();

  const memory = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memory && now - memory.storedAt <= ttlMs) {
    return memory.value;
  }

  if (typeof window === "undefined" || !storageAvailable()) return null;
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed !== "object") return null;
    if (now - parsed.storedAt > ttlMs) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed.value;
  } catch {
    return null;
  }
}

export function setAnalysisMapCache<T>(
  id: string,
  tolerance: number | undefined,
  value: T,
): void {
  const key = `${CACHE_PREFIX}${id}:${tolerance ?? "default"}`;
  const entry: CacheEntry<T> = { value, storedAt: Date.now() };
  memoryCache.set(key, entry);
  if (typeof window === "undefined" || !storageAvailable()) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore storage failures
  }
}
