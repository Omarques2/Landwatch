// apps/web/src/auth/me.ts
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import { isRetryableHttpError, runWithRetryBackoff } from "./resilience";
import { acquireApiToken } from "./auth";
import { isLocalAuthBypassEnabled } from "./local-bypass";
import { getActiveOrgId } from "@/state/org-context";

export type MeResponse = {
  id?: string;
  identityUserId?: string;
  email: string | null;
  displayName: string | null;
  status: "pending" | "active" | "disabled";
  rawStatus?: string;
  memberships?: any[];
};

export type AppFeature =
  | "FARMS"
  | "ANALYSES"
  | "ANALYSIS_CREATE"
  | "CAR_SEARCH"
  | "SCHEDULES"
  | "ATTACHMENTS"
  | "ATTACHMENTS_REVIEW";

export type AccessMeResponse = {
  activeOrg: {
    id: string;
    name: string;
    slug: string;
    status: string;
    kind: "TENANT" | "PLATFORM";
  } | null;
  activeOrgId: string | null;
  orgRole: "owner" | "admin" | "member" | null;
  isPlatformAdmin: boolean;
  isPlatformOrgAdmin: boolean;
  features: AppFeature[];
  permissions: string[];
};

// Discriminated outcome so the navigation guard can tell a real auth failure
// (redirect) from a transient network/5xx blip (keep the user in, retry in bg).
export type MeOutcome =
  | { kind: "ok"; me: MeResponse }
  | { kind: "inactive"; me: MeResponse } // pending/disabled
  | { kind: "unauthorized" } // 401/403
  | { kind: "transient" }; // network / 5xx / timeout after retries

type MeCacheState = {
  outcome: MeOutcome;
  fetchedAt: number;
  inflight?: Promise<MeOutcome>;
};

type AccessCacheState = {
  value: AccessMeResponse | null;
  fetchedAt: number;
  inflight?: Promise<AccessMeResponse | null>;
};

let meCache: MeCacheState | null = null;
// Keyed by active org: /v1/access/me varies by X-Org-Id, so a single global
// cache would leak features/role across orgs when the active org changes.
const accessCacheByOrg = new Map<string, AccessCacheState>();

// Longer TTL so navigating between tabs/detail views within the window reuses
// the cache instead of re-fetching /me + /access/me on every route change.
const TTL_MS = 45_000;

export function clearMeCache() {
  meCache = null;
  accessCacheByOrg.clear();
}

function accessOrgKey(): string {
  return getActiveOrgId() ?? "__no_org__";
}

async function authenticatedGet<T>(
  path: string,
  reason: string,
): Promise<T> {
  const token = await acquireApiToken({ reason });
  if (!token && isLocalAuthBypassEnabled()) {
    const res = await http.get(path);
    return unwrapData(res.data as ApiEnvelope<T>);
  }

  const res = await http.get(path, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return unwrapData(res.data as ApiEnvelope<T>);
}

const ME_RETRY = {
  attempts: 3,
  baseDelayMs: 150,
  maxDelayMs: 1_000,
  jitterMs: 80,
  shouldRetry: (error: unknown) => {
    if (isRetryableHttpError(error)) return true;
    const status = (error as any)?.response?.status;
    // During callback/login redirects token bootstrap may lag briefly.
    return status === undefined || status === null;
  },
};

async function fetchMeOutcome(): Promise<MeOutcome> {
  try {
    const me = await runWithRetryBackoff(
      async () => authenticatedGet<MeResponse>("/v1/users/me", "/v1/users/me"),
      ME_RETRY,
    );
    return me.status === "active" ? { kind: "ok", me } : { kind: "inactive", me };
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) return { kind: "unauthorized" };
    return { kind: "transient" };
  }
}

function hasUsableIdentity(outcome: MeOutcome | undefined): boolean {
  return outcome?.kind === "ok" || outcome?.kind === "inactive";
}

function startMeRevalidate(): Promise<MeOutcome> {
  const inflight = fetchMeOutcome()
    .then((outcome) => {
      // A transient failure must never clobber a good cached identity.
      if (outcome.kind === "transient" && hasUsableIdentity(meCache?.outcome)) {
        meCache = { outcome: meCache!.outcome, fetchedAt: Date.now() };
        return meCache.outcome;
      }
      meCache = { outcome, fetchedAt: Date.now() };
      return outcome;
    })
    .finally(() => {
      if (meCache) delete meCache.inflight;
    });
  meCache = {
    outcome: meCache?.outcome ?? { kind: "transient" },
    fetchedAt: meCache?.fetchedAt ?? 0,
    inflight,
  };
  return inflight;
}

/**
 * Discriminated /users/me result with cache-first + stale-while-revalidate:
 * - fresh cache → return immediately
 * - stale cache with a usable identity → return stale, revalidate in background
 * - no usable cache → await fetch
 * Never throws.
 */
export async function getMeResult(force = false): Promise<MeOutcome> {
  const now = Date.now();
  if (!force && meCache) {
    const fresh = now - meCache.fetchedAt < TTL_MS;
    if (fresh) return meCache.outcome;
    if (hasUsableIdentity(meCache.outcome)) {
      if (!meCache.inflight) void startMeRevalidate();
      return meCache.outcome;
    }
  }
  if (!force && meCache?.inflight) return meCache.inflight;
  return startMeRevalidate();
}

/**
 * Busca /users/me com cache e dedupe. Preserva o contrato antigo
 * (MeResponse | null); nunca lança.
 */
export async function getMeCached(force = false): Promise<MeResponse | null> {
  const outcome = await getMeResult(force);
  return hasUsableIdentity(outcome) ? (outcome as { me: MeResponse }).me : null;
}

function startAccessRevalidate(key: string): Promise<AccessMeResponse | null> {
  const inflight = (async () => {
    try {
      const res = await runWithRetryBackoff(
        async () =>
          authenticatedGet<AccessMeResponse>("/v1/access/me", "/v1/access/me"),
        ME_RETRY,
      );
      accessCacheByOrg.set(key, { value: res, fetchedAt: Date.now() });
      return res;
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) {
        accessCacheByOrg.set(key, { value: null, fetchedAt: Date.now() });
        return null;
      }
      // Transient: preserve last good value for this org.
      const fallback = accessCacheByOrg.get(key)?.value ?? null;
      accessCacheByOrg.set(key, { value: fallback, fetchedAt: Date.now() });
      return fallback;
    } finally {
      const current = accessCacheByOrg.get(key);
      if (current) delete current.inflight;
    }
  })();
  const prev = accessCacheByOrg.get(key);
  accessCacheByOrg.set(key, {
    value: prev?.value ?? null,
    fetchedAt: prev?.fetchedAt ?? 0,
    inflight,
  });
  return inflight;
}

export async function getAccessCached(force = false): Promise<AccessMeResponse | null> {
  const key = accessOrgKey();
  const now = Date.now();
  const cached = accessCacheByOrg.get(key);
  if (!force && cached) {
    const fresh = now - cached.fetchedAt < TTL_MS;
    if (fresh) return cached.value;
    if (cached.value) {
      // stale-while-revalidate
      if (!cached.inflight) void startAccessRevalidate(key);
      return cached.value;
    }
  }
  if (!force && cached?.inflight) return cached.inflight;
  return startAccessRevalidate(key);
}

export async function getAccessStatus(): Promise<MeResponse | null> {
  try {
    return await runWithRetryBackoff(
      async () =>
        authenticatedGet<MeResponse>(
          "/v1/users/access-status",
          "/v1/users/access-status",
        ),
      {
        attempts: 3,
        baseDelayMs: 150,
        maxDelayMs: 1_000,
        jitterMs: 80,
        shouldRetry: (error) => {
          if (isRetryableHttpError(error)) return true;
          const status = (error as any)?.response?.status;
          return status === undefined || status === null;
        },
      },
    );
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      return null;
    }
    throw error;
  }
}
